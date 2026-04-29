"""AI rewriting backends: Claude Code CLI and OpenAI Codex CLI.

Both use OAuth (no API key required).  Each helper returns a normalized
dict: {ok, new_html, cost_usd, duration_ms, backend, error?}.
"""
import json
import os
import shutil
import subprocess
import tempfile
import time

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
