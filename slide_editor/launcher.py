"""Launcher (no-deck startup) — cover page, zip extraction, recents.

Server boots without a deck arg → serves a cover page that lets the user
pick a deck via zip upload, by typing a path, or by clicking a recent
project.  Switching to editor mode mutates the shared Config so the rest
of the server starts behaving as if the deck had been passed at the CLI.
"""
import io
import json
import os
import re
import shutil
import zipfile
from datetime import datetime
from pathlib import Path

WORKSPACE_DIR = Path.home() / ".slide-editor" / "projects"
RECENT_FILE = Path.home() / ".slide-editor" / "recent.json"
SAFE_BASENAME_RE = re.compile(r"[^A-Za-z0-9._一-鿿-]")
RECENT_CAP = 20

LAUNCHER_HTML_PATH = Path(__file__).parent / "overlay" / "launcher.html"


def _load_launcher_html():
    with open(LAUNCHER_HTML_PATH, "r", encoding="utf-8") as f:
        return f.read()


# Read once at import; the file is static so no need to re-read per request.
LAUNCHER_HTML = _load_launcher_html()


def safe_workspace_name(raw):
    base = SAFE_BASENAME_RE.sub("_", raw or "deck")
    return base.strip("._") or "deck"


def extract_claude_zip(zip_bytes, source_name):
    """Write zip to ~/.slide-editor/projects/<name>-<ts>/, return main HTML path."""
    base = safe_workspace_name(os.path.splitext(source_name)[0])
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    project_dir = WORKSPACE_DIR / f"{base}-{ts}"
    project_dir.mkdir(parents=True, exist_ok=True)
    real_root = os.path.realpath(project_dir)

    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for member in zf.infolist():
                if member.is_dir():
                    continue
                name = member.filename
                # Skip macOS resource forks and dotfiles at root
                if "__MACOSX" in name or os.path.basename(name).startswith("._"):
                    continue
                target = os.path.realpath(os.path.join(project_dir, name))
                if not target.startswith(real_root + os.sep) and target != real_root:
                    raise ValueError("path traversal blocked: %s" % name)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with zf.open(member) as src, open(target, "wb") as dst:
                    shutil.copyfileobj(src, dst)
    except zipfile.BadZipFile as e:
        raise ValueError("not a valid zip: %s" % e)

    # Find the main HTML — prefer top-level, then any sub-folder
    htmls_top = sorted(p for p in project_dir.iterdir() if p.is_file() and p.suffix.lower() == ".html")
    if htmls_top:
        return str(htmls_top[0])
    for root, _, files in os.walk(project_dir):
        for f in sorted(files):
            if f.lower().endswith(".html"):
                return os.path.join(root, f)
    raise ValueError("zip contains no .html file")


def load_recent():
    if not RECENT_FILE.exists():
        return []
    try:
        with open(RECENT_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("projects", [])
    except (OSError, json.JSONDecodeError):
        return []


def write_recent(items):
    RECENT_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = str(RECENT_FILE) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"projects": items}, f, ensure_ascii=False, indent=2)
    os.replace(tmp, str(RECENT_FILE))


def save_recent(deck_path, source):
    items = load_recent()
    deck_path = str(deck_path)
    items = [p for p in items if p.get("path") != deck_path]
    items.insert(
        0,
        {
            "path": deck_path,
            "name": os.path.basename(deck_path),
            "source": source,
            "loaded_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        },
    )
    write_recent(items[:RECENT_CAP])


def delete_recent(deck_path):
    items = load_recent()
    before = len(items)
    items = [p for p in items if p.get("path") != deck_path]
    write_recent(items)
    return before - len(items)


def switch_to_editor_mode(config, deck_path):
    """Mutate the shared config so the server starts serving deck_path."""
    deck_path = os.path.abspath(deck_path)
    if not os.path.isfile(deck_path):
        raise ValueError("not a file: %s" % deck_path)
    config.docroot = os.path.dirname(deck_path)
    config.deck_path = deck_path
    config.deck_file = os.path.basename(deck_path)
    config.backup_dir = os.path.join(config.docroot, ".backups")
    config.prompts_file = os.path.join(config.docroot, "prompts.json")
    config.mode = "editor"
    os.chdir(config.docroot)


def reset_to_launcher_mode(config):
    """Flip the live config back to launcher mode."""
    config.mode = "launcher"
    config.docroot = None
    config.deck_path = None
    config.deck_file = None
    config.backup_dir = None
    config.prompts_file = None
