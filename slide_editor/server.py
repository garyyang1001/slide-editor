"""HTTP server, request handler, CLI argparse, boot."""
import argparse
import base64
import http.server
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import tempfile
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

from .ai import build_rewrite_prompt, call_ai, resolve_backend
from .images import parse_multipart_upload, save_image_upload
from .launcher import (
    LAUNCHER_HTML,
    RECENT_FILE,
    WORKSPACE_DIR,
    delete_recent,
    extract_claude_zip,
    load_recent,
    reset_to_launcher_mode,
    save_recent,
    switch_to_editor_mode,
)

EDITOR_JS_PATH = Path(__file__).parent / "overlay" / "editor.js"
with open(EDITOR_JS_PATH, "r", encoding="utf-8") as f:
    EDITOR_JS_TEMPLATE = f.read()


# ────────────────────────────────────────────────────────────────────
# Persistence helpers (per-deck files: prompts.json, .backups/)
# ────────────────────────────────────────────────────────────────────

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


def find_chrome():
    candidates = [
        shutil.which("google-chrome"),
        shutil.which("chromium"),
        shutil.which("chrome"),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
    for path in candidates:
        if path and os.path.exists(path):
            return path
    return None


class CdpWebSocket:
    def __init__(self, ws_url):
        parsed = urllib.parse.urlparse(ws_url)
        self.host = parsed.hostname
        self.port = parsed.port
        self.path = parsed.path + (("?" + parsed.query) if parsed.query else "")
        self.sock = socket.create_connection((self.host, self.port), timeout=10)
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = (
            "GET %s HTTP/1.1\r\n"
            "Host: %s:%d\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Key: %s\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        ) % (self.path, self.host, self.port, key)
        self.sock.sendall(request.encode("ascii"))
        response = self.sock.recv(4096)
        if b" 101 " not in response.split(b"\r\n", 1)[0]:
            raise RuntimeError("CDP websocket handshake failed")
        self._id = 0

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass

    def _send_text(self, text):
        payload = text.encode("utf-8")
        header = bytearray([0x81])
        length = len(payload)
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header.extend(length.to_bytes(2, "big"))
        else:
            header.append(0x80 | 127)
            header.extend(length.to_bytes(8, "big"))
        mask = os.urandom(4)
        header.extend(mask)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(header) + masked)

    def _recv_text(self):
        chunks = []
        while True:
            first = self.sock.recv(2)
            if len(first) < 2:
                raise RuntimeError("CDP websocket closed")
            opcode = first[0] & 0x0F
            length = first[1] & 0x7F
            if length == 126:
                length = int.from_bytes(self.sock.recv(2), "big")
            elif length == 127:
                length = int.from_bytes(self.sock.recv(8), "big")
            masked = first[1] & 0x80
            mask = self.sock.recv(4) if masked else b""
            payload = b""
            while len(payload) < length:
                payload += self.sock.recv(length - len(payload))
            if masked:
                payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            if opcode == 0x8:
                raise RuntimeError("CDP websocket closed")
            if opcode == 0x9:
                continue
            if opcode in (0x1, 0x0):
                chunks.append(payload)
                if first[0] & 0x80:
                    return b"".join(chunks).decode("utf-8")

    def call(self, method, params=None, timeout=30):
        self._id += 1
        msg_id = self._id
        self._send_text(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
        old_timeout = self.sock.gettimeout()
        self.sock.settimeout(timeout)
        try:
            while True:
                msg = json.loads(self._recv_text())
                if msg.get("id") != msg_id:
                    continue
                if "error" in msg:
                    raise RuntimeError("%s failed: %s" % (method, msg["error"]))
                return msg.get("result", {})
        finally:
            self.sock.settimeout(old_timeout)


def chrome_print_pdf(chrome, url, pdf_path):
    user_data_dir = tempfile.mkdtemp(prefix="slide-editor-chrome-")
    proc = None
    try:
        proc = subprocess.Popen(
            [
                chrome,
                "--headless=new",
                "--disable-gpu",
                "--no-sandbox",
                "--remote-debugging-port=0",
                "--user-data-dir=" + user_data_dir,
                "--hide-scrollbars",
                url,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        port_file = os.path.join(user_data_dir, "DevToolsActivePort")
        deadline = time.time() + 20
        while time.time() < deadline and not os.path.exists(port_file):
            if proc.poll() is not None:
                _, stderr = proc.communicate(timeout=1)
                raise RuntimeError(stderr.decode("utf-8", errors="replace")[-1200:])
            time.sleep(0.05)
        if not os.path.exists(port_file):
            raise RuntimeError("Chrome DevTools port did not open")
        with open(port_file, "r", encoding="utf-8") as f:
            port = int(f.readline().strip())
        deadline = time.time() + 20
        target = None
        while time.time() < deadline:
            with urllib.request.urlopen("http://127.0.0.1:%d/json/list" % port, timeout=2) as r:
                targets = json.loads(r.read().decode("utf-8"))
            target = next((t for t in targets if t.get("type") == "page" and t.get("webSocketDebuggerUrl")), None)
            if target:
                break
            time.sleep(0.1)
        if not target:
            raise RuntimeError("Chrome page target not found")
        ws = CdpWebSocket(target["webSocketDebuggerUrl"])
        try:
            ws.call("Page.enable")
            ws.call("Emulation.setEmulatedMedia", {"media": "print"})
            ws.call("Runtime.evaluate", {
                "expression": "document.fonts ? document.fonts.ready.then(() => true) : true",
                "awaitPromise": True,
            }, timeout=20)
            time.sleep(0.5)
            result = ws.call("Page.printToPDF", {
                "printBackground": True,
                "preferCSSPageSize": True,
                "landscape": True,
                "paperWidth": 20,
                "paperHeight": 11.25,
                "marginTop": 0,
                "marginRight": 0,
                "marginBottom": 0,
                "marginLeft": 0,
                "scale": 1,
            }, timeout=60)
        finally:
            ws.close()
        data = base64.b64decode(result["data"])
        with open(pdf_path, "wb") as f:
            f.write(data)
    finally:
        if proc:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        shutil.rmtree(user_data_dir, ignore_errors=True)


# ────────────────────────────────────────────────────────────────────
# Config + Handler
# ────────────────────────────────────────────────────────────────────

class Config:
    pass


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
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path
            query = urllib.parse.parse_qs(parsed.query)

            # Launcher mode: any GET returns the cover page (or recents JSON)
            if config.mode == "launcher":
                if path == "/api/recent":
                    self._send_json(200, {"projects": load_recent()})
                    return
                if path == "/" or path == "":
                    body = LAUNCHER_HTML.encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                # Anything else in launcher mode: 404
                self.send_error(404, "launcher mode — only GET / works")
                return

            # Editor mode below
            if path == "/list-prompts":
                with config.prompts_lock:
                    data = load_prompts(config.prompts_file)
                self._send_json(200, data)
                return
            if path == "/export-pdf":
                chrome = find_chrome()
                if not chrome:
                    self._send_json(
                        500,
                        {"ok": False, "error": "Chrome/Chromium not found for PDF export"},
                    )
                    return
                host = self.headers.get("Host") or ("%s:%d" % (config.host, config.port))
                deck_url = (
                    "http://%s/%s?__export_pdf=1"
                    % (host, urllib.parse.quote(config.deck_file))
                )
                base = os.path.splitext(os.path.basename(config.deck_file))[0]
                safe_base = re.sub(r"[^\w\u4e00-\u9fff.-]+", "-", base).strip("-") or "deck"
                fd, pdf_path = tempfile.mkstemp(prefix=safe_base + "-", suffix=".pdf")
                os.close(fd)
                try:
                    chrome_print_pdf(chrome, deck_url, pdf_path)
                    if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) == 0:
                        self._send_json(
                            500,
                            {"ok": False, "error": "PDF export failed"},
                        )
                        return
                    with open(pdf_path, "rb") as f:
                        body = f.read()
                    filename = safe_base + ".pdf"
                    self.send_response(200)
                    self.send_header("Content-Type", "application/pdf")
                    self.send_header(
                        "Content-Disposition",
                        "attachment; filename*=UTF-8''%s" % urllib.parse.quote(filename),
                    )
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                except Exception as e:
                    self._send_json(500, {"ok": False, "error": str(e)})
                    return
                finally:
                    try:
                        os.remove(pdf_path)
                    except OSError:
                        pass
            if path == "/api/recent":
                self._send_json(200, {"projects": load_recent()})
                return
            if path == "/" or path == "":
                # Redirect to the active deck
                self.send_response(302)
                self.send_header(
                    "Location", "/" + urllib.parse.quote(config.deck_file)
                )
                self.end_headers()
                return
            decoded = urllib.parse.unquote(path).lstrip("/")
            if decoded == config.deck_file:
                try:
                    with open(config.deck_path, "rb") as f:
                        body = f.read()
                except OSError as e:
                    self.send_error(500, str(e))
                    return
                if "__export_pdf" not in query:
                    editor_js = (
                        EDITOR_JS_TEMPLATE
                        .replace("__SLIDE_SELECTOR__", config.slide_selector)
                        .replace("__SLIDE_KEY__", config.slide_key)
                    )
                    if b"</body>" in body:
                        body = body.replace(b"</body>", editor_js.encode("utf-8") + b"</body>", 1)
                    else:
                        body = body + editor_js.encode("utf-8")
                else:
                    export_css = """
<style id="slide-editor-export-pdf">
  @page { size: 1920px 1080px; margin: 0; }
  @media print {
    html, body {
      width: 1920px !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      overflow: visible !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    deck-stage {
      display: block !important;
      position: static !important;
      width: 1920px !important;
      height: auto !important;
      background: #fff !important;
      overflow: visible !important;
    }
    deck-stage > section.slide {
      display: block !important;
      position: relative !important;
      inset: auto !important;
      width: 1920px !important;
      height: 1080px !important;
      box-sizing: border-box !important;
      opacity: 1 !important;
      visibility: visible !important;
      overflow: hidden !important;
      break-after: page;
      page-break-after: always;
    }
    deck-stage > section.slide:last-of-type {
      break-after: auto;
      page-break-after: auto;
    }
  }
</style>
"""
                    body = re.sub(
                        br'<script\s+src=["\']deck-stage\.js["\']\s*>\s*</script>',
                        b"",
                        body,
                        flags=re.IGNORECASE,
                    )
                    if b"</head>" in body:
                        body = body.replace(b"</head>", export_css.encode("utf-8") + b"</head>", 1)
                    else:
                        body = export_css.encode("utf-8") + body
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            super().do_GET()

        def do_POST(self):
            # ── Launcher endpoints work in both launcher and editor mode ──
            if self.path == "/launch/zip":
                parts = parse_multipart_upload(self)
                file_part = next((p for p in parts if p.get("filename")), None)
                if not file_part:
                    self._send_json(400, {"ok": False, "error": "no zip file in upload"})
                    return
                if not file_part["filename"].lower().endswith(".zip"):
                    self._send_json(400, {"ok": False, "error": "expected a .zip file"})
                    return
                try:
                    deck_path = extract_claude_zip(file_part["data"], file_part["filename"])
                except (ValueError, OSError) as e:
                    self._send_json(400, {"ok": False, "error": str(e)})
                    return
                try:
                    switch_to_editor_mode(config, deck_path)
                except ValueError as e:
                    self._send_json(500, {"ok": False, "error": str(e)})
                    return
                save_recent(deck_path, "zip")
                self._send_json(
                    200,
                    {"ok": True, "redirect": "/" + urllib.parse.quote(config.deck_file)},
                )
                return

            if self.path == "/api/recent/delete":
                try:
                    payload = self._read_json()
                    target = payload.get("path", "").strip()
                except Exception as e:
                    self._send_json(400, {"ok": False, "error": "bad payload: %s" % e})
                    return
                if not target:
                    self._send_json(400, {"ok": False, "error": "missing path"})
                    return
                removed = delete_recent(target)
                self._send_json(200, {"ok": True, "removed": removed})
                return

            if self.path == "/launch/reset":
                reset_to_launcher_mode(config)
                self._send_json(200, {"ok": True, "redirect": "/"})
                return

            if self.path == "/launch/path":
                try:
                    payload = self._read_json()
                    raw = payload.get("path", "").strip()
                except Exception as e:
                    self._send_json(400, {"ok": False, "error": "bad payload: %s" % e})
                    return
                if not raw:
                    self._send_json(400, {"ok": False, "error": "empty path"})
                    return
                deck_path = os.path.abspath(os.path.expanduser(raw))
                if not os.path.exists(deck_path):
                    self._send_json(400, {"ok": False, "error": "path not found: %s" % deck_path})
                    return
                if not os.path.isfile(deck_path):
                    self._send_json(400, {"ok": False, "error": "not a file: %s" % deck_path})
                    return
                if not deck_path.lower().endswith(".html"):
                    self._send_json(400, {"ok": False, "error": "must be .html: %s" % deck_path})
                    return
                try:
                    switch_to_editor_mode(config, deck_path)
                except ValueError as e:
                    self._send_json(500, {"ok": False, "error": str(e)})
                    return
                save_recent(deck_path, "path")
                self._send_json(
                    200,
                    {"ok": True, "redirect": "/" + urllib.parse.quote(config.deck_file)},
                )
                return

            # ── Everything below requires editor mode ──
            if config.mode != "editor":
                self.send_error(404, "launcher mode — load a deck first")
                return

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


# ────────────────────────────────────────────────────────────────────
# CLI / boot
# ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="slide-editor — inline browser editor for HTML slide decks.",
        epilog=(
            "Examples:\n"
            "  python3 main.py                           # launcher (cover page)\n"
            "  python3 main.py examples/demo.html        # direct editor mode\n"
            "  python3 -m slide_editor [DECK]            # same, via package entry"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "deck", nargs="?", default=None,
        help="path to the HTML deck file (omit to start in launcher mode)",
    )
    parser.add_argument("--port", type=int, default=8765, help="HTTP port (default: 8765)")
    parser.add_argument("--host", default="127.0.0.1", help="bind address (default: 127.0.0.1)")
    parser.add_argument(
        "--slide-tag", default="section",
        help="HTML tag used for each slide (default: section)",
    )
    parser.add_argument(
        "--slide-class", default="slide",
        help="CSS class on each slide element (default: slide)",
    )
    parser.add_argument(
        "--slide-key", default="data-label",
        help="attribute used as unique key per slide (default: data-label)",
    )
    parser.add_argument(
        "--no-ai", action="store_true",
        help="disable instant AI rewriting (queueing still works)",
    )
    parser.add_argument(
        "--backend", choices=["claude", "codex", "auto"], default="auto",
        help="AI backend for instant rewriting. 'auto' prefers claude, falls back to codex (default: auto)",
    )
    args = parser.parse_args()

    config = Config()
    config.slide_tag = args.slide_tag
    config.slide_class = args.slide_class
    config.slide_key = args.slide_key
    config.slide_selector = "%s.%s" % (args.slide_tag, args.slide_class)
    config.ai_enabled = not args.no_ai
    config.backend = args.backend
    config.host = args.host
    config.port = args.port
    config.write_lock = threading.Lock()
    config.prompts_lock = threading.Lock()

    if args.deck:
        deck_path = os.path.abspath(args.deck)
        if not os.path.exists(deck_path):
            print("error: deck file not found: %s" % deck_path, file=sys.stderr)
            sys.exit(1)
        if not os.path.isfile(deck_path):
            print("error: not a file: %s" % deck_path, file=sys.stderr)
            sys.exit(1)
        switch_to_editor_mode(config, deck_path)
    else:
        config.mode = "launcher"
        config.docroot = None
        config.deck_path = None
        config.deck_file = None
        config.backup_dir = None
        config.prompts_file = None

    Handler = make_handler(config)
    httpd = http.server.ThreadingHTTPServer((args.host, args.port), Handler)
    if config.mode == "editor":
        url = "http://%s:%d/%s" % (args.host, args.port, urllib.parse.quote(config.deck_file))
    else:
        url = "http://%s:%d/" % (args.host, args.port)

    if config.ai_enabled:
        chosen = resolve_backend(config.backend)
        if chosen:
            ai_state = "on (%s)" % chosen
        else:
            ai_state = "on (no backend found — install claude or codex CLI)"
    else:
        ai_state = "off"

    print("slide-editor running")
    print("  mode:       %s" % config.mode)
    print("  url:        %s" % url)
    if config.mode == "editor":
        print("  deck:       %s" % config.deck_path)
        print("  selector:   %s [%s]" % (config.slide_selector, config.slide_key))
        print("  backups:    %s" % config.backup_dir)
        print("  prompts:    %s" % config.prompts_file)
    else:
        print("  workspace:  %s" % WORKSPACE_DIR)
        print("  recents:    %s" % RECENT_FILE)
    print("  ai-rewrite: %s" % ai_state)
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")
