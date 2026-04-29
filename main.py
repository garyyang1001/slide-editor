#!/usr/bin/env python3
"""slide-editor entry point.

    python3 main.py                          # launcher (cover page)
    python3 main.py path/to/deck.html        # direct editor mode
    python3 main.py --help                   # all flags

Equivalent to `python3 -m slide_editor` if you prefer the package form.
"""
from slide_editor.server import main

if __name__ == "__main__":
    main()
