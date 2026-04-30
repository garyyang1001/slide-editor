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
      '.__bar_home{background:transparent;border:0;padding:2px 8px;font-family:inherit;font-size:11px;letter-spacing:0.1em;font-weight:500;color:var(--ed-ink);cursor:pointer;text-transform:uppercase;line-height:1;border:1px solid var(--ed-line)}',
      '.__bar_home:hover{background:var(--ed-ink);color:var(--ed-bg);border-color:var(--ed-ink)}',
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
      '.__ed_selected{outline:2px solid var(--ed-red) !important;outline-offset:4px;background:rgba(200,70,48,0.05) !important}',

      '.__prompt_dot{position:absolute;z-index:99999;background:var(--ed-red);color:var(--ed-bg);font-family:var(--ed-font);font-size:11px;font-weight:500;letter-spacing:0;width:20px;height:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;transform:translate(-50%,-50%);transition:opacity 280ms var(--ed-ease)}',
      '.__prompt_dot:hover{opacity:0.85}',

      '#__prompt_modal__,#__help_modal__,#__home_modal__{position:fixed;inset:0;background:rgba(45,42,38,0.55);z-index:2147483646;display:none;align-items:center;justify-content:center;font-family:var(--ed-font);font-weight:300;color:var(--ed-ink)}',
      '#__prompt_modal__.show,#__help_modal__.show,#__home_modal__.show{display:flex}',
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
      'body.__insert_mode__,body.__insert_mode__ *{cursor:crosshair !important}',
      'body.__insert_mode__ ' + SLIDE_SELECTOR + ':hover{outline:2px solid var(--ed-red) !important;outline-offset:-2px}',
      '#__move_indicator__{position:fixed;bottom:140px;right:24px;z-index:2147483645;background:var(--ed-ink);color:var(--ed-bg);padding:8px 12px;font-family:var(--ed-mono);font-size:11px;letter-spacing:0.05em;display:none;line-height:1.4}',
      '#__move_indicator__.show{display:block}',

      '#__tree_panel__{position:fixed;top:24px;left:24px;z-index:2147483644;width:340px;max-height:78vh;background:var(--ed-bg-warm);border:1px solid var(--ed-ink);font-family:var(--ed-font);color:var(--ed-ink);display:none;box-sizing:border-box}',
      '#__tree_panel__.show{display:block}',
      '.__tree_head{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--ed-line);font-size:11px;letter-spacing:0.1em;text-transform:uppercase}',
      '.__tree_head b{font-size:12px;font-weight:500;letter-spacing:0.08em}',
      '.__tree_head button{margin-left:auto;border:1px solid var(--ed-line);background:transparent;color:var(--ed-gray);width:24px;height:24px;cursor:pointer;font-family:inherit}',
      '.__tree_body{padding:10px 0;overflow:auto;max-height:calc(78vh - 50px)}',
      '.__tree_row{display:block;width:100%;border:0;background:transparent;text-align:left;padding:7px 12px;font-family:var(--ed-mono);font-size:11px;line-height:1.35;color:var(--ed-ink);cursor:pointer;border-bottom:1px solid rgba(224,224,216,0.55)}',
      '.__tree_row:hover{background:var(--ed-bg-soft)}',
      '.__tree_row.__active{background:var(--ed-ink);color:var(--ed-bg)}',
      '.__tree_row .__tree_text{font-family:var(--ed-font);font-size:11px;color:var(--ed-gray);letter-spacing:0;margin-left:6px}',
      '.__tree_row.__active .__tree_text{color:rgba(245,245,240,0.75)}',

      '#__font_toolbar__{position:absolute;z-index:2147483640;background:var(--ed-bg-warm);border:1px solid var(--ed-ink);padding:0;display:none;align-items:center;gap:0;font-family:var(--ed-font);font-weight:300;line-height:1}',
      '#__font_toolbar__.show{display:flex}',
      '.__ft_btn{background:transparent;border:0;padding:8px 14px;font-family:inherit;font-weight:300;color:var(--ed-ink);cursor:pointer;line-height:1;border-right:1px solid var(--ed-line);transition:opacity 280ms var(--ed-ease)}',
      '.__ft_btn:last-child{border-right:0}',
      '.__ft_btn:hover{background:var(--ed-ink);color:var(--ed-bg);opacity:1}',
      '.__ft_minus,.__ft_plus{font-size:18px;line-height:0.7;min-width:36px;text-align:center;font-weight:300}',
      '.__ft_fmt{font-size:14px;min-width:32px;text-align:center}',
      '.__ft_size{padding:8px 14px;font-size:11px;letter-spacing:0.05em;color:var(--ed-gray);font-family:var(--ed-mono);min-width:56px;text-align:center;border-right:1px solid var(--ed-line);user-select:none}',
      '.__ft_reset{font-size:11px;letter-spacing:0.1em;text-transform:uppercase}',
      '.__ft_select{appearance:none;-webkit-appearance:none;background:transparent;border:0;border-right:1px solid var(--ed-line);padding:8px 26px 8px 14px;font-family:inherit;font-size:12px;color:var(--ed-ink);cursor:pointer;line-height:1;letter-spacing:0;background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'5\' viewBox=\'0 0 8 5\'><path d=\'M0 0 L4 5 L8 0 Z\' fill=\'%232D2A26\'/></svg>");background-repeat:no-repeat;background-position:right 10px center}',
      '.__ft_select:hover{background-color:var(--ed-ink);color:var(--ed-bg);background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'5\' viewBox=\'0 0 8 5\'><path d=\'M0 0 L4 5 L8 0 Z\' fill=\'%23F5F5F0\'/></svg>")}',
      '.__ft_select:focus{outline:0}',
      '.__ft_select option{background:var(--ed-bg);color:var(--ed-ink);font-family:inherit}',
      '.__ft_select#__ft_family__{min-width:140px;font-family:inherit}',
      '.__ft_select#__ft_weight__{min-width:64px;font-family:var(--ed-mono);text-align:center}',

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

      // Right-click context menu (delete element)
      '#__context_menu__{position:absolute;z-index:2147483646;background:var(--ed-bg-warm);border:1px solid var(--ed-ink);font-family:var(--ed-font);font-size:13px;font-weight:300;display:none;min-width:240px}',
      '#__context_menu__.show{display:block}',
      '.__cm_header{padding:10px 16px;font-size:11px;letter-spacing:0.1em;color:var(--ed-gray);text-transform:uppercase;border-bottom:1px solid var(--ed-line);font-family:var(--ed-mono)}',
      '.__cm_item{display:block;width:100%;text-align:left;padding:12px 16px;font-family:inherit;font-size:14px;color:var(--ed-ink);cursor:pointer;background:transparent;border:0;border-bottom:1px solid var(--ed-line);letter-spacing:0.025em}',
      '.__cm_item:last-child{border-bottom:0}',
      '.__cm_item:hover{background:var(--ed-ink);color:var(--ed-bg);opacity:1}',
      '.__cm_item.__danger:hover{background:var(--ed-red);color:var(--ed-bg)}',
      '.__cm_meta{padding:0 16px 10px;font-size:11px;color:var(--ed-gray);font-family:var(--ed-mono);letter-spacing:0.05em;line-height:1.5;word-break:break-word}',
      '.__cm_target_outline{outline:2px solid var(--ed-red) !important;outline-offset:4px;background:rgba(200,70,48,0.06) !important}',
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
      '  <button class="__bar_home" id="__home_btn__" title="返回首頁（未存檔會提醒）">← 首頁</button>',
      '  <span class="__bar_brand">編輯器</span>',
      '  <span class="__bar_sep">／</span>',
      '  <span class="__bar_hint">點文字直接編輯　·　右鍵刪除元件　·　標記讓 AI 改寫</span>',
      '  <button class="__bar_help" id="__help_btn__" title="使用說明（按 ?）">？</button>',
      '</div>',
      '<div class="__bar_bottom">',
      '  <button class="__btn __btn-ghost" id="__pin_btn__" title="標記要 AI 改寫的位置">標記 prompt</button>',
      '  <button class="__btn __btn-ghost" id="__move_btn__" title="拖曳元件改變位置">移動模式</button>',
      '  <button class="__btn __btn-ghost" id="__tree_btn__" title="查看目前頁面的 HTML 結構">結構</button>',
      '  <button class="__btn __btn-ghost" id="__img_btn__" title="上傳圖片（也可拖檔到 slide）">新增圖片</button>',
      '  <button class="__btn __btn-ghost" id="__add_h2_btn__" title="新增標題（H2）">＋ 標題</button>',
      '  <button class="__btn __btn-ghost" id="__add_p_btn__" title="新增一般文字（P）">＋ 文字</button>',
      '  <button class="__btn __btn-ghost" id="__queue_btn__" title="查看 prompt 佇列">佇列 ／ <span id="__queue_count__">0</span></button>',
      '  <button class="__btn __btn-ghost" id="__export_pdf_btn__" title="先存檔，再匯出目前簡報 PDF">匯出 PDF</button>',
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
    var treeBtn = document.getElementById('__tree_btn__');
    var exportPdfBtn = document.getElementById('__export_pdf_btn__');
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

    var HEADING_TAGS = new Set(['H1','H2','H3','H4','H5','H6']);
    function preferredSlideBody(slide) {
      return slide.querySelector('.slide-body') ||
             slide.querySelector('.slide-frame') ||
             slide;
    }

    function normalizeSlideStructure(slide) {
      var changed = false;
      var body = preferredSlideBody(slide);

      // Move visible elements that escaped slide-frame/slide-body back into the main body.
      Array.from(slide.children).forEach(function (child) {
        if (child.matches('.slide-frame,.section-divider,style,script')) return;
        if (!child.textContent.trim() && child.children.length === 0 && child.tagName !== 'IMG') return;
        if (body && child !== body && !body.contains(child)) {
          body.appendChild(child);
          changed = true;
        }
      });

      // Prevent headings inside headings, which creates unstable editable DOM.
      slide.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(function (heading) {
        Array.from(heading.querySelectorAll('h1,h2,h3,h4,h5,h6')).forEach(function (nested) {
          var span = document.createElement('span');
          span.innerHTML = nested.innerHTML;
          nested.replaceWith(span);
          changed = true;
        });
        if (!heading.textContent.replace(/\s/g, '').length && heading.children.length === 0) {
          heading.remove();
          changed = true;
        }
      });

      return changed;
    }

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
          normalizeSlideStructure(slide);
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

    async function exportPdf() {
      exportPdfBtn.disabled = true;
      var oldText = exportPdfBtn.textContent;
      exportPdfBtn.textContent = '匯出中…';
      try {
        await saveAll();
        if (dirty.size > 0) {
          alert('仍有未成功儲存的頁面，先修正後再匯出 PDF。');
          return;
        }
        setStatus('正在產生 PDF…', '');
        var r = await fetch('/export-pdf');
        if (!r.ok) {
          var msg = 'PDF 匯出失敗';
          try {
            var data = await r.json();
            msg += '：' + (data.error || r.statusText);
          } catch (err) {
            msg += '：' + r.statusText;
          }
          alert(msg);
          setStatus('PDF 匯出失敗', 'dirty');
          return;
        }
        var blob = await r.blob();
        var disposition = r.headers.get('Content-Disposition') || '';
        var filename = 'deck.pdf';
        var m = disposition.match(/filename\*=UTF-8''([^;]+)/);
        if (m) filename = decodeURIComponent(m[1]);
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        setStatus('PDF 已匯出', 'ok');
      } catch (err) {
        alert('PDF 匯出失敗：' + err);
        setStatus('PDF 匯出失敗', 'dirty');
      } finally {
        exportPdfBtn.disabled = false;
        exportPdfBtn.textContent = oldText;
      }
    }
    exportPdfBtn.addEventListener('click', exportPdf);

    function isTyping(el) {
      if (!el) return false;
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return true;
      if (el.isContentEditable) return true;
      return false;
    }

    function markDirty(slide) {
      var key = getSlideKey(slide);
      if (!key) return;
      dirty.add(key);
      setStatus(dirty.size + ' 張未存', 'dirty');
    }

    function consumeShortcut(e) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }

    window.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        consumeShortcut(e);
        saveAll();
        return;
      }
      if (e.key === 'Escape') {
        var handled = false;
        if (document.body.classList.contains('__pin_mode__')) { exitPinMode(); handled = true; }
        if (document.body.classList.contains('__move_mode__')) { exitMoveMode(); handled = true; }
        if (document.body.classList.contains('__insert_mode__')) { exitInsertMode(); handled = true; }
        var hm = document.getElementById('__help_modal__');
        if (hm && hm.classList.contains('show')) { closeHelp(); handled = true; }
        var homeM = document.getElementById('__home_modal__');
        if (homeM && homeM.classList.contains('show')) { homeM.classList.remove('show'); handled = true; }
        var ctx = document.getElementById('__context_menu__');
        if (ctx && ctx.classList.contains('show')) { hideContextMenu(); handled = true; }
        if (handled) consumeShortcut(e);
        return;
      }
      if (e.key === '?' && !isTyping(e.target)) {
        consumeShortcut(e);
        openHelp();
        return;
      }
      if (document.body.classList.contains('__move_mode__') &&
          selectedElement &&
          ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.key) !== -1 &&
          !isTyping(e.target)) {
        consumeShortcut(e);
        var step = e.shiftKey ? 10 : 1;
        var pos = parseTranslate(selectedElement);
        if (e.key === 'ArrowLeft') pos.x -= step;
        if (e.key === 'ArrowRight') pos.x += step;
        if (e.key === 'ArrowUp') pos.y -= step;
        if (e.key === 'ArrowDown') pos.y += step;
        setTranslate(selectedElement, pos.x, pos.y);
        var slide = findSlide(selectedElement);
        if (slide) markDirty(slide);
        moveIndicator.classList.add('show');
        moveIndicator.textContent = '已微調到 ' + Math.round(pos.x) + ', ' + Math.round(pos.y) + ' px　·　Shift=10px';
      }
    }, true);

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
    var selectedElement = null;

    function selectElement(el) {
      if (selectedElement) selectedElement.classList.remove('__ed_selected');
      selectedElement = el || null;
      if (selectedElement) selectedElement.classList.add('__ed_selected');
      renderTree();
    }

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
      moveIndicator.textContent = '拖曳任何元件即可移動　·　方向鍵微調　·　雙擊還原';
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

    function parseTranslate(el) {
      var match = (el.style.transform || '').match(/translate\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px\s*\)/);
      return {
        x: match ? parseFloat(match[1]) : 0,
        y: match ? parseFloat(match[2]) : 0
      };
    }

    function setTranslate(el, x, y) {
      el.style.transform = 'translate(' + x.toFixed(1) + 'px, ' + y.toFixed(1) + 'px)';
    }

    var treePanel = document.createElement('div');
    treePanel.id = '__tree_panel__';
    treePanel.innerHTML = [
      '<div class="__tree_head"><b>目前頁面結構</b><button id="__tree_close__">×</button></div>',
      '<div class="__tree_body" id="__tree_body__"></div>'
    ].join('');
    document.body.appendChild(treePanel);
    var treeBody = document.getElementById('__tree_body__');

    function treeLabel(el) {
      var cls = el.className && typeof el.className === 'string'
        ? '.' + el.className.split(' ').filter(Boolean).filter(function (c) { return c.indexOf('__') !== 0; }).slice(0, 2).join('.')
        : '';
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length > 32) text = text.slice(0, 32) + '…';
      return '<' + el.tagName.toLowerCase() + cls + '>' + (text ? '<span class="__tree_text">' + escapeHtml(text) + '</span>' : '');
    }

    function renderTree() {
      if (!treePanel || !treePanel.classList.contains('show')) return;
      var slide = getActiveSlide();
      if (!slide) {
        treeBody.innerHTML = '<button class="__tree_row">找不到目前頁面</button>';
        return;
      }
      var rows = [];
      function walk(el, depth) {
        if (el !== slide && (SKIP_TAGS.has(el.tagName) || el.id && el.id.indexOf('__') === 0)) return;
        if (el !== slide) {
          var idx = rows.length;
          rows.push({ el: el, depth: depth });
        }
        Array.from(el.children).forEach(function (child) {
          if (child.tagName === 'STYLE' || child.tagName === 'SCRIPT') return;
          if (depth > 5) return;
          walk(child, depth + 1);
        });
      }
      walk(slide, 0);
      treeBody.innerHTML = rows.map(function (row, i) {
        var active = row.el === selectedElement ? ' __active' : '';
        return '<button class="__tree_row' + active + '" data-idx="' + i + '" style="padding-left:' + (12 + row.depth * 14) + 'px">' + treeLabel(row.el) + '</button>';
      }).join('');
      treeBody.querySelectorAll('.__tree_row[data-idx]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var row = rows[parseInt(btn.dataset.idx, 10)];
          if (!row) return;
          selectElement(row.el);
          row.el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        });
      });
    }

    function toggleTree() {
      treePanel.classList.toggle('show');
      treeBtn.classList.toggle('__btn-red', treePanel.classList.contains('show'));
      treeBtn.classList.toggle('__btn-ghost', !treePanel.classList.contains('show'));
      renderTree();
    }
    treeBtn.addEventListener('click', toggleTree);
    document.getElementById('__tree_close__').addEventListener('click', function () {
      treePanel.classList.remove('show');
      treeBtn.classList.remove('__btn-red');
      treeBtn.classList.add('__btn-ghost');
    });

    var dragState = null;
    document.addEventListener('mousedown', function (e) {
      if (!document.body.classList.contains('__move_mode__')) return;
      if (e.target.closest('#__editor_bar__')) return;
      var slide = findSlide(e.target);
      if (!slide) return;
      e.preventDefault();
      var el = e.target;
      selectElement(el);
      var pos = parseTranslate(el);
      var scale = getStageScale(slide) || 1;
      dragState = {
        el: el, slide: slide,
        startX: e.clientX, startY: e.clientY,
        baseX: pos.x, baseY: pos.y, scale: scale
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
      setTranslate(dragState.el, newX, newY);
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
      selectElement(e.target);
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
    // Curated Google Fonts catalog. Mix of CJK-supporting and Latin-only,
    // sans/serif/mono. CJK-supporting ones (cn:true) actually render
    // Traditional Chinese; Latin-only fonts will fall through to the
    // browser's CJK fallback for any 中文 characters.
    var FONT_CATALOG = [
      { name: 'Noto Sans TC', weights: [300, 400, 500, 700], cn: true,  group: '繁中 ／ Sans' },
      { name: 'Noto Serif TC', weights: [300, 400, 500, 700], cn: true,  group: '繁中 ／ Serif' },
      { name: 'Inter', weights: [300, 400, 500, 700, 900], cn: false, group: 'Latin ／ Sans' },
      { name: 'Plus Jakarta Sans', weights: [300, 400, 500, 700, 800], cn: false, group: 'Latin ／ Sans' },
      { name: 'IBM Plex Sans', weights: [300, 400, 500, 700], cn: false, group: 'Latin ／ Sans' },
      { name: 'Manrope', weights: [300, 400, 500, 700, 800], cn: false, group: 'Latin ／ Sans' },
      { name: 'Space Grotesk', weights: [300, 400, 500, 700], cn: false, group: 'Latin ／ Sans' },
      { name: 'DM Sans', weights: [400, 500, 700, 900], cn: false, group: 'Latin ／ Sans' },
      { name: 'Crimson Pro', weights: [300, 400, 500, 700], cn: false, group: 'Latin ／ Serif' },
      { name: 'Lora', weights: [400, 500, 700], cn: false, group: 'Latin ／ Serif' },
      { name: 'Playfair Display', weights: [400, 500, 700, 900], cn: false, group: 'Latin ／ Serif' },
      { name: 'JetBrains Mono', weights: [300, 400, 500, 700], cn: false, group: 'Mono' },
      { name: 'IBM Plex Mono', weights: [300, 400, 500, 700], cn: false, group: 'Mono' }
    ];
    var FONT_BY_NAME = {};
    FONT_CATALOG.forEach(function (f) { FONT_BY_NAME[f.name] = f; });

    var loadedFontKeys = new Set();
    function loadGoogleFont(name) {
      var meta = FONT_BY_NAME[name];
      if (!meta) return;
      var key = name;
      if (loadedFontKeys.has(key)) return;
      loadedFontKeys.add(key);
      var family = name.replace(/ /g, '+');
      var url = 'https://fonts.googleapis.com/css2?family=' + family +
                ':wght@' + meta.weights.join(';') + '&display=swap';
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      document.head.appendChild(link);
    }

    function buildFontFamilyOptions() {
      var html = '<option value="">繼承</option>';
      var lastGroup = null;
      FONT_CATALOG.forEach(function (f) {
        if (f.group !== lastGroup) {
          if (lastGroup !== null) html += '</optgroup>';
          html += '<optgroup label="' + f.group + '">';
          lastGroup = f.group;
        }
        html += '<option value="' + f.name + '">' + f.name + (f.cn ? '　·　繁中' : '') + '</option>';
      });
      html += '</optgroup>';
      return html;
    }

    function buildFontWeightOptions() {
      var weights = [300, 400, 500, 700];
      return '<option value="">繼承</option>' +
             weights.map(function (w) { return '<option value="' + w + '">' + w + '</option>'; }).join('');
    }

    var fontToolbar = document.createElement('div');
    fontToolbar.id = '__font_toolbar__';
    fontToolbar.innerHTML = [
      '<select class="__ft_select" id="__ft_family__" title="字體（Google Fonts）">' + buildFontFamilyOptions() + '</select>',
      '<select class="__ft_select" id="__ft_weight__" title="字重">' + buildFontWeightOptions() + '</select>',
      '<button class="__ft_btn __ft_fmt" id="__ft_bold__" title="粗體（⌘B）" style="font-weight:700">B</button>',
      '<button class="__ft_btn __ft_fmt" id="__ft_italic__" title="斜體（⌘I）" style="font-style:italic">I</button>',
      '<button class="__ft_btn __ft_fmt" id="__ft_underline__" title="底線（⌘U）" style="text-decoration:underline">U</button>',
      '<button class="__ft_btn __ft_minus" id="__ft_minus__" title="縮小 2px（Alt+↓）">−</button>',
      '<span class="__ft_size" id="__ft_size__">16px</span>',
      '<button class="__ft_btn __ft_plus" id="__ft_plus__" title="放大 2px（Alt+↑）">+</button>',
      '<button class="__ft_btn __ft_reset" id="__ft_reset__" title="還原預設">RESET</button>'
    ].join('');
    document.body.appendChild(fontToolbar);

    var ftMinus = document.getElementById('__ft_minus__');
    var ftPlus = document.getElementById('__ft_plus__');
    var ftReset = document.getElementById('__ft_reset__');
    var ftSize = document.getElementById('__ft_size__');
    var ftFamily = document.getElementById('__ft_family__');
    var ftWeight = document.getElementById('__ft_weight__');
    var ftBold = document.getElementById('__ft_bold__');
    var ftItalic = document.getElementById('__ft_italic__');
    var ftUnderline = document.getElementById('__ft_underline__');

    var focusedEditable = null;

    function syncToolbarToElement(el) {
      // Sync size display
      var size = parseFloat(getComputedStyle(el).fontSize);
      ftSize.textContent = Math.round(size) + 'px';

      // Sync font family — show the catalog font name iff the inline style
      // is exactly one of our catalog fonts. Otherwise show "繼承".
      var inlineFamily = (el.style.fontFamily || '').trim();
      var matchedFamily = '';
      // Inline value might be: "'Noto Sans TC', sans-serif" — extract first token
      if (inlineFamily) {
        var first = inlineFamily.split(',')[0].replace(/['"]/g, '').trim();
        if (FONT_BY_NAME[first]) matchedFamily = first;
      }
      ftFamily.value = matchedFamily;

      // Sync font weight from inline style
      var inlineWeight = (el.style.fontWeight || '').trim();
      ftWeight.value = inlineWeight;
    }

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
      syncToolbarToElement(el);
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
        var active = document.activeElement;
        // Keep the toolbar (and our focusedEditable reference) alive while
        // the user is interacting with the toolbar's selects/buttons.
        if (active && active.closest && active.closest('#__font_toolbar__')) return;
        if (!active || !active.isContentEditable) {
          fontToolbar.classList.remove('show');
          focusedEditable = null;
        }
      }, 50);
    });

    // Don't blur contenteditable on click within the toolbar — except for
    // <select>, which needs its native dropdown to open (preventDefault on
    // mousedown blocks that on macOS).
    fontToolbar.addEventListener('mousedown', function (e) {
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
      e.preventDefault();
    });

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
      // Reset all three: size + family + weight
      focusedEditable.style.fontSize = '';
      focusedEditable.style.fontFamily = '';
      focusedEditable.style.fontWeight = '';
      var slide = findSlide(focusedEditable);
      var key = slide ? getSlideKey(slide) : '';
      if (key) {
        dirty.add(key);
        setStatus(dirty.size + ' 張未存', 'dirty');
      }
      setTimeout(function () { positionFontToolbar(focusedEditable); }, 0);
    });

    function applyFontFamily(name) {
      if (!focusedEditable) return;
      if (!name) {
        focusedEditable.style.fontFamily = '';
      } else {
        loadGoogleFont(name);
        // Use the font + sensible fallback chain
        focusedEditable.style.fontFamily = "'" + name + "', 'Noto Sans TC', 'PingFang TC', sans-serif";
      }
      var slide = findSlide(focusedEditable);
      var key = slide ? getSlideKey(slide) : '';
      if (key) {
        dirty.add(key);
        setStatus(dirty.size + ' 張未存', 'dirty');
      }
      setTimeout(function () { if (focusedEditable) positionFontToolbar(focusedEditable); }, 50);
    }

    function applyFontWeight(weight) {
      if (!focusedEditable) return;
      focusedEditable.style.fontWeight = weight || '';
      var slide = findSlide(focusedEditable);
      var key = slide ? getSlideKey(slide) : '';
      if (key) {
        dirty.add(key);
        setStatus(dirty.size + ' 張未存', 'dirty');
      }
      setTimeout(function () { if (focusedEditable) positionFontToolbar(focusedEditable); }, 0);
    }

    // Prevent <select> mousedown from blurring contenteditable.
    // (Native <select> dropdowns don't blur on mousedown by default,
    //  but the toolbar's mousedown.preventDefault below would block opening.
    //  Solution: don't preventDefault on the select itself.)
    ftFamily.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    ftWeight.addEventListener('mousedown', function (e) { e.stopPropagation(); });

    ftFamily.addEventListener('change', function (e) {
      applyFontFamily(e.target.value);
    });
    ftWeight.addEventListener('change', function (e) {
      applyFontWeight(e.target.value);
    });

    // B / I / U — apply inline formatting to the current selection inside
    // the focused contenteditable element.  document.execCommand is the
    // shortest path; modern browsers still support 'bold' / 'italic' /
    // 'underline' even though the API is officially deprecated.
    function applyFormat(cmd) {
      if (!focusedEditable) return;
      // Make sure the selection is inside our editable; otherwise refocus
      var sel = window.getSelection();
      if (!sel.rangeCount || !focusedEditable.contains(sel.anchorNode)) {
        focusedEditable.focus();
      }
      try { document.execCommand(cmd, false, null); } catch (e) {}
      var slide = findSlide(focusedEditable);
      var key = slide ? getSlideKey(slide) : '';
      if (key) {
        dirty.add(key);
        setStatus(dirty.size + ' 張未存', 'dirty');
      }
    }
    ftBold.addEventListener('click', function () { applyFormat('bold'); });
    ftItalic.addEventListener('click', function () { applyFormat('italic'); });
    ftUnderline.addEventListener('click', function () { applyFormat('underline'); });

    window.addEventListener('keydown', function (e) {
      if (!focusedEditable) return;
      if (e.altKey && e.key === 'ArrowUp') { consumeShortcut(e); changeFontSize(2); }
      if (e.altKey && e.key === 'ArrowDown') { consumeShortcut(e); changeFontSize(-2); }
    }, true);

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

      var targetBody = preferredSlideBody(slide);
      if (targetBody !== slide && getComputedStyle(targetBody).position === 'static') {
        targetBody.style.position = 'relative';
      }
      var rect = targetBody.getBoundingClientRect();
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
        consumeShortcut(e);
        var slide = findSlide(selectedImage);
        var key = slide ? getSlideKey(slide) : '';
        selectedImage.remove();
        clearSelection();
        if (key) {
          dirty.add(key);
          setStatus(dirty.size + ' 張未存', 'dirty');
        }
      }
    }, true);

    // Reposition handles on scroll/resize/edit
    var handleReposition = function () {
      if (selectedImage && document.body.contains(selectedImage)) showHandles(selectedImage);
      else if (selectedImage) clearSelection();
    };
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);

    // ──────────────────────────────────────────────────────────
    // INSERT NEW ELEMENT — H2 title or P paragraph
    // Click "+ 標題" or "+ 文字" → cursor turns crosshair → click on
    // any slide to drop a new element at that point.  Element gets
    // a placeholder, is auto-focused, and its text pre-selected so
    // the next keystroke replaces the placeholder.
    // ──────────────────────────────────────────────────────────
    var addH2Btn = document.getElementById('__add_h2_btn__');
    var addPBtn = document.getElementById('__add_p_btn__');
    var pendingInsert = null;

    function enterInsertMode(type) {
      // Clear other modes if they're on
      if (document.body.classList.contains('__pin_mode__')) exitPinMode();
      if (document.body.classList.contains('__move_mode__')) exitMoveMode();
      // Disable contenteditable so click selects the slide, not a caret
      document.querySelectorAll('[contenteditable="true"]').forEach(function (el) {
        el.dataset.__wasInsertEditable__ = '1';
        el.contentEditable = 'false';
      });
      pendingInsert = { type: type };
      document.body.classList.add('__insert_mode__');
      flashUploadStatus(
        '點 slide 上想放置的位置　·　Esc 取消',
        999999
      );
    }

    function exitInsertMode() {
      document.querySelectorAll('[data-__was-insert-editable__="1"]').forEach(function (el) {
        el.contentEditable = 'true';
        delete el.dataset.__wasInsertEditable__;
      });
      document.body.classList.remove('__insert_mode__');
      pendingInsert = null;
      uploadStatus.classList.remove('show');
    }

    addH2Btn.addEventListener('click', function () {
      if (pendingInsert && pendingInsert.type === 'h2') exitInsertMode();
      else enterInsertMode('h2');
    });
    addPBtn.addEventListener('click', function () {
      if (pendingInsert && pendingInsert.type === 'p') exitInsertMode();
      else enterInsertMode('p');
    });

    document.addEventListener('click', function (e) {
      if (!pendingInsert) return;
      if (e.target.closest('#__editor_bar__') ||
          e.target.closest('#__handle_layer__') ||
          e.target.closest('#__prompt_modal__') ||
          e.target.closest('#__home_modal__') ||
          e.target.closest('#__help_modal__') ||
          e.target.closest('#__context_menu__')) return;
      var slide = findSlide(e.target);
      if (!slide) return;
      e.preventDefault();
      e.stopPropagation();

      var rect = slide.getBoundingClientRect();
      var scale = getStageScale(slide) || 1;
      var localX = (e.clientX - rect.left) / scale;
      var localY = (e.clientY - rect.top) / scale;

      var type = pendingInsert.type;
      var el = document.createElement(type);
      el.contentEditable = 'true';
      el.spellcheck = false;
      el.textContent = type === 'h2' ? '點此編輯標題' : '點此編輯一般文字';
      el.style.cssText = [
        'position:absolute',
        'left:' + Math.round(localX) + 'px',
        'top:' + Math.round(localY) + 'px',
        'margin:0',
        'min-width:120px',
        type === 'p' ? 'max-width:600px' : ''
      ].filter(Boolean).join(';');
      targetBody.appendChild(el);
      selectElement(el);

      var key = getSlideKey(slide);
      if (key) {
        dirty.add(key);
        setStatus(dirty.size + ' 張未存', 'dirty');
      }
      exitInsertMode();

      // Focus + select all so the user can immediately type to replace
      setTimeout(function () {
        el.focus();
        var range = document.createRange();
        range.selectNodeContents(el);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }, 30);
    }, true);

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
      '    <h4>方式四　改字體 ／ 字重 ／ 大小 ／ 粗斜底</h4>',
      '    <p>點任何文字 → 上方浮出小工具列：</p>',
      '    <p class="__indent"><b>字體下拉</b>　Google Fonts 13 款（Noto Sans/Serif TC、Inter、Plus Jakarta、IBM Plex、Manrope、Crimson Pro、Lora、JetBrains Mono…），選了動態載入</p>',
      '    <p class="__indent"><b>字重下拉</b>　300 ／ 400 ／ 500 ／ 700</p>',
      '    <p class="__indent"><b>B ／ I ／ U</b>　粗體 ／ 斜體 ／ 底線（先選取一段文字再按，或用 ⌘B ⌘I ⌘U）</p>',
      '    <p class="__indent"><b>− ／ +</b>　字級減／加 2px（也可 Alt+↑ ／ Alt+↓）</p>',
      '    <p class="__indent"><b>RESET</b>　還原所有 font 設定（family、weight、size 一起清掉）</p>',
      '    <p>所有改動寫進元素的 inline style，跟著 ⌘S 一起存檔。</p>',
      '  </div>',
      '  <div class="__help_section">',
      '    <h4>方式六　新增元件</h4>',
      '    <p>工具列「<b>＋ 標題</b>」或「<b>＋ 文字</b>」→ 游標變準心 → 點 slide 上想放的位置 → 元件落地。</p>',
      '    <p>新元件的預設文字會被全選，直接打字就替換。元件有 contenteditable，可以用 B / I / U 加粗斜底、字體大小都能改、移動模式可以拖、右鍵可刪。</p>',
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
      '    <h4>返回首頁</h4>',
      '    <p>工具列左上角「← 首頁」按鈕回到啟動頁，可以換別份簡報來編。</p>',
      '    <p>有未存檔變動會跳對話框，三個選擇：先存檔再返回、丟棄變動返回、取消。</p>',
      '  </div>',
      '  <div class="__help_section">',
      '    <h4>刪除元素</h4>',
      '    <p>右鍵任何元素 → 跳出選單（會用紅框標出當前要刪的）：</p>',
      '    <p class="__indent">·　<b>刪除這個元素</b>　只刪你點到的</p>',
      '    <p class="__indent">·　<b>刪除外層容器</b>　刪整個包住它的 div / 卡片 / section</p>',
      '    <p class="__indent">·　<b>取消</b>　關閉選單什麼都不做</p>',
      '    <p>不小心刪錯？.backups/ 有最近 20 份歷史，可以從那邊還原。</p>',
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

    // ──────────────────────────────────────────────────────────
    // HOME (return-to-launcher) — guards against unsaved edits
    // ──────────────────────────────────────────────────────────
    var homeBtn = document.getElementById('__home_btn__');
    var homeModal = document.createElement('div');
    homeModal.id = '__home_modal__';
    homeModal.innerHTML = [
      '<div class="__pm_card" style="max-width:520px">',
      '  <h3>有未存檔的變動</h3>',
      '  <p class="__pm_subtitle"><span id="__home_count__">0</span> 張 slide 還沒寫回原檔</p>',
      '  <div class="__pm_target" style="white-space:normal">如果直接返回首頁，未存的變動會留在當前的瀏覽器記憶體裡，但不會寫到 HTML 檔。決定要怎麼做：</div>',
      '  <div class="__pm_actions">',
      '    <button class="__btn __btn-ghost" id="__home_cancel__">取消</button>',
      '    <button class="__btn" id="__home_discard__">丟棄變動返回</button>',
      '    <button class="__btn __btn-ink" id="__home_save__">先存檔再返回</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(homeModal);

    var homeCount = document.getElementById('__home_count__');

    async function goHome() {
      try {
        var r = await fetch('/launch/reset', { method: 'POST' });
        var data = await r.json();
        if (data && data.ok) {
          // Clear dirty so beforeunload doesn't double-prompt
          dirty.clear();
          window.location.href = data.redirect;
        }
      } catch (e) {
        alert('返回首頁失敗：' + e);
      }
    }

    homeBtn.addEventListener('click', function () {
      if (dirty.size === 0) {
        goHome();
        return;
      }
      homeCount.textContent = dirty.size;
      homeModal.classList.add('show');
    });
    document.getElementById('__home_cancel__').addEventListener('click', function () {
      homeModal.classList.remove('show');
    });
    document.getElementById('__home_discard__').addEventListener('click', function () {
      homeModal.classList.remove('show');
      goHome();
    });
    document.getElementById('__home_save__').addEventListener('click', async function () {
      // Save first, then go.  saveAll empties the dirty set on success.
      await saveAll();
      if (dirty.size > 0) {
        // Some slides failed to save — let user see the status, don't navigate
        homeModal.classList.remove('show');
        return;
      }
      homeModal.classList.remove('show');
      goHome();
    });
    homeModal.addEventListener('click', function (e) {
      if (e.target === homeModal) homeModal.classList.remove('show');
    });

    // ──────────────────────────────────────────────────────────
    // CONTEXT MENU — right-click any element to delete it
    // ──────────────────────────────────────────────────────────
    var contextMenu = document.createElement('div');
    contextMenu.id = '__context_menu__';
    document.body.appendChild(contextMenu);

    var ctxTarget = null;

    function describeElement(el) {
      var tag = el.tagName.toLowerCase();
      var cls = el.className && typeof el.className === 'string'
        ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.')
        : '';
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length > 50) text = text.slice(0, 50) + '…';
      return '<' + tag + cls + '>' + (text ? '　·　' + text : '');
    }

    function clearCtxOutline() {
      document.querySelectorAll('.__cm_target_outline').forEach(function (el) {
        el.classList.remove('__cm_target_outline');
      });
    }

    function hideContextMenu() {
      contextMenu.classList.remove('show');
      ctxTarget = null;
      clearCtxOutline();
    }

    function showContextMenu(el, x, y) {
      var slide = findSlide(el);
      if (!slide) return;
      if (el === slide) return;  // never let the user delete the slide section itself
      ctxTarget = el;
      clearCtxOutline();
      el.classList.add('__cm_target_outline');

      var parentEl = el.parentElement;
      var canDeleteParent = parentEl && parentEl !== slide;

      contextMenu.innerHTML = [
        '<div class="__cm_header">右鍵選單</div>',
        '<div class="__cm_meta" id="__cm_target_meta__"></div>',
        '<button class="__cm_item __danger" data-action="delete">刪除這個元素</button>',
        canDeleteParent ? '<button class="__cm_item __danger" data-action="delete-parent">刪除外層容器</button>' : '',
        '<button class="__cm_item" data-action="cancel">取消</button>'
      ].filter(Boolean).join('');
      document.getElementById('__cm_target_meta__').textContent = describeElement(el);

      contextMenu.classList.add('show');
      // Position; clamp to viewport
      var rect = contextMenu.getBoundingClientRect();
      var maxX = window.scrollX + window.innerWidth - rect.width - 8;
      var maxY = window.scrollY + window.innerHeight - rect.height - 8;
      contextMenu.style.left = Math.max(8, Math.min(maxX, x + window.scrollX)) + 'px';
      contextMenu.style.top = Math.max(8, Math.min(maxY, y + window.scrollY)) + 'px';
    }

    document.addEventListener('contextmenu', function (e) {
      // Skip our own UI surfaces
      if (e.target.closest('#__editor_bar__') ||
          e.target.closest('#__prompt_modal__') ||
          e.target.closest('#__help_modal__') ||
          e.target.closest('#__font_toolbar__') ||
          e.target.closest('#__handle_layer__') ||
          e.target.closest('#__context_menu__')) return;
      var slide = findSlide(e.target);
      if (!slide) return;
      e.preventDefault();
      showContextMenu(e.target, e.clientX, e.clientY);
    });

    contextMenu.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'cancel' || !ctxTarget) { hideContextMenu(); return; }
      var slide = findSlide(ctxTarget);
      if (!slide) { hideContextMenu(); return; }
      var key = getSlideKey(slide);

      var toRemove = ctxTarget;
      if (action === 'delete-parent') {
        toRemove = ctxTarget.parentElement;
        if (!toRemove || toRemove === slide) { hideContextMenu(); return; }
      }
      // Detach references to anything we're about to delete
      if (selectedImage && (toRemove === selectedImage || toRemove.contains(selectedImage))) {
        clearSelection();
      }
      if (focusedEditable && (toRemove === focusedEditable || toRemove.contains(focusedEditable))) {
        focusedEditable = null;
        fontToolbar.classList.remove('show');
      }
      if (selectedElement && (toRemove === selectedElement || toRemove.contains(selectedElement))) {
        selectedElement.classList.remove('__ed_selected');
        selectedElement = null;
      }
      toRemove.remove();
      if (key) {
        dirty.add(key);
        setStatus(dirty.size + ' 張未存', 'dirty');
      }
      renderTree();
      hideContextMenu();
    });

    document.addEventListener('click', function (e) {
      if (!contextMenu.classList.contains('show')) return;
      if (e.target.closest('#__context_menu__')) return;
      hideContextMenu();
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && contextMenu.classList.contains('show')) {
        hideContextMenu();
      }
    });

    refreshAllPrompts();
    window.addEventListener('resize', refreshDots);
    window.addEventListener('scroll', refreshDots, true);
    setInterval(refreshAllPrompts, 5000);
  });
})();
</script>
