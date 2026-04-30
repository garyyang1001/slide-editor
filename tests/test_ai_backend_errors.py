import subprocess
from types import SimpleNamespace

import slide_editor.ai as ai


def test_call_claude_reports_json_error_result_when_cli_exits_nonzero(monkeypatch):
    def fake_run(*args, **kwargs):
        return SimpleNamespace(
            returncode=1,
            stdout='{"is_error": true, "result": "Not logged in · Please run /login"}',
            stderr="",
        )

    monkeypatch.setattr(ai.subprocess, "run", fake_run)

    result = ai.call_claude("prompt", ".")

    assert result["ok"] is False
    assert result["backend"] == "claude"
    assert "Not logged in" in result["error"]
    assert "Please run /login" in result["error"]


def test_call_claude_reports_empty_stdout_instead_of_parse_nonetype(monkeypatch):
    def fake_run(*args, **kwargs):
        return SimpleNamespace(returncode=0, stdout=None, stderr="")

    monkeypatch.setattr(ai.subprocess, "run", fake_run)

    result = ai.call_claude("prompt", ".")

    assert result["ok"] is False
    assert result["backend"] == "claude"
    assert "empty stdout" in result["error"]
    assert "NoneType" not in result["error"]


def test_call_claude_reports_non_json_stdout_with_preview(monkeypatch):
    def fake_run(*args, **kwargs):
        return SimpleNamespace(returncode=0, stdout="plain text error", stderr="")

    monkeypatch.setattr(ai.subprocess, "run", fake_run)

    result = ai.call_claude("prompt", ".")

    assert result["ok"] is False
    assert result["backend"] == "claude"
    assert "non-JSON output" in result["error"]
    assert "plain text error" in result["error"]


def test_call_claude_reports_timeout_with_seconds(monkeypatch):
    def fake_run(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="claude", timeout=7)

    monkeypatch.setattr(ai.subprocess, "run", fake_run)

    result = ai.call_claude("prompt", ".", timeout=7)

    assert result == {"ok": False, "backend": "claude", "error": "claude timed out (7s)"}


def test_call_codex_reports_empty_output_with_stderr_tail(monkeypatch, tmp_path):
    def fake_run(*args, **kwargs):
        # call_codex passes -o <path>; leave file empty to simulate auth/output failure.
        return SimpleNamespace(returncode=0, stdout="", stderr="401 Unauthorized: Missing bearer")

    monkeypatch.setattr(ai.subprocess, "run", fake_run)

    result = ai.call_codex("prompt", str(tmp_path))

    assert result["ok"] is False
    assert result["backend"] == "codex"
    assert "empty output" in result["error"]
    assert "401 Unauthorized" in result["error"]
