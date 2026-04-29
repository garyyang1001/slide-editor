#!/usr/bin/env python3
"""
slide-editor — inline browser editor for HTML slide decks.

Usage:
    python3 editor.py path/to/deck.html [options]

Three things this server does:
    1. Serves the deck HTML and injects an editor overlay (toolbar + modals).
    2. Persists slide-level edits back to disk via POST /save-slide
       (with auto-backup before every write).
    3. Queues / runs AI rewrite prompts. Instant rewrites shell out to
       the `claude` CLI; queued prompts are written to prompts.json for
       batch processing in your Claude Code conversation.

Designed around the Ohya Digital design system: paper feel, hairline rules,
no rounded corners, no drop shadows, no emoji, restrained accent red.

License: MIT
"""
import argparse
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
from datetime import datetime


def load_prompts(path):
    if not os.path.exists(path):
        return {"version": 1, "prompts": []}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"version": 1, "prompts": []}


def save_prompts(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def make_backup(deck_path, backup_dir, keep=20):
    os.makedirs(backup_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    base = os.path.splitext(os.path.basename(deck_path))[0]
    dest = os.path.join(backup_dir, f"{base}-{ts}.html")
    shutil.copy2(deck_path, dest)
    backups = sorted(
        (f for f in os.listdir(backup_dir) if f.startswith(base + "-")),
        reverse=True,
    )
    for old in backups[keep:]:
        try:
            os.remove(os.path.join(backup_dir, old))
        except OSError:
            pass
    return dest


# Editor JS template. The string `__SLIDE_SELECTOR__` and `__SLIDE_KEY__`
# are replaced server-side with the configured values before injection.
EDITOR_JS_TEMPLATE = r"""
<script id="__editor__">
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  var SLIDE_SELECTOR = '__SLIDE_SELECTOR__';
  var SLIDE_KEY = '__SLIDE_KEY__';
  function getSlideKey(slide) { return slide ? (slide.getAttribute(SLIDE_KEY) || '') : ''; }

  // ──────────────────────────────────────────────────────────
  // EDITABILITY DETECTION (universal walker)
  // SPAN with no class is treated as inline; SPAN with a class
  // (e.g. <span class="k">) is treated as its own fragment.
  // ──────────────────────────────────────────────────────────
  var INLINE_TAGS = new Set(['B','I','EM','STRONG','SMALL','BR','U','MARK','CODE']);
  function isInlineChild(el) {
    if (INLINE_TAGS.has(el.tagName)) return true;
    if (el.tagName === 'SPAN' && !el.className) return true;
    return false;
  }
  function isLeafLike(el) {
    for (var i = 0; i < el.children.length; i++) {
      if (!isInlineChild(el.children[i])) return false;
    }
    return true;
  }
  var SKIP_TAGS = new Set([
    'BR','IMG','HR','SCRIPT','STYLE','META','LINK',
    'SVG','PATH','RECT','CIRCLE','LINE','POLYLINE','POLYGON','G','DEFS','USE',
    'VIDEO','AUDIO','CANVAS','IFRAME','OBJECT','EMBED'
  ]);

  function pathInSlide(slide, el) {
    var parts = [];
    var cur = el;
    while (cur && cur !== slide) {
      var tag = cur.tagName.toLowerCase();
      var idx = 1;
      var sib = cur.previousElementSibling;
      while (sib) { if (sib.tagName === cur.tagName) idx++; sib = sib.previousElementSibling; }
      parts.unshift(tag + ':nth-of-type(' + idx + ')');
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }
  function shortPreview(text, n) {
    text = (text || '').replace(/\s+/g, ' ').trim();
    return text.length > n ? text.slice(0, n) + '…' : text;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function findSlide(el) { return el.closest(SLIDE_SELECTOR); }

  ready(function () {
    var slides = document.querySelectorAll(SLIDE_SELECTOR);

    slides.forEach(function (slide) {
      slide.querySelectorAll('*').forEach(function (el) {
        if (SKIP_TAGS.has(el.tagName)) return;
        var p = el.parentElement;
        while (p && p !== slide) {
          if (p.contentEditable === 'true') return;
          p = p.parentElement;
        }
        if (!isLeafLike(el)) return;
        if (!el.textContent.replace(/\s/g, '').length) return;
        el.contentEditable = 'true';
        el.spellcheck = false;
      });
    });

    // ──────────────────────────────────────────────────────────
    // STYLES
    // ──────────────────────────────────────────────────────────
    var style = document.createElement('style');
    style.textContent = [
      ':root{',
      '  --ed-ink:#2D2A26;',
      '  --ed-bg:#F5F5F0;',
      '  --ed-gray:#8C8C88;',
      '  --ed-line:#E0E0D8;',
      '  --ed-red:#C84630;',
      '  --ed-bg-soft:#EDEDE6;',
      '  --ed-bg-warm:#FAFAF5;',
      '  --ed-font:"Noto Sans TC","PingFang TC","Heiti TC","Microsoft JhengHei",-apple-system,BlinkMacSystemFont,sans-serif;',
      '  --ed-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
      '  --ed-ease:cubic-bezier(0.25,0.46,0.45,0.94);',
      '}',

      '[contenteditable="true"]{cursor:text;transition:outline-color 280ms var(--ed-ease)}',
      '[contenteditable="true"]:hover{outline:1px solid var(--ed-line);outline-offset:4px}',
      '[contenteditable="true"]:focus{outline:1px solid var(--ed-ink);outline-offset:4px}',
      'body.__pin_mode__,body.__pin_mode__ *{cursor:crosshair !important}',
      'body.__pin_mode__ ' + SLIDE_SELECTOR + ' *:hover{outline:1px solid var(--ed-red) !important;outline-offset:4px}',

      '#__editor_bar__{position:fixed;bottom:24px;right:24px;z-index:2147483647;background:var(--ed-bg-warm);color:var(--ed-ink);border:1px solid var(--ed-ink);font-family:var(--ed-font);font-weight:300;font-size:13px;line-height:1.5;min-width:480px;user-select:none}',
      '#__editor_bar__.__dragging{opacity:0.92}',
      '.__bar_top{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--ed-line);font-size:11px;letter-spacing:0.1em;color:var(--ed-gray);text-transform:uppercase;cursor:move}',
      '.__bar_top:hover{background:rgba(45,42,38,0.03)}',
      '.__bar_brand{color:var(--ed-ink);font-weight:500}',
      '.__bar_sep{color:var(--ed-line)}',
      '.__bar_hint{flex:1;text-transform:none;letter-spacing:0.025em;font-size:12px}',
      '.__bar_help{margin-left:auto;width:24px;height:24px;border:1px solid var(--ed-line);background:transparent;color:var(--ed-gray);font-family:var(--ed-font);font-size:13px;font-weight:500;cursor:pointer;padding:0;line-height:22px;letter-spacing:0}',
      '.__bar_help:hover{border-color:var(--ed-ink);color:var(--ed-ink)}',
      '.__bar_bottom{display:flex;align-items:center;gap:8px;padding:12px 16px;flex-wrap:wrap}',

      '.__btn{font-family:inherit;font-size:12px;letter-spacing:0.1em;font-weight:400;padding:10px 16px;border:1px solid var(--ed-ink);background:transparent;color:var(--ed-ink);cursor:pointer;transition:opacity 280ms var(--ed-ease);white-space:nowrap}',
      '.__btn:hover{opacity:0.85}',
      '.__btn:disabled{opacity:0.4;cursor:wait}',
      '.__btn-ink{background:var(--ed-ink);color:var(--ed-bg)}',
      '.__btn-red{background:var(--ed-red);color:var(--ed-bg);border-color:var(--ed-red)}',
      '.__btn-ghost{background:transparent}',
      '.__btn-ghost:hover{background:var(--ed-ink);color:var(--ed-bg);opacity:1}',

      '#__save_status__{margin-left:auto;font-size:11px;letter-spacing:0.05em;color:var(--ed-gray);min-width:90px;text-align:right;font-weight:400}',
      '#__save_status__.__dirty{color:var(--ed-red)}',
      '#__save_status__.__ok{color:var(--ed-ink)}',

      '.__prompt_dot{position:absolute;z-index:99999;background:var(--ed-red);color:var(--ed-bg);font-family:var(--ed-font);font-size:11px;font-weight:500;letter-spacing:0;width:20px;height:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;transform:translate(-50%,-50%);transition:opacity 280ms var(--ed-ease)}',
      '.__prompt_dot:hover{opacity:0.85}',

      '#__prompt_modal__,#__help_modal__{position:fixed;inset:0;background:rgba(45,42,38,0.55);z-index:2147483646;display:none;align-items:center;justify-content:center;font-family:var(--ed-font);font-weight:300;color:var(--ed-ink)}',
      '#__prompt_modal__.show,#__help_modal__.show{display:flex}',
      '.__pm_card,.__help_card{background:var(--ed-bg);border:1px solid var(--ed-ink);padding:32px;max-width:680px;width:90%;max-height:85vh;overflow:auto;box-sizing:border-box}',
      '.__help_card{max-width:760px}',
      '.__pm_card h3,.__help_card h3{margin:0 0 8px;font-size:18px;letter-spacing:0.025em;font-weight:500;line-height:1.4}',
      '.__pm_subtitle{margin:0 0 24px;font-size:11px;color:var(--ed-gray);letter-spacing:0.1em;text-transform:uppercase}',

      '.__pm_target_tag{font-size:11px;color:var(--ed-gray);letter-spacing:0.1em;display:block;margin-bottom:6px;text-transform:uppercase;font-family:var(--ed-mono)}',
      '.__pm_target{background:var(--ed-bg-warm);border-left:1px solid var(--ed-ink);padding:12px 16px;margin:0 0 24px;font-size:13px;line-height:1.6;max-height:120px;overflow:auto;word-break:break-word;white-space:pre-wrap}',

      '.__pm_card textarea{width:100%;min-height:96px;border:1px solid var(--ed-line);background:var(--ed-bg-warm);padding:12px 16px;font:300 14px/1.6 var(--ed-font);box-sizing:border-box;resize:vertical;color:var(--ed-ink)}',
      '.__pm_card textarea:focus{outline:0;border-color:var(--ed-ink)}',
      '.__pm_card textarea:disabled{opacity:0.55}',

      '.__pm_loading{display:flex;align-items:center;gap:16px;padding:16px 0 0;font-size:12px;color:var(--ed-gray);letter-spacing:0.05em}',
      '.__pm_loading_bar{height:1px;background:var(--ed-line);position:relative;flex:1;overflow:hidden}',
      '.__pm_loading_bar::after{content:"";position:absolute;top:0;left:-30%;width:30%;height:100%;background:var(--ed-ink);animation:__edload 1400ms var(--ed-ease) infinite}',
      '@keyframes __edload{0%{left:-30%}100%{left:100%}}',

      '.__pm_diff{margin-top:24px;padding-top:24px;border-top:1px solid var(--ed-line);display:grid;grid-template-columns:1fr 1fr;gap:16px}',
      '.__pm_diff_label{font-size:11px;color:var(--ed-gray);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px}',
      '.__pm_diff_label.__after{color:var(--ed-red)}',
      '.__pm_preview{background:var(--ed-bg-warm);border:1px solid var(--ed-line);padding:12px 16px;font-size:14px;line-height:1.6;max-height:200px;overflow:auto;word-break:break-word}',
      '.__pm_meta{font-size:11px;color:var(--ed-gray);letter-spacing:0.05em;margin:8px 0 0;grid-column:1/-1;font-family:var(--ed-mono)}',

      '.__pm_existing{margin:24px 0 0;padding:0;list-style:none;border-top:1px solid var(--ed-line)}',
      '.__pm_existing li{padding:12px 0;border-bottom:1px solid var(--ed-line);display:flex;gap:12px;align-items:flex-start;font-size:13px}',
      '.__pm_existing li:last-child{border-bottom:0}',
      '.__pm_existing .__pm_p{flex:1;line-height:1.6}',
      '.__pm_existing .__pm_meta_row{color:var(--ed-gray);font-size:11px;letter-spacing:0.05em;margin-top:4px;font-family:var(--ed-mono)}',
      '.__pm_existing .__pm_del{background:transparent;border:0;color:var(--ed-red);cursor:pointer;font-size:11px;letter-spacing:0.1em;padding:4px 8px;font-family:inherit;text-transform:uppercase}',
      '.__pm_existing .__pm_del:hover{opacity:0.85}',
      '.__pm_existing_head{font-size:11px;letter-spacing:0.1em;color:var(--ed-gray);text-transform:uppercase;padding:8px 0;border-bottom:1px solid var(--ed-line)}',

      '.__pm_actions{display:flex;gap:8px;justify-content:flex-end;margin-top:24px;flex-wrap:wrap}',

      '.__help_close{margin-left:auto;width:32px;height:32px;border:1px solid var(--ed-line);background:transparent;color:var(--ed-gray);font-family:var(--ed-font);font-size:18px;font-weight:300;cursor:pointer;padding:0;line-height:30px}',
      '.__help_close:hover{border-color:var(--ed-ink);color:var(--ed-ink)}',
      '.__help_header{display:flex;align-items:center;gap:16px;margin:0 0 24px}',
      '.__help_section{margin:0 0 32px}',
      '.__help_section:last-of-type{margin-bottom:0}',
      '.__help_section h4{margin:0 0 12px;font-size:14px;font-weight:500;letter-spacing:0.05em;color:var(--ed-ink);padding-bottom:8px;border-bottom:1px solid var(--ed-line)}',
      '.__help_section p{margin:0 0 8px;font-size:14px;line-height:1.7}',
      '.__help_section p:last-child{margin-bottom:0}',
      '.__help_section p.__indent{padding-left:16px;color:var(--ed-gray);font-size:13px}',
      '.__help_keys{width:100%;border-collapse:collapse;font-size:13px;margin:0}',
      '.__help_keys td{padding:10px 16px 10px 0;border-bottom:1px solid var(--ed-line);vertical-align:top;line-height:1.6}',
      '.__help_keys tr:last-child td{border-bottom:0}',
      '.__help_keys td:first-child{white-space:nowrap;width:230px}',
      '.__help_keys td:last-child{color:var(--ed-gray)}',
      '.__help_kbd{display:inline-block;padding:2px 8px;border:1px solid var(--ed-line);background:var(--ed-bg-warm);font-size:11px;letter-spacing:0;font-family:var(--ed-mono);color:var(--ed-ink);margin-right:4px}',

      'body.__move_mode__,body.__move_mode__ *{cursor:grab !important;user-select:none !important}',
      'body.__move_mode__.__dragging,body.__move_mode__.__dragging *{cursor:grabbing !important}',
      'body.__move_mode__ ' + SLIDE_SELECTOR + ' *:hover{outline:1px solid var(--ed-ink) !important;outline-offset:4px}',
      'body.__move_mode__ [contenteditable]{outline:none !important}',
      '#__move_indicator__{position:fixed;bottom:140px;right:24px;z-index:2147483645;background:var(--ed-ink);color:var(--ed-bg);padding:8px 12px;font-family:var(--ed-mono);font-size:11px;letter-spacing:0.05em;display:none;line-height:1.4}',
      '#__move_indicator__.show{display:block}',

      '#__font_toolbar__{position:absolute;z-index:2147483640;background:var(--ed-bg-warm);border:1px solid var(--ed-ink);padding:0;display:none;align-items:center;gap:0;font-family:var(--ed-font);font-weight:300;line-height:1}',
      '#__font_toolbar__.show{display:flex}',
      '.__ft_btn{background:transparent;border:0;padding:8px 14px;font-family:inherit;font-weight:300;color:var(--ed-ink);cursor:pointer;line-height:1;border-right:1px solid var(--ed-line);transition:opacity 280ms var(--ed-ease)}',
      '.__ft_btn:last-child{border-right:0}',
      '.__ft_btn:hover{background:var(--ed-ink);color:var(--ed-bg);opacity:1}',
      '.__ft_minus,.__ft_plus{font-size:18px;line-height:0.7;min-width:36px;text-align:center;font-weight:300}',
      '.__ft_size{padding:8px 14px;font-size:11px;letter-spacing:0.05em;color:var(--ed-gray);font-family:var(--ed-mono);min-width:56px;text-align:center;border-right:1px solid var(--ed-line);user-select:none}',
      '.__ft_reset{font-size:11px;letter-spacing:0.1em;text-transform:uppercase}',

      // Images — drop target highlight, hover affordance, resize handles
      'img.__editor_image__{user-select:none;-webkit-user-drag:none;max-width:none}',
      'img.__editor_image__:hover{outline:1px solid var(--ed-line);outline-offset:2px}',
      'img.__editor_image__.__selected{outline:1px solid var(--ed-ink);outline-offset:2px}',
      SLIDE_SELECTOR + '.__drop_target__{outline:2px solid var(--ed-red);outline-offset:-2px;background:rgba(200,70,48,0.04)}',
      '#__handle_layer__{position:absolute;top:0;left:0;pointer-events:none;z-index:99997}',
      '.__resize_handle__{position:absolute;width:12px;height:12px;background:var(--ed-bg);border:1px solid var(--ed-ink);pointer-events:auto;z-index:99998;transition:background 280ms var(--ed-ease)}',
      '.__resize_handle__:hover{background:var(--ed-ink)}',
      '.__resize_handle__.__nw{cursor:nwse-resize}',
      '.__resize_handle__.__ne{cursor:nesw-resize}',
      '.__resize_handle__.__sw{cursor:nesw-resize}',
      '.__resize_handle__.__se{cursor:nwse-resize}',
      '#__upload_status__{position:fixed;top:24px;right:24px;z-index:2147483645;background:var(--ed-ink);color:var(--ed-bg);padding:8px 16px;font:400 11px/1.5 var(--ed-font);letter-spacing:0.1em;text-transform:uppercase;display:none}',
      '#__upload_status__.show{display:block}',
      ''
    ].join('\n');
    document.head.appendChild(style);

    // ──────────────────────────────────────────────────────────
    // TOOLBAR
    // ──────────────────────────────────────────────────────────
    var bar = document.createElement('div');
    bar.id = '__editor_bar__';
    bar.innerHTML = [
      '<div class="__bar_top">',
      '  <span class="__bar_brand">編輯器</span>',
      '  <span class="__bar_sep">／</span>',
      '  <span class="__bar_hint">點任何文字直接改　·　標記位置讓 AI 改寫</span>',
      '  <button class="__bar_help" id="__help_btn__" title="使用說明（按 ?）">？</button>',
      '</div>',
      '<div class="__bar_bottom">',
      '  <button class="__btn __btn-ghost" id="__pin_btn__" title="標記要 AI 改寫的位置">標記 prompt</button>',
      '  <button class="__btn __btn-ghost" id="__move_btn__" title="拖曳元件改變位置">移動模式</button>',
      '  <button class="__btn __btn-ghost" id="__img_btn__" title="上傳圖片（也可拖檔到 slide）">新增圖片</button>',
      '  <button class="__btn __btn-ghost" id="__queue_btn__" title="查看 prompt 佇列">佇列 ／ <span id="__queue_count__">0</span></button>',
      '  <button class="__btn __btn-ink" id="__save_btn__" title="儲存到檔案（⌘S）">存檔</button>',
      '  <span id="__save_status__">就緒</span>',
      '</div>'
    ].join('');
    document.body.appendChild(bar);

    var saveBtn = document.getElementById('__save_btn__');
    var pinBtn = document.getElementById('__pin_btn__');
    var queueBtn = document.getElementById('__queue_btn__');
    var queueCount = document.getElementById('__queue_count__');
    var helpBtn = document.getElementById('__help_btn__');
    var status = document.getElementById('__save_status__');

    function setStatus(text, level) {
      status.textContent = text;
      status.className = '';
      if (level === 'dirty') status.classList.add('__dirty');
      else if (level === 'ok') status.classList.add('__ok');
    }

    // ──────────────────────────────────────────────────────────
    // TOOLBAR DRAG — let the user move the toolbar so it doesn't
    // permanently cover the bottom-right of their slide.
    // Position is persisted in localStorage. Double-click the
    // top strip to reset to the default (bottom-right).
    // ──────────────────────────────────────────────────────────
    var dragHandle = bar.querySelector('.__bar_top');
    var BAR_POS_KEY = '__slide_editor_bar_pos__';

    function clampToViewport(x, y) {
      var w = bar.offsetWidth;
      var h = bar.offsetHeight;
      var cx = Math.max(8, Math.min(window.innerWidth - w - 8, x));
      var cy = Math.max(8, Math.min(window.innerHeight - h - 8, y));
      return { x: cx, y: cy };
    }

    function applyBarPosition(x, y) {
      var c = clampToViewport(x, y);
      bar.style.left = c.x + 'px';
      bar.style.top = c.y + 'px';
      bar.style.right = 'auto';
      bar.style.bottom = 'auto';
    }

    function resetBarPosition() {
      bar.style.left = '';
      bar.style.top = '';
      bar.style.right = '24px';
      bar.style.bottom = '24px';
      try { localStorage.removeItem(BAR_POS_KEY); } catch (e) {}
    }

    // Restore saved position on load
    try {
      var saved = localStorage.getItem(BAR_POS_KEY);
      if (saved) {
        var pos = JSON.parse(saved);
        if (typeof pos.x === 'number' && typeof pos.y === 'number') {
          // Wait for layout to settle so offsetWidth/Height are correct
          setTimeout(function () { applyBarPosition(pos.x, pos.y); }, 0);
        }
      }
    } catch (e) { /* ignore */ }

    var barDrag = null;
    dragHandle.addEventListener('mousedown', function (e) {
      // Skip clicks on the help button so it remains clickable
      if (e.target.closest('button')) return;
      e.preventDefault();
      var rect = bar.getBoundingClientRect();
      barDrag = {
        startX: e.clientX,
        startY: e.clientY,
        baseX: rect.left,
        baseY: rect.top,
      };
      bar.classList.add('__dragging');
    });
    document.addEventListener('mousemove', function (e) {
      if (!barDrag) return;
      var newX = barDrag.baseX + (e.clientX - barDrag.startX);
      var newY = barDrag.baseY + (e.clientY - barDrag.startY);
      applyBarPosition(newX, newY);
    });
    document.addEventListener('mouseup', function () {
      if (!barDrag) return;
      bar.classList.remove('__dragging');
      var rect = bar.getBoundingClientRect();
      try {
        localStorage.setItem(BAR_POS_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
      } catch (e) {}
      barDrag = null;
    });
    dragHandle.addEventListener('dblclick', function (e) {
      if (e.target.closest('button')) return;
      e.preventDefault();
      resetBarPosition();
    });

    // Re-clamp on window resize so the bar never escapes the viewport.
    window.addEventListener('resize', function () {
      var saved = null;
      try {
        var raw = localStorage.getItem(BAR_POS_KEY);
        if (raw) saved = JSON.parse(raw);
      } catch (e) {}
      if (saved && typeof saved.x === 'number') {
        applyBarPosition(saved.x, saved.y);
      }
    });

    // ──────────────────────────────────────────────────────────
    // SAVE
    // ──────────────────────────────────────────────────────────
    var dirty = new Set();
    document.addEventListener('input', function (e) {
      if (document.body.classList.contains('__pin_mode__')) return;
      var slide = e.target.closest && findSlide(e.target);
      if (slide) {
        var key = getSlideKey(slide);
        if (key) {
          dirty.add(key);
          setStatus(dirty.size + ' 張未存', 'dirty');
        }
      }
    }, true);

    async function saveAll() {
      if (dirty.size === 0) {
        setStatus('沒有變動', '');
        return;
      }
      saveBtn.disabled = true;
      var labels = Array.from(dirty);
      var saved = 0, failed = [];
      setStatus('儲存中…', '');
      for (var i = 0; i < labels.length; i++) {
        var label = labels[i];
        var slide = document.querySelector(SLIDE_SELECTOR + '[' + SLIDE_KEY + '="' + CSS.escape(label) + '"]');
        if (!slide) { failed.push(label); continue; }
        try {
          var r = await fetch('/save-slide', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: label, html: slide.innerHTML })
          });
          if (r.ok) { saved++; dirty.delete(label); }
          else { failed.push(label); }
        } catch (err) { failed.push(label); }
      }
      saveBtn.disabled = false;
      if (failed.length === 0) setStatus('已存 ' + saved + ' 張', 'ok');
      else setStatus('失敗 ' + failed.length + ' ／ 成功 ' + saved, 'dirty');
    }
    saveBtn.addEventListener('click', saveAll);

    function isTyping(el) {
      if (!el) return false;
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return true;
      if (el.isContentEditable) return true;
      return false;
    }

    window.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveAll(); }
      if (e.key === 'Escape') {
        if (document.body.classList.contains('__pin_mode__')) exitPinMode();
        if (document.body.classList.contains('__move_mode__')) exitMoveMode();
        var hm = document.getElementById('__help_modal__');
        if (hm && hm.classList.contains('show')) closeHelp();
      }
      if (e.key === '?' && !isTyping(e.target)) { e.preventDefault(); openHelp(); }
    });

    window.addEventListener('beforeunload', function (e) {
      if (dirty.size > 0) { e.preventDefault(); e.returnValue = ''; }
    });

    // ──────────────────────────────────────────────────────────
    // PROMPT MODAL
    // ──────────────────────────────────────────────────────────
    var modal = document.createElement('div');
    modal.id = '__prompt_modal__';
    modal.innerHTML = [
      '<div class="__pm_card">',
      '  <h3 id="__pm_title__">改寫這段內容</h3>',
      '  <p class="__pm_subtitle" id="__pm_subtitle__"></p>',
      '  <span class="__pm_target_tag">當前內容</span>',
      '  <div class="__pm_target" id="__pm_target__"></div>',
      '  <textarea id="__pm_input__" placeholder="輸入你要怎麼改。例：改成更口語、縮成兩句、換成製造業老闆口吻、加數字佐證…"></textarea>',
      '  <div class="__pm_loading" id="__pm_loading__" style="display:none">',
      '    <span>Claude 正在改寫，約 10–15 秒</span><span class="__pm_loading_bar"></span>',
      '  </div>',
      '  <div class="__pm_diff" id="__pm_diff__" style="display:none">',
      '    <div><div class="__pm_diff_label">改寫前</div><div class="__pm_preview" id="__pm_before__"></div></div>',
      '    <div><div class="__pm_diff_label __after">改寫後</div><div class="__pm_preview" id="__pm_after__"></div></div>',
      '    <p class="__pm_meta" id="__pm_meta__"></p>',
      '  </div>',
      '  <ul class="__pm_existing" id="__pm_existing__"></ul>',
      '  <div class="__pm_actions" id="__pm_actions_default__">',
      '    <button class="__btn __btn-ghost" id="__pm_cancel__">取消</button>',
      '    <button class="__btn" id="__pm_send__">加入佇列</button>',
      '    <button class="__btn __btn-red" id="__pm_now__">立即重寫</button>',
      '  </div>',
      '  <div class="__pm_actions" id="__pm_actions_diff__" style="display:none">',
      '    <button class="__btn __btn-ghost" id="__pm_reject__">丟棄</button>',
      '    <button class="__btn __btn-ghost" id="__pm_retry__">改 prompt 再試</button>',
      '    <button class="__btn __btn-ink" id="__pm_accept__">套用</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);

    var pmTarget = document.getElementById('__pm_target__');
    var pmInput = document.getElementById('__pm_input__');
    var pmSend = document.getElementById('__pm_send__');
    var pmNow = document.getElementById('__pm_now__');
    var pmCancel = document.getElementById('__pm_cancel__');
    var pmExisting = document.getElementById('__pm_existing__');
    var pmTitle = document.getElementById('__pm_title__');
    var pmSubtitle = document.getElementById('__pm_subtitle__');
    var pmLoading = document.getElementById('__pm_loading__');
    var pmDiff = document.getElementById('__pm_diff__');
    var pmBefore = document.getElementById('__pm_before__');
    var pmAfter = document.getElementById('__pm_after__');
    var pmMeta = document.getElementById('__pm_meta__');
    var pmActionsDefault = document.getElementById('__pm_actions_default__');
    var pmActionsDiff = document.getElementById('__pm_actions_diff__');
    var pmAccept = document.getElementById('__pm_accept__');
    var pmReject = document.getElementById('__pm_reject__');
    var pmRetry = document.getElementById('__pm_retry__');

    var currentTarget = null;
    var pendingNewHtml = null;

    function resetModalState() {
      pmLoading.style.display = 'none';
      pmDiff.style.display = 'none';
      pmActionsDefault.style.display = '';
      pmActionsDiff.style.display = 'none';
      pmInput.disabled = false;
      pmSend.disabled = false;
      pmNow.disabled = false;
      pendingNewHtml = null;
    }

    function openModal(el) {
      var slide = findSlide(el);
      if (!slide) return;
      var label = getSlideKey(slide);
      var selector = pathInSlide(slide, el);
      currentTarget = { el: el, slide: slide, label: label, selector: selector };

      pmTitle.textContent = '改寫這段內容';
      pmSubtitle.textContent = '位於 ' + label + '　·　<' + el.tagName.toLowerCase() + '>';
      pmTarget.textContent = shortPreview(el.textContent, 400);
      pmInput.value = '';
      resetModalState();
      renderExisting(label, selector);
      modal.classList.add('show');
      setTimeout(function () { pmInput.focus(); }, 50);
    }

    function closeModal() {
      modal.classList.remove('show');
      resetModalState();
      currentTarget = null;
    }

    pmCancel.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

    async function sendPrompt() {
      if (!currentTarget) return;
      var text = pmInput.value.trim();
      if (!text) { pmInput.focus(); return; }
      pmSend.disabled = true;
      try {
        var r = await fetch('/queue-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: currentTarget.label,
            selector: currentTarget.selector,
            tag: currentTarget.el.tagName.toLowerCase(),
            current_text: currentTarget.el.textContent,
            current_html: currentTarget.el.innerHTML,
            prompt: text
          })
        });
        if (r.ok) {
          pmInput.value = '';
          await refreshAllPrompts();
          renderExisting(currentTarget.label, currentTarget.selector);
        }
      } finally {
        pmSend.disabled = false;
      }
    }
    pmSend.addEventListener('click', sendPrompt);

    async function runAiNow() {
      if (!currentTarget) return;
      var text = pmInput.value.trim();
      if (!text) { pmInput.focus(); return; }
      pmInput.disabled = true;
      pmSend.disabled = true;
      pmNow.disabled = true;
      pmLoading.style.display = '';
      pmDiff.style.display = 'none';
      try {
        var r = await fetch('/ai-edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: currentTarget.label,
            tag: currentTarget.el.tagName.toLowerCase(),
            current_html: currentTarget.el.innerHTML,
            current_text: currentTarget.el.textContent,
            prompt: text
          })
        });
        var data = await r.json();
        if (!data.ok) {
          alert('改寫失敗：' + (data.error || '未知錯誤'));
          resetModalState();
          return;
        }
        pendingNewHtml = data.new_html;
        pmBefore.innerHTML = currentTarget.el.innerHTML;
        pmAfter.innerHTML = pendingNewHtml;
        var meta = [];
        if (data.duration_ms) meta.push('耗時 ' + (data.duration_ms / 1000).toFixed(1) + ' 秒');
        if (data.cost_usd) meta.push('API 等價成本 USD ' + data.cost_usd.toFixed(3));
        pmMeta.textContent = meta.join('　·　');
        pmDiff.style.display = '';
        pmActionsDefault.style.display = 'none';
        pmActionsDiff.style.display = '';
      } catch (err) {
        alert('呼叫失敗：' + err);
        resetModalState();
      } finally {
        pmLoading.style.display = 'none';
        pmInput.disabled = false;
      }
    }
    pmNow.addEventListener('click', runAiNow);

    pmAccept.addEventListener('click', function () {
      if (!currentTarget || pendingNewHtml === null) return;
      currentTarget.el.innerHTML = pendingNewHtml;
      dirty.add(currentTarget.label);
      setStatus(dirty.size + ' 張未存', 'dirty');
      closeModal();
    });
    pmReject.addEventListener('click', closeModal);
    pmRetry.addEventListener('click', function () {
      resetModalState();
      pmInput.focus();
    });

    pmInput.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendPrompt();
    });

    function renderExisting(label, selector) {
      var rows = (window.__prompts__ || []).filter(function (p) {
        return p.status === 'pending' && p.label === label && p.selector === selector;
      });
      if (rows.length === 0) {
        pmExisting.innerHTML = '';
        return;
      }
      pmExisting.innerHTML =
        '<li class="__pm_existing_head">這個位置已經有 ' + rows.length + ' 條 prompt</li>' +
        rows.map(function (p) {
          return '<li><div class="__pm_p">' + escapeHtml(p.prompt) +
                 '<div class="__pm_meta_row">' + new Date(p.created).toLocaleString() + '</div></div>' +
                 '<button class="__pm_del" data-id="' + p.id + '">刪除</button></li>';
        }).join('');
      pmExisting.querySelectorAll('.__pm_del').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          await fetch('/delete-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: btn.dataset.id })
          });
          await refreshAllPrompts();
          if (currentTarget) renderExisting(currentTarget.label, currentTarget.selector);
        });
      });
    }

    // ──────────────────────────────────────────────────────────
    // PIN MODE
    // ──────────────────────────────────────────────────────────
    function enterPinMode() {
      document.body.classList.add('__pin_mode__');
      pinBtn.classList.remove('__btn-ghost');
      pinBtn.classList.add('__btn-red');
      pinBtn.textContent = '點目標元素　·　Esc 取消';
      document.querySelectorAll('[contenteditable="true"]').forEach(function (el) {
        el.dataset.__wasEditable__ = '1';
        el.contentEditable = 'false';
      });
    }
    function exitPinMode() {
      document.body.classList.remove('__pin_mode__');
      pinBtn.classList.remove('__btn-red');
      pinBtn.classList.add('__btn-ghost');
      pinBtn.textContent = '標記 prompt';
      document.querySelectorAll('[data-__was-editable__="1"]').forEach(function (el) {
        el.contentEditable = 'true';
        delete el.dataset.__wasEditable__;
      });
    }
    pinBtn.addEventListener('click', function () {
      if (document.body.classList.contains('__pin_mode__')) exitPinMode();
      else enterPinMode();
    });
    document.addEventListener('click', function (e) {
      if (!document.body.classList.contains('__pin_mode__')) return;
      var target = e.target;
      if (!target || target.closest('#__editor_bar__') || target.closest('#__prompt_modal__')) return;
      var slide = findSlide(target);
      if (!slide) return;
      e.preventDefault();
      e.stopPropagation();
      exitPinMode();
      openModal(target);
    }, true);

    // ──────────────────────────────────────────────────────────
    // MOVE MODE
    // ──────────────────────────────────────────────────────────
    var moveBtn = document.getElementById('__move_btn__');
    var moveIndicator = document.createElement('div');
    moveIndicator.id = '__move_indicator__';
    document.body.appendChild(moveIndicator);

    function enterMoveMode() {
      if (document.body.classList.contains('__pin_mode__')) exitPinMode();
      document.body.classList.add('__move_mode__');
      moveBtn.classList.remove('__btn-ghost');
      moveBtn.classList.add('__btn-red');
      moveBtn.textContent = '移動中　·　Esc 結束';
      document.querySelectorAll('[contenteditable="true"]').forEach(function (el) {
        el.dataset.__wasMoveEditable__ = '1';
        el.contentEditable = 'false';
      });
      moveIndicator.classList.add('show');
      moveIndicator.textContent = '拖曳任何元件即可移動';
    }
    function exitMoveMode() {
      document.body.classList.remove('__move_mode__', '__dragging');
      moveBtn.classList.remove('__btn-red');
      moveBtn.classList.add('__btn-ghost');
      moveBtn.textContent = '移動模式';
      document.querySelectorAll('[data-__was-move-editable__="1"]').forEach(function (el) {
        el.contentEditable = 'true';
        delete el.dataset.__wasMoveEditable__;
      });
      moveIndicator.classList.remove('show');
    }
    moveBtn.addEventListener('click', function () {
      if (document.body.classList.contains('__move_mode__')) exitMoveMode();
      else enterMoveMode();
    });

    function getStageScale(slide) {
      var rect = slide.getBoundingClientRect();
      var stage = document.querySelector('deck-stage');
      var nativeW = 0;
      if (stage) {
        var w = parseFloat(stage.getAttribute('width'));
        if (!isNaN(w) && w > 0) nativeW = w;
      }
      if (!nativeW) nativeW = slide.offsetWidth || rect.width;
      return rect.width / nativeW;
    }

    var dragState = null;
    document.addEventListener('mousedown', function (e) {
      if (!document.body.classList.contains('__move_mode__')) return;
      if (e.target.closest('#__editor_bar__')) return;
      var slide = findSlide(e.target);
      if (!slide) return;
      e.preventDefault();
      var el = e.target;
      var match = (el.style.transform || '').match(/translate\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px\s*\)/);
      var baseX = match ? parseFloat(match[1]) : 0;
      var baseY = match ? parseFloat(match[2]) : 0;
      var scale = getStageScale(slide) || 1;
      dragState = {
        el: el, slide: slide,
        startX: e.clientX, startY: e.clientY,
        baseX: baseX, baseY: baseY, scale: scale
      };
      document.body.classList.add('__dragging');
      moveIndicator.textContent = 'Δ 0, 0 px';
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragState) return;
      var dx = (e.clientX - dragState.startX) / dragState.scale;
      var dy = (e.clientY - dragState.startY) / dragState.scale;
      var newX = dragState.baseX + dx;
      var newY = dragState.baseY + dy;
      dragState.el.style.transform = 'translate(' + newX.toFixed(1) + 'px, ' + newY.toFixed(1) + 'px)';
      moveIndicator.textContent = 'Δ ' + Math.round(newX) + ', ' + Math.round(newY) + ' px';
    });
    document.addEventListener('mouseup', function () {
      if (!dragState) return;
      document.body.classList.remove('__dragging');
      var key = getSlideKey(dragState.slide);
      if (key) {
        dirty.add(key);
        setStatus(dirty.size + ' 張未存', 'dirty');
      }
      var t = dragState.el.style.transform;
      moveIndicator.textContent = '已移動到 ' + (t || '原位') + '　·　雙擊還原';
      dragState = null;
    });
    document.addEventListener('dblclick', function (e) {
      if (!document.body.classList.contains('__move_mode__')) return;
      var slide = findSlide(e.target);
      if (!slide) return;
      e.preventDefault();
      e.target.style.transform = '';
      var key = getSlideKey(slide);
      if (key) {
        dirty.add(key);
        setStatus(dirty.size + ' 張未存', 'dirty');
      }
      moveIndicator.textContent = '已還原 <' + e.target.tagName.toLowerCase() + '>';
    });

    // ──────────────────────────────────────────────────────────
    // FONT-SIZE FLOATING TOOLBAR
    // ──────────────────────────────────────────────────────────
    var fontToolbar = document.createElement('div');
    fontToolbar.id = '__font_toolbar__';
    fontToolbar.innerHTML = [
      '<button class="__ft_btn __ft_minus" id="__ft_minus__" title="縮小 2px（Alt+↓）">−</button>',
      '<span class="__ft_size" id="__ft_size__">16px</span>',
      '<button class="__ft_btn __ft_plus" id="__ft_plus__" title="放大 2px（Alt+↑）">+</button>',
      '<button class="__ft_btn __ft_reset" id="__ft_reset__" title="還原預設大小">RESET</button>'
    ].join('');
    document.body.appendChild(fontToolbar);

    var ftMinus = document.getElementById('__ft_minus__');
    var ftPlus = document.getElementById('__ft_plus__');
    var ftReset = document.getElementById('__ft_reset__');
    var ftSize = document.getElementById('__ft_size__');

    var focusedEditable = null;

    function positionFontToolbar(el) {
      if (!el) return;
      var rect = el.getBoundingClientRect();
      fontToolbar.classList.add('show');
      var ftRect = fontToolbar.getBoundingClientRect();
      var top = rect.top + window.scrollY - ftRect.height - 8;
      if (rect.top < ftRect.height + 16) top = rect.bottom + window.scrollY + 8;
      var left = rect.left + window.scrollX;
      var maxLeft = window.scrollX + window.innerWidth - ftRect.width - 8;
      if (left > maxLeft) left = maxLeft;
      if (left < window.scrollX + 8) left = window.scrollX + 8;
      fontToolbar.style.top = top + 'px';
      fontToolbar.style.left = left + 'px';
      var size = parseFloat(getComputedStyle(el).fontSize);
      ftSize.textContent = Math.round(size) + 'px';
    }

    document.addEventListener('focusin', function (e) {
      var t = e.target;
      if (!t || !t.isContentEditable) return;
      if (t.closest('#__prompt_modal__') || t.closest('#__help_modal__') || t.closest('#__editor_bar__')) return;
      if (document.body.classList.contains('__pin_mode__') || document.body.classList.contains('__move_mode__')) return;
      focusedEditable = t;
      positionFontToolbar(t);
    });
    document.addEventListener('focusout', function () {
      setTimeout(function () {
        if (!document.activeElement || !document.activeElement.isContentEditable) {
          fontToolbar.classList.remove('show');
          focusedEditable = null;
        }
      }, 50);
    });

    fontToolbar.addEventListener('mousedown', function (e) { e.preventDefault(); });

    function changeFontSize(delta) {
      if (!focusedEditable) return;
      var current = parseFloat(focusedEditable.style.fontSize) || parseFloat(getComputedStyle(focusedEditable).fontSize);
      var next = Math.max(8, Math.min(160, current + delta));
      focusedEditable.style.fontSize = next + 'px';
      ftSize.textContent = Math.round(next) + 'px';
      var slide = findSlide(focusedEditable);
      var key = slide ? getSlideKey(slide) : '';
      if (key) {
        dirty.add(key);
        setStatus(dirty.size + ' 張未存', 'dirty');
      }
      positionFontToolbar(focusedEditable);
    }
    ftMinus.addEventListener('click', function () { changeFontSize(-2); });
    ftPlus.addEventListener('click', function () { changeFontSize(2); });
    ftReset.addEventListener('click', function () {
      if (!focusedEditable) return;
      focusedEditable.style.fontSize = '';
      var slide = findSlide(focusedEditable);
      var key = slide ? getSlideKey(slide) : '';
      if (key) {
        dirty.add(key);
        setStatus(dirty.size + ' 張未存', 'dirty');
      }
      setTimeout(function () { positionFontToolbar(focusedEditable); }, 0);
    });

    window.addEventListener('keydown', function (e) {
      if (!focusedEditable) return;
      if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); changeFontSize(2); }
      if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); changeFontSize(-2); }
    });

    var fontTbReposition = function () {
      if (focusedEditable && fontToolbar.classList.contains('show')) positionFontToolbar(focusedEditable);
    };
    window.addEventListener('scroll', fontTbReposition, true);
    window.addEventListener('resize', fontTbReposition);

    // ──────────────────────────────────────────────────────────
    // IMAGE UPLOAD & MANIPULATION
    // - drag-drop file onto slide → uploads, inserts at drop point
    // - toolbar "新增圖片" button → file picker, inserts at slide center
    // - click image → 4 corner resize handles, drag to scale (locked aspect)
    // - Backspace / Delete with image selected → remove
    // - move mode still applies (transform:translate adds on top)
    // ──────────────────────────────────────────────────────────
    var imgBtn = document.getElementById('__img_btn__');
    var imgInput = document.createElement('input');
    imgInput.type = 'file';
    imgInput.accept = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml';
    imgInput.style.display = 'none';
    document.body.appendChild(imgInput);

    var uploadStatus = document.createElement('div');
    uploadStatus.id = '__upload_status__';
    document.body.appendChild(uploadStatus);
    function flashUploadStatus(text, ms) {
      uploadStatus.textContent = text;
      uploadStatus.classList.add('show');
      clearTimeout(uploadStatus.__t);
      uploadStatus.__t = setTimeout(function () {
        uploadStatus.classList.remove('show');
      }, ms || 2400);
    }

    async function uploadImageFile(file) {
      if (!file) return null;
      if (!/^image\//.test(file.type)) {
        alert('只能上傳圖片檔。');
        return null;
      }
      var fd = new FormData();
      fd.append('image', file);
      flashUploadStatus('上傳中…', 60000);
      try {
        var r = await fetch('/upload-image', { method: 'POST', body: fd });
        var data = await r.json();
        if (!data.ok) {
          flashUploadStatus('上傳失敗', 2000);
          alert('上傳失敗：' + (data.error || '未知錯誤'));
          return null;
        }
        flashUploadStatus('上傳完成', 1500);
        return data.src;
      } catch (err) {
        flashUploadStatus('上傳失敗', 2000);
        alert('上傳失敗：' + err);
        return null;
      }
    }

    function insertImageAt(slide, src, slideX, slideY, defaultWidth) {
      // slideX/Y are in slide-local coords (pre-scale).  null means center.
      var img = document.createElement('img');
      img.src = src;
      img.className = '__editor_image__';
      img.draggable = false;
      img.alt = '';
      var w = defaultWidth || 320;
      var styleParts = [
        'position:absolute',
        'width:' + w + 'px',
        'height:auto',
      ];
      if (slideX === null || slideY === null) {
        styleParts.push('left:50%');
        styleParts.push('top:50%');
        styleParts.push('transform:translate(-50%,-50%)');
      } else {
        // Place so that drop point is image center
        styleParts.push('left:' + Math.round(slideX - w / 2) + 'px');
        styleParts.push('top:' + Math.round(slideY - w / 3) + 'px');
      }
      img.setAttribute('style', styleParts.join(';'));
      slide.appendChild(img);
      var key = getSlideKey(slide);
      if (key) {
        dirty.add(key);
        setStatus(dirty.size + ' 張未存', 'dirty');
      }
      return img;
    }

    // ─── Identify the slide the user is currently looking at ───
    // Strategy chain:
    //   1. deck-stage style: an element with [data-deck-active] attribute
    //   2. Visible slide: not display:none, not opacity:0, has nonzero rect
    //   3. Closest to viewport center (for scrolling decks)
    //   4. First slide as last resort
    function getActiveSlide() {
      var marked = document.querySelector(SLIDE_SELECTOR + '[data-deck-active]');
      if (marked) return marked;

      var allSlides = document.querySelectorAll(SLIDE_SELECTOR);
      if (!allSlides.length) return null;

      // Visibility-based detection (works for stacked decks even without the marker attr)
      var visible = [];
      allSlides.forEach(function (s) {
        var cs = getComputedStyle(s);
        if (cs.display === 'none') return;
        if (parseFloat(cs.opacity || '1') < 0.05) return;
        if (cs.visibility === 'hidden') return;
        var rect = s.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;
        visible.push({ slide: s, rect: rect });
      });
      if (visible.length === 1) return visible[0].slide;

      // Multiple visible (scrolling deck) — pick the one closest to viewport center
      var midY = window.innerHeight / 2;
      var best = null, bestDist = Infinity;
      visible.forEach(function (v) {
        var sMid = (v.rect.top + v.rect.bottom) / 2;
        var d = Math.abs(sMid - midY);
        if (d < bestDist) { bestDist = d; best = v.slide; }
      });
      return best || allSlides[0];
    }

    // ─── Toolbar button → file picker → upload → auto-insert at active slide ───
    imgBtn.addEventListener('click', function () { imgInput.click(); });
    imgInput.addEventListener('change', async function (e) {
      var file = e.target.files && e.target.files[0];
      imgInput.value = '';
      if (!file) return;
      var slide = getActiveSlide();
      if (!slide) {
        alert('找不到當前 slide');
        return;
      }
      var src = await uploadImageFile(file);
      if (!src) return;
      // Auto-place at the center of the active slide. User can drag in move mode.
      var img = insertImageAt(slide, src, null, null, 320);
      // Auto-select so resize handles appear, plus give user a hint about positioning.
      setTimeout(function () {
        if (selectedImage) selectedImage.classList.remove('__selected');
        selectedImage = img;
        img.classList.add('__selected');
        showHandles(img);
        flashUploadStatus('已插入　·　拖角縮放　·　移動模式可拖曳位置', 3500);
      }, 100);
    });

    // ─── Drag-drop onto slides ───
    var dragHoverSlide = null;
    document.addEventListener('dragover', function (e) {
      if (!e.dataTransfer) return;
      var hasFile = false;
      if (e.dataTransfer.types) {
        for (var i = 0; i < e.dataTransfer.types.length; i++) {
          if (e.dataTransfer.types[i] === 'Files') { hasFile = true; break; }
        }
      }
      if (!hasFile) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      var slide = findSlide(e.target);
      if (slide !== dragHoverSlide) {
        if (dragHoverSlide) dragHoverSlide.classList.remove('__drop_target__');
        dragHoverSlide = slide;
        if (dragHoverSlide) dragHoverSlide.classList.add('__drop_target__');
      }
    });
    document.addEventListener('dragleave', function (e) {
      if (e.relatedTarget === null) {
        if (dragHoverSlide) dragHoverSlide.classList.remove('__drop_target__');
        dragHoverSlide = null;
      }
    });
    document.addEventListener('drop', async function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
      var slide = findSlide(e.target);
      if (!slide) return;
      e.preventDefault();
      if (dragHoverSlide) dragHoverSlide.classList.remove('__drop_target__');
      dragHoverSlide = null;

      var rect = slide.getBoundingClientRect();
      var scale = getStageScale(slide) || 1;
      var localX = (e.clientX - rect.left) / scale;
      var localY = (e.clientY - rect.top) / scale;

      var file = e.dataTransfer.files[0];
      var src = await uploadImageFile(file);
      if (!src) return;
      insertImageAt(slide, src, localX, localY, 320);
    });

    // ─── Selection + resize handles ───
    var handleLayer = document.createElement('div');
    handleLayer.id = '__handle_layer__';
    document.body.appendChild(handleLayer);

    var selectedImage = null;

    function clearSelection() {
      if (selectedImage) selectedImage.classList.remove('__selected');
      selectedImage = null;
      handleLayer.innerHTML = '';
    }

    function showHandles(img) {
      handleLayer.innerHTML = '';
      var rect = img.getBoundingClientRect();
      var corners = [
        { name: 'nw', x: rect.left, y: rect.top },
        { name: 'ne', x: rect.right, y: rect.top },
        { name: 'sw', x: rect.left, y: rect.bottom },
        { name: 'se', x: rect.right, y: rect.bottom },
      ];
      corners.forEach(function (c) {
        var h = document.createElement('div');
        h.className = '__resize_handle__ __' + c.name;
        h.dataset.corner = c.name;
        h.style.left = (c.x + window.scrollX - 6) + 'px';
        h.style.top = (c.y + window.scrollY - 6) + 'px';
        handleLayer.appendChild(h);
      });
    }

    document.addEventListener('mousedown', function (e) {
      // Skip if pin or move mode is active — those have their own handlers.
      if (document.body.classList.contains('__pin_mode__') ||
          document.body.classList.contains('__move_mode__')) return;
      if (e.target.classList && e.target.classList.contains('__resize_handle__')) return;

      if (e.target.tagName === 'IMG' &&
          e.target.classList.contains('__editor_image__') &&
          findSlide(e.target)) {
        if (selectedImage !== e.target) {
          if (selectedImage) selectedImage.classList.remove('__selected');
          selectedImage = e.target;
          selectedImage.classList.add('__selected');
        }
        showHandles(selectedImage);
      } else if (selectedImage && !e.target.closest('#__handle_layer__') && !e.target.closest('#__editor_bar__')) {
        clearSelection();
      }
    }, true);

    // Drag corner → resize
    var resizeState = null;
    handleLayer.addEventListener('mousedown', function (e) {
      if (!e.target.classList.contains('__resize_handle__')) return;
      e.preventDefault();
      e.stopPropagation();
      if (!selectedImage) return;
      var slide = findSlide(selectedImage);
      var scale = getStageScale(slide) || 1;
      resizeState = {
        img: selectedImage,
        slide: slide,
        corner: e.target.dataset.corner,
        startX: e.clientX,
        startY: e.clientY,
        baseWidth: selectedImage.offsetWidth,
        baseHeight: selectedImage.offsetHeight,
        aspect: selectedImage.offsetWidth / Math.max(1, selectedImage.offsetHeight),
        scale: scale,
      };
      document.body.style.cursor = (resizeState.corner === 'ne' || resizeState.corner === 'sw') ? 'nesw-resize' : 'nwse-resize';
    });
    document.addEventListener('mousemove', function (e) {
      if (!resizeState) return;
      var dx = (e.clientX - resizeState.startX) / resizeState.scale;
      var corner = resizeState.corner;
      var newWidth;
      if (corner === 'ne' || corner === 'se') newWidth = resizeState.baseWidth + dx;
      else newWidth = resizeState.baseWidth - dx;
      newWidth = Math.max(20, Math.min(4000, newWidth));
      var newHeight = newWidth / resizeState.aspect;
      resizeState.img.style.width = Math.round(newWidth) + 'px';
      resizeState.img.style.height = Math.round(newHeight) + 'px';
      showHandles(resizeState.img);
    });
    document.addEventListener('mouseup', function () {
      if (!resizeState) return;
      document.body.style.cursor = '';
      var key = getSlideKey(resizeState.slide);
      if (key) {
        dirty.add(key);
        setStatus(dirty.size + ' 張未存', 'dirty');
      }
      resizeState = null;
    });

    // Backspace / Delete deletes the selected image
    window.addEventListener('keydown', function (e) {
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedImage && !isTyping(e.target)) {
        e.preventDefault();
        var slide = findSlide(selectedImage);
        var key = slide ? getSlideKey(slide) : '';
        selectedImage.remove();
        clearSelection();
        if (key) {
          dirty.add(key);
          setStatus(dirty.size + ' 張未存', 'dirty');
        }
      }
    });

    // Reposition handles on scroll/resize/edit
    var handleReposition = function () {
      if (selectedImage && document.body.contains(selectedImage)) showHandles(selectedImage);
      else if (selectedImage) clearSelection();
    };
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);

    // ──────────────────────────────────────────────────────────
    // PENDING-PROMPT MARKERS
    // ──────────────────────────────────────────────────────────
    var dotLayer = document.createElement('div');
    dotLayer.id = '__dot_layer__';
    dotLayer.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:99998';
    document.body.appendChild(dotLayer);

    function refreshDots() {
      dotLayer.innerHTML = '';
      var pending = (window.__prompts__ || []).filter(function (p) { return p.status === 'pending'; });
      var groups = {};
      pending.forEach(function (p) {
        var k = p.label + '||' + p.selector;
        (groups[k] = groups[k] || []).push(p);
      });
      Object.keys(groups).forEach(function (k) {
        var g = groups[k];
        var first = g[0];
        var slide = document.querySelector(SLIDE_SELECTOR + '[' + SLIDE_KEY + '="' + CSS.escape(first.label) + '"]');
        if (!slide) return;
        var el;
        try { el = first.selector ? slide.querySelector(first.selector) : slide; } catch (err) { return; }
        if (!el) return;
        var rect = el.getBoundingClientRect();
        var dot = document.createElement('div');
        dot.className = '__prompt_dot';
        dot.textContent = g.length;
        dot.title = g.length + ' 條 prompt 待處理（點開查看）';
        dot.style.left = (rect.right + window.scrollX) + 'px';
        dot.style.top = (rect.top + window.scrollY) + 'px';
        dot.style.pointerEvents = 'auto';
        dot.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation(); openModal(el);
        });
        dotLayer.appendChild(dot);
      });
      queueCount.textContent = pending.length;
    }

    async function refreshAllPrompts() {
      try {
        var r = await fetch('/list-prompts');
        if (r.ok) {
          var data = await r.json();
          window.__prompts__ = data.prompts || [];
          refreshDots();
        }
      } catch (e) { /* ignore */ }
    }

    queueBtn.addEventListener('click', function () {
      var pending = (window.__prompts__ || []).filter(function (p) { return p.status === 'pending'; });
      if (pending.length === 0) {
        alert('佇列是空的。\n\n按「標記 prompt」開始選取要 AI 改寫的位置。');
        return;
      }
      var msg = '目前佇列裡有 ' + pending.length + ' 條 prompt：\n\n';
      pending.forEach(function (p, i) {
        msg += (i + 1) + '. [' + p.label + '] ' + shortPreview(p.current_text, 30) + '\n   → ' + p.prompt + '\n\n';
      });
      msg += '處理方式：\n· 回 Claude Code 對話框輸入「跑 queue」→ 會逐條處理並自動清空\n· 或按「確定」清空整個佇列重來';
      if (confirm(msg)) {
        if (confirm('確定要清空 ' + pending.length + ' 條 prompt？這個動作無法復原。')) {
          fetch('/clear-prompts', { method: 'POST' }).then(function () { return refreshAllPrompts(); });
        }
      }
    });

    // ──────────────────────────────────────────────────────────
    // HELP OVERLAY
    // ──────────────────────────────────────────────────────────
    var helpModal = document.createElement('div');
    helpModal.id = '__help_modal__';
    helpModal.innerHTML = [
      '<div class="__help_card">',
      '  <div class="__help_header">',
      '    <h3>編輯器使用說明</h3>',
      '    <button class="__help_close" id="__help_close__" title="關閉（Esc）">×</button>',
      '  </div>',
      '  <div class="__help_section">',
      '    <h4>這是什麼</h4>',
      '    <p>瀏覽器內的 HTML 簡報所見即所得編輯器。改完直接寫回原檔。</p>',
      '    <p>四種編輯方式並存：手動改文字、移動元件、調整字級、對某段下指令讓 AI 改寫。</p>',
      '  </div>',
      '  <div class="__help_section">',
      '    <h4>方式一　手動編輯</h4>',
      '    <p>滑鼠移到任何文字上，會看到淡灰色細線框 → 點下去 → 直接打字、刪字。</p>',
      '    <p>所有 slide 內的文字都自動可編輯，不用切換模式。</p>',
      '  </div>',
      '  <div class="__help_section">',
      '    <h4>方式二　AI 改寫</h4>',
      '    <p>1.　點工具列「標記 prompt」按鈕，按鈕變紅、游標變準心。</p>',
      '    <p>2.　在 slide 上點你要改寫的元素 → 跳出對話框。</p>',
      '    <p>3.　輸入指令，例如：</p>',
      '    <p class="__indent">改成更口語的版本</p>',
      '    <p class="__indent">縮成兩句話</p>',
      '    <p class="__indent">換成製造業老闆會講的口吻</p>',
      '    <p class="__indent">加一個具體數字佐證</p>',
      '    <p>4.　兩個按鈕擇一：</p>',
      '    <p class="__indent"><b>加入佇列</b>　存到 prompts.json，回 Claude Code 對話框說「跑」一次處理多筆</p>',
      '    <p class="__indent"><b>立即重寫</b>　當下呼叫 Claude，10–15 秒後跳出改寫前／改寫後對照，可接受或丟棄</p>',
      '  </div>',
      '  <div class="__help_section">',
      '    <h4>方式三　移動元件</h4>',
      '    <p>1.　點工具列「移動模式」按鈕，按鈕變紅、游標變抓手。</p>',
      '    <p>2.　拖曳任何元件即可移動，右下角會顯示位移量（Δ X, Y px）。</p>',
      '    <p>3.　雙擊元件可以還原到原位。</p>',
      '    <p>4.　位移用 transform: translate 寫在 inline style，原本版面不會崩。</p>',
      '  </div>',
      '  <div class="__help_section">',
      '    <h4>方式四　改文字大小</h4>',
      '    <p>點任何文字 → 上方會浮出小工具列：</p>',
      '    <p class="__indent"><b>−</b> 縮小 2px　／　<b>+</b> 放大 2px　／　<b>RESET</b> 還原預設</p>',
      '    <p>大小寫進元素的 inline font-size，跟著 ⌘S 一起存檔。</p>',
      '  </div>',
      '  <div class="__help_section">',
      '    <h4>方式五　插入與調整圖片</h4>',
      '    <p>兩種方法上傳：</p>',
      '    <p class="__indent">·　<b>拖檔</b>　把圖片從 Finder 拖進瀏覽器，落在哪張 slide 上，圖就放在拖放點</p>',
      '    <p class="__indent">·　<b>按鈕</b>　點工具列「新增圖片」→ 選檔 → 自動放在當前看的那張 slide 中央，並自動選中（出現縮放 handle）</p>',
      '    <p>圖片會存進 deck 旁邊的 <span class="__help_kbd">images/</span> 資料夾，HTML 用相對路徑引用。</p>',
      '    <p>插入後可以：</p>',
      '    <p class="__indent">·　<b>移動</b>　開移動模式拖曳，跟其他元件一樣</p>',
      '    <p class="__indent">·　<b>縮放</b>　點圖片 → 四個角出現方塊 handle → 拖角縮放（鎖定長寬比）</p>',
      '    <p class="__indent">·　<b>刪除</b>　選中圖片按 <span class="__help_kbd">Backspace</span> 或 <span class="__help_kbd">Delete</span></p>',
      '    <p>支援格式：jpg / png / webp / gif / svg，單檔上限 10 MB。</p>',
      '  </div>',
      '  <div class="__help_section">',
      '    <h4>儲存</h4>',
      '    <p>改完按右下「存檔」或 ⌘S，會寫回 HTML 原檔。文字、位置、大小全部一起存。</p>',
      '    <p>每次存檔前自動備份到 .backups/ 目錄，最多保留 20 份。</p>',
      '  </div>',
      '  <div class="__help_section">',
      '    <h4>鍵盤捷徑</h4>',
      '    <table class="__help_keys">',
      '      <tr><td><span class="__help_kbd">⌘S</span><span class="__help_kbd">Ctrl+S</span></td><td>儲存所有變動</td></tr>',
      '      <tr><td><span class="__help_kbd">⌘+Enter</span></td><td>對話框內，送出 prompt 加入佇列</td></tr>',
      '      <tr><td><span class="__help_kbd">Alt+↑</span><span class="__help_kbd">Alt+↓</span></td><td>放大／縮小目前選取的文字 2px</td></tr>',
      '      <tr><td><span class="__help_kbd">雙擊</span></td><td>移動模式下，將該元件還原到原位</td></tr>',
      '      <tr><td><span class="__help_kbd">Backspace</span><span class="__help_kbd">Delete</span></td><td>刪除目前選取的圖片</td></tr>',
      '      <tr><td>拖檔到 slide</td><td>上傳並插入圖片到拖放位置</td></tr>',
      '      <tr><td><span class="__help_kbd">Esc</span></td><td>關閉對話框 ／ 退出標記模式 ／ 退出移動模式</td></tr>',
      '      <tr><td><span class="__help_kbd">?</span></td><td>開啟這份說明</td></tr>',
      '    </table>',
      '  </div>',
      '  <div class="__help_section">',
      '    <h4>工具列位置</h4>',
      '    <p>右下角擋到 slide？拖工具列頂端「編輯器 ／ ⋯」那條移到任何位置。位置會記住。</p>',
      '    <p>不小心拖到看不見？雙擊頂端那條還原到右下角預設。</p>',
      '  </div>',
      '  <div class="__help_section">',
      '    <h4>注意事項</h4>',
      '    <p>·　「立即重寫」每次會用你的 Claude Code 訂閱呼叫一次，請勿暴衝。</p>',
      '    <p>·　處理完佇列後，prompts.json 會自動清空，避免下次重複跑。</p>',
      '    <p>·　要把編輯器移植到其他簡報，調整啟動參數即可（見 README）。</p>',
      '  </div>',
      '  <div class="__pm_actions">',
      '    <button class="__btn __btn-ink" id="__help_done__">關閉</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(helpModal);

    function openHelp() { helpModal.classList.add('show'); }
    function closeHelp() { helpModal.classList.remove('show'); }
    helpBtn.addEventListener('click', openHelp);
    document.getElementById('__help_close__').addEventListener('click', closeHelp);
    document.getElementById('__help_done__').addEventListener('click', closeHelp);
    helpModal.addEventListener('click', function (e) { if (e.target === helpModal) closeHelp(); });

    refreshAllPrompts();
    window.addEventListener('resize', refreshDots);
    window.addEventListener('scroll', refreshDots, true);
    setInterval(refreshAllPrompts, 5000);
  });
})();
</script>
"""


# ────────────────────────────────────────────────────────────────────
# IMAGE UPLOADS
# Drag-drop and button uploads land here.  Images are written to
# <docroot>/images/<timestamp>-<safe-name>.<ext> and referenced by
# the editor JS via the relative path returned to the client.
# ────────────────────────────────────────────────────────────────────

ALLOWED_IMAGE_EXTS = {"jpg", "jpeg", "png", "webp", "gif", "svg"}
ALLOWED_IMAGE_MIMES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]")


def parse_multipart_upload(handler):
    """Minimal multipart/form-data parser. Returns list of parts:
    [{name, filename, content_type, data}, ...]. No external deps."""
    content_type = handler.headers.get("Content-Type", "")
    m = re.search(r'boundary=(?:"([^"]+)"|([^;]+))', content_type)
    if not m:
        return []
    boundary = (m.group(1) or m.group(2)).strip()

    length = int(handler.headers.get("Content-Length", 0))
    if length <= 0:
        return []
    body = handler.rfile.read(length)

    delim = b"--" + boundary.encode("utf-8", errors="replace")
    raw_parts = body.split(delim)

    parts = []
    for raw in raw_parts:
        raw = raw.lstrip(b"\r\n")
        if not raw or raw.startswith(b"--"):
            continue
        sep = raw.find(b"\r\n\r\n")
        if sep < 0:
            continue
        headers_raw = raw[:sep].decode("utf-8", errors="replace")
        data = raw[sep + 4:]
        if data.endswith(b"\r\n"):
            data = data[:-2]

        name = ""
        filename = None
        ctype = "application/octet-stream"
        for line in headers_raw.split("\r\n"):
            ll = line.lower()
            if ll.startswith("content-disposition:"):
                cd = line.split(":", 1)[1]
                for piece in cd.split(";"):
                    piece = piece.strip()
                    if piece.startswith("name="):
                        name = piece[5:].strip().strip('"')
                    elif piece.startswith("filename="):
                        filename = piece[9:].strip().strip('"')
            elif ll.startswith("content-type:"):
                ctype = line.split(":", 1)[1].strip()

        parts.append(
            {
                "name": name,
                "filename": filename,
                "content_type": ctype,
                "data": data,
            }
        )
    return parts


def save_image_upload(parts, docroot):
    """Find a file part among `parts`, save to <docroot>/images/.
    Returns (relative_path_or_None, error_or_None)."""
    file_part = None
    for p in parts:
        if p.get("filename"):
            file_part = p
            break
    if not file_part:
        return None, "no file in upload"

    data = file_part["data"] or b""
    if len(data) == 0:
        return None, "empty file"
    if len(data) > MAX_IMAGE_SIZE:
        return None, "file too large (max %dMB)" % (MAX_IMAGE_SIZE // (1024 * 1024))

    filename = file_part["filename"] or "image"
    ext = ""
    if "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        return None, "extension not allowed: %s (allowed: %s)" % (
            ext or "(none)",
            ", ".join(sorted(ALLOWED_IMAGE_EXTS)),
        )

    ctype = (file_part.get("content_type") or "").split(";")[0].strip().lower()
    if ctype and ctype not in ALLOWED_IMAGE_MIMES:
        return None, "content-type not allowed: %s" % ctype

    base = os.path.basename(filename)
    base = SAFE_NAME_RE.sub("_", base)
    if not base or base.startswith("."):
        base = "image." + ext

    ts = datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]
    final = "%s-%s" % (ts, base)

    images_dir = os.path.join(docroot, "images")
    try:
        os.makedirs(images_dir, exist_ok=True)
    except OSError as e:
        return None, "make images dir: %s" % e

    final_path = os.path.join(images_dir, final)
    # Defensive: ensure resolved path stays inside images_dir
    real_images = os.path.realpath(images_dir)
    real_final = os.path.realpath(final_path)
    if not real_final.startswith(real_images + os.sep):
        return None, "path traversal blocked"

    try:
        with open(final_path, "wb") as f:
            f.write(data)
    except OSError as e:
        return None, "write file: %s" % e

    return "images/" + final, None


# ────────────────────────────────────────────────────────────────────
# AI BACKENDS
# Two CLIs are supported for instant rewriting; both use OAuth (no key).
#   claude  → Anthropic Claude Code CLI       (`claude -p`)
#   codex   → OpenAI Codex CLI                (`codex exec`)
# Each helper returns a normalized dict:
#   {ok, new_html, cost_usd, duration_ms, backend, error?}
# ────────────────────────────────────────────────────────────────────

REWRITE_PROMPT_TEMPLATE = (
    "You are rewriting one element from an HTML slide deck.\n\n"
    "OUTPUT RULES (strict):\n"
    "- Output ONLY the new inner HTML for the element. No explanation, no markdown fences, no quotes wrapping it, no preamble.\n"
    "- Preserve inline tags <br>, <b>, <small>, <em>, <strong> where they make sense.\n"
    "- Match the existing language, tone, and approximate length unless explicitly instructed otherwise.\n"
    "- If instruction is ambiguous, use your best judgement. Do not ask questions.\n\n"
    "Slide section label: %s\n"
    "Element tag: <%s>\n"
    "Current inner HTML:\n%s\n\n"
    "User instruction: %s\n\n"
    "Output the new inner HTML now:"
)


def build_rewrite_prompt(label, tag, current_html, user_prompt):
    return REWRITE_PROMPT_TEMPLATE % (label, tag, current_html, user_prompt)


def clean_ai_output(text):
    """Strip code fences, wrapping quotes, leading/trailing whitespace."""
    text = (text or "").strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    if (text.startswith('"') and text.endswith('"')) or (
        text.startswith("'") and text.endswith("'")
    ):
        text = text[1:-1]
    return text


def call_claude(prompt, docroot, timeout=120):
    """Call Anthropic Claude Code CLI with --output-format json."""
    try:
        proc = subprocess.run(
            [
                "claude",
                "-p",
                prompt,
                "--output-format",
                "json",
                "--no-session-persistence",
            ],
            capture_output=True,
            timeout=timeout,
            text=True,
            cwd=docroot,
        )
    except FileNotFoundError:
        return {"ok": False, "backend": "claude", "error": "claude CLI not found in PATH"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "backend": "claude", "error": "claude timed out (%ds)" % timeout}

    if proc.returncode != 0:
        return {
            "ok": False,
            "backend": "claude",
            "error": "claude exited %d: %s" % (proc.returncode, proc.stderr[:500]),
        }
    try:
        data = json.loads(proc.stdout)
    except Exception as e:
        return {"ok": False, "backend": "claude", "error": "parse claude output: %s" % e}

    return {
        "ok": True,
        "backend": "claude",
        "new_html": clean_ai_output(data.get("result") or ""),
        "cost_usd": data.get("total_cost_usd"),
        "duration_ms": data.get("duration_ms"),
    }


def call_codex(prompt, docroot, timeout=180):
    """Call OpenAI Codex CLI; result is written to a temp file via -o."""
    fd, out_path = tempfile.mkstemp(suffix=".txt", prefix="slide-editor-codex-")
    os.close(fd)
    started = time.time()
    try:
        proc = subprocess.run(
            ["codex", "exec", "--skip-git-repo-check", "-o", out_path, prompt],
            capture_output=True,
            timeout=timeout,
            text=True,
            cwd=docroot,
        )
        elapsed_ms = int((time.time() - started) * 1000)

        if proc.returncode != 0:
            return {
                "ok": False,
                "backend": "codex",
                "error": "codex exited %d: %s" % (proc.returncode, proc.stderr[:500]),
            }

        try:
            with open(out_path, "r", encoding="utf-8") as f:
                raw = f.read()
        except OSError as e:
            return {"ok": False, "backend": "codex", "error": "read codex output: %s" % e}

        if not raw.strip():
            tail = proc.stderr[-500:] if proc.stderr else ""
            return {
                "ok": False,
                "backend": "codex",
                "error": "codex returned empty output. stderr tail: %s" % tail,
            }

        return {
            "ok": True,
            "backend": "codex",
            "new_html": clean_ai_output(raw),
            "cost_usd": None,
            "duration_ms": elapsed_ms,
        }
    except FileNotFoundError:
        return {"ok": False, "backend": "codex", "error": "codex CLI not found in PATH"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "backend": "codex", "error": "codex timed out (%ds)" % timeout}
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


def resolve_backend(preferred):
    """preferred ∈ {claude, codex, auto}.  Returns chosen backend name or None."""
    if preferred == "claude":
        return "claude" if shutil.which("claude") else None
    if preferred == "codex":
        return "codex" if shutil.which("codex") else None
    if preferred == "auto":
        if shutil.which("claude"):
            return "claude"
        if shutil.which("codex"):
            return "codex"
        return None
    return None


def call_ai(backend, prompt, docroot):
    if backend == "claude":
        return call_claude(prompt, docroot)
    if backend == "codex":
        return call_codex(prompt, docroot)
    return {"ok": False, "backend": backend, "error": "unknown backend: %r" % backend}


def make_handler(config):
    """Create a request handler bound to a config object."""

    class Handler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header("Cache-Control", "no-store, must-revalidate")
            super().end_headers()

        def log_message(self, fmt, *args):
            sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

        def _send_json(self, status, obj):
            body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _read_json(self):
            length = int(self.headers.get("Content-Length", 0))
            return json.loads(self.rfile.read(length).decode("utf-8"))

        def do_GET(self):
            path = urllib.parse.urlparse(self.path).path
            if path == "/list-prompts":
                with config.prompts_lock:
                    data = load_prompts(config.prompts_file)
                self._send_json(200, data)
                return
            decoded = urllib.parse.unquote(path).lstrip("/")
            if decoded == config.deck_file:
                try:
                    with open(config.deck_path, "rb") as f:
                        body = f.read()
                except OSError as e:
                    self.send_error(500, str(e))
                    return
                editor_js = (
                    EDITOR_JS_TEMPLATE
                    .replace("__SLIDE_SELECTOR__", config.slide_selector)
                    .replace("__SLIDE_KEY__", config.slide_key)
                )
                if b"</body>" in body:
                    body = body.replace(b"</body>", editor_js.encode("utf-8") + b"</body>", 1)
                else:
                    body = body + editor_js.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            super().do_GET()

        def do_POST(self):
            if self.path == "/upload-image":
                parts = parse_multipart_upload(self)
                src, err = save_image_upload(parts, config.docroot)
                if err:
                    self._send_json(400, {"ok": False, "error": err})
                    return
                self._send_json(200, {"ok": True, "src": src})
                return

            if self.path == "/queue-prompt":
                try:
                    payload = self._read_json()
                except Exception as e:
                    self.send_error(400, "bad payload: %s" % e)
                    return
                with config.prompts_lock:
                    data = load_prompts(config.prompts_file)
                    pid = "p_%d_%d" % (
                        int(datetime.now().timestamp() * 1000),
                        len(data["prompts"]),
                    )
                    entry = {
                        "id": pid,
                        "status": "pending",
                        "created": datetime.now().astimezone().isoformat(timespec="seconds"),
                        "label": payload.get("label", ""),
                        "selector": payload.get("selector", ""),
                        "tag": payload.get("tag", ""),
                        "current_text": payload.get("current_text", ""),
                        "current_html": payload.get("current_html", ""),
                        "prompt": payload.get("prompt", ""),
                    }
                    data["prompts"].append(entry)
                    save_prompts(config.prompts_file, data)
                self._send_json(200, {"ok": True, "id": pid})
                return

            if self.path == "/delete-prompt":
                try:
                    payload = self._read_json()
                    pid = payload["id"]
                except Exception as e:
                    self.send_error(400, "bad payload: %s" % e)
                    return
                with config.prompts_lock:
                    data = load_prompts(config.prompts_file)
                    before = len(data["prompts"])
                    data["prompts"] = [p for p in data["prompts"] if p.get("id") != pid]
                    save_prompts(config.prompts_file, data)
                self._send_json(200, {"ok": True, "removed": before - len(data["prompts"])})
                return

            if self.path == "/clear-prompts":
                with config.prompts_lock:
                    data = load_prompts(config.prompts_file)
                    count = len(data["prompts"])
                    save_prompts(config.prompts_file, {"version": 1, "prompts": []})
                self._send_json(200, {"ok": True, "cleared": count})
                return

            if self.path == "/ai-edit":
                if not config.ai_enabled:
                    self._send_json(503, {"ok": False, "error": "AI rewriting disabled (--no-ai)"})
                    return
                try:
                    payload = self._read_json()
                    label = payload.get("label", "")
                    tag = payload.get("tag", "")
                    current_html = payload.get("current_html", "")
                    user_prompt = payload.get("prompt", "")
                except Exception as e:
                    self._send_json(400, {"ok": False, "error": "bad payload: %s" % e})
                    return
                if not user_prompt.strip():
                    self._send_json(400, {"ok": False, "error": "empty prompt"})
                    return

                backend = resolve_backend(config.backend)
                if backend is None:
                    self._send_json(
                        500,
                        {
                            "ok": False,
                            "error": "neither claude nor codex CLI found in PATH. "
                            "Install one (https://docs.claude.com/en/docs/claude-code "
                            "or https://github.com/openai/codex), or run with --no-ai.",
                        },
                    )
                    return

                full_prompt = build_rewrite_prompt(label, tag, current_html, user_prompt)
                result = call_ai(backend, full_prompt, config.docroot)

                if not result.get("ok"):
                    self._send_json(500, {"ok": False, "error": result.get("error", "unknown error"), "backend": result.get("backend")})
                    return

                self._send_json(
                    200,
                    {
                        "ok": True,
                        "new_html": result.get("new_html", ""),
                        "cost_usd": result.get("cost_usd"),
                        "duration_ms": result.get("duration_ms"),
                        "backend": result.get("backend"),
                    },
                )
                return

            if self.path != "/save-slide":
                self.send_error(404)
                return
            try:
                payload = self._read_json()
                label = payload["label"]
                new_inner = payload["html"]
            except Exception as e:
                self.send_error(400, "bad payload: %s" % e)
                return

            with config.write_lock:
                try:
                    with open(config.deck_path, "r", encoding="utf-8") as f:
                        src = f.read()
                except OSError as e:
                    self.send_error(500, str(e))
                    return

                pattern = re.compile(
                    r'(<' + re.escape(config.slide_tag) + r'\s[^>]*?'
                    + re.escape(config.slide_key) + r'="' + re.escape(label) + r'"[^>]*?>)'
                    + r'(.*?)'
                    + r'(</' + re.escape(config.slide_tag) + r'>)',
                    re.DOTALL,
                )
                matches = pattern.findall(src)
                if len(matches) != 1:
                    self.send_error(
                        400,
                        "expected exactly 1 slide with %s=%r, found %d"
                        % (config.slide_key, label, len(matches)),
                    )
                    return

                make_backup(config.deck_path, config.backup_dir)

                def repl(m):
                    return m.group(1) + "\n" + new_inner + "\n  " + m.group(3)

                new_src = pattern.sub(repl, src, count=1)
                try:
                    with open(config.deck_path, "w", encoding="utf-8") as f:
                        f.write(new_src)
                except OSError as e:
                    self.send_error(500, str(e))
                    return

            body = json.dumps({"ok": True, "label": label}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Handler


class Config:
    pass


def main():
    parser = argparse.ArgumentParser(
        description="slide-editor — inline browser editor for HTML slide decks.",
        epilog="Example: python3 editor.py examples/demo.html --port 8765",
    )
    parser.add_argument("deck", help="path to the HTML deck file")
    parser.add_argument("--port", type=int, default=8765, help="HTTP port (default: 8765)")
    parser.add_argument("--host", default="127.0.0.1", help="bind address (default: 127.0.0.1)")
    parser.add_argument(
        "--slide-tag",
        default="section",
        help="HTML tag used for each slide (default: section)",
    )
    parser.add_argument(
        "--slide-class",
        default="slide",
        help="CSS class on each slide element (default: slide)",
    )
    parser.add_argument(
        "--slide-key",
        default="data-label",
        help="attribute used as unique key per slide (default: data-label)",
    )
    parser.add_argument(
        "--no-ai",
        action="store_true",
        help="disable instant AI rewriting (queueing still works)",
    )
    parser.add_argument(
        "--backend",
        choices=["claude", "codex", "auto"],
        default="auto",
        help="AI backend for instant rewriting. 'auto' prefers claude, falls back to codex (default: auto)",
    )
    args = parser.parse_args()

    deck_path = os.path.abspath(args.deck)
    if not os.path.exists(deck_path):
        print("error: deck file not found: %s" % deck_path, file=sys.stderr)
        sys.exit(1)
    if not os.path.isfile(deck_path):
        print("error: not a file: %s" % deck_path, file=sys.stderr)
        sys.exit(1)

    config = Config()
    config.docroot = os.path.dirname(deck_path)
    config.deck_path = deck_path
    config.deck_file = os.path.basename(deck_path)
    config.backup_dir = os.path.join(config.docroot, ".backups")
    config.prompts_file = os.path.join(config.docroot, "prompts.json")
    config.slide_tag = args.slide_tag
    config.slide_class = args.slide_class
    config.slide_key = args.slide_key
    config.slide_selector = "%s.%s" % (args.slide_tag, args.slide_class)
    config.ai_enabled = not args.no_ai
    config.backend = args.backend
    config.write_lock = threading.Lock()
    config.prompts_lock = threading.Lock()

    os.chdir(config.docroot)
    Handler = make_handler(config)
    httpd = http.server.ThreadingHTTPServer((args.host, args.port), Handler)
    url = "http://%s:%d/%s" % (args.host, args.port, urllib.parse.quote(config.deck_file))

    if config.ai_enabled:
        chosen = resolve_backend(config.backend)
        if chosen:
            ai_state = "on (%s)" % chosen
        else:
            ai_state = "on (no backend found — install claude or codex CLI)"
    else:
        ai_state = "off"

    print("slide-editor running")
    print("  url:        %s" % url)
    print("  deck:       %s" % config.deck_path)
    print("  selector:   %s [%s]" % (config.slide_selector, config.slide_key))
    print("  backups:    %s" % config.backup_dir)
    print("  prompts:    %s" % config.prompts_file)
    print("  ai-rewrite: %s" % ai_state)
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")


if __name__ == "__main__":
    main()
