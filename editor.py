#!/usr/bin/env python3
"""Backward-compat shim.

`editor.py` was the original single-file entry. The codebase has been
split into a `slide_editor/` package with main.py at the root.

Existing scripts that call `python3 editor.py …` keep working — this
file just delegates to the package's main().
"""
from slide_editor.server import main

if __name__ == "__main__":
    main()
