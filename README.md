# slide-editor

Inline browser editor for HTML slide decks. Click any text to edit. Drag elements to reposition. Adjust font sizes. Mark a position and let Claude rewrite that block on the spot. Saves changes back to the original `.html` file with auto-backup.

Single-file Python server, no external dependencies, no build step. Designed for the messy middle of slide work where you want to iterate fast without leaving the browser.

```
python3 editor.py path/to/deck.html
```

---

## What it does

| | |
|---|---|
| **Direct edit** | Hover any text. See a hairline outline. Click. Type. |
| **Move** | Toggle move mode. Drag any element. Position stored as `transform: translate(x,y)` on inline style. |
| **Resize text** | Focus a text element. A small floating toolbar above lets you nudge size up or down 2px at a time. |
| **AI rewrite — instant** | Mark a position, type a prompt ("make this punchier"), get a side-by-side diff in 10–15 seconds, accept or reject. |
| **AI rewrite — queued** | Same flow but writes the prompt to `prompts.json` for batch processing in your Claude Code conversation. |
| **Save** | `⌘S` writes back to the source HTML. Auto-backup to `.backups/` before every save (last 20 retained). |

The editor JS is injected on the fly. The deck file stays unmodified except when you explicitly save.

---

## Install

Requires Python 3.7+. Nothing else to install for the core editor.

```bash
git clone https://github.com/garyyang1001/slide-editor.git
cd slide-editor
python3 editor.py examples/demo.html
```

Then open the URL printed to the console (defaults to `http://127.0.0.1:8765/demo.html`).

For instant AI rewriting (the `⚡ 立刻重寫` button), you also need the [Claude Code CLI](https://docs.claude.com/en/docs/claude-code) on your `PATH`. The editor shells out to `claude -p` for each rewrite, so you authenticate once via your existing Claude Code subscription — **no API key needed**.

If you don't want AI rewriting at all, run with `--no-ai`. Manual editing and queue-mode prompts still work.

---

## Usage

```
python3 editor.py DECK [options]

DECK                  Path to the HTML deck file (positional, required).

--port PORT           HTTP port (default: 8765).
--host HOST           Bind address (default: 127.0.0.1).
--slide-tag TAG       HTML tag for each slide (default: section).
--slide-class CLASS   CSS class on each slide (default: slide).
--slide-key ATTR      Unique key attribute per slide (default: data-label).
--no-ai               Disable instant AI rewriting; queueing still works.
```

### Deck structure

The editor expects each slide to be a top-level element with:

- A consistent **tag** (default `section`)
- A **class** marking it as a slide (default `slide`)
- A **unique key attribute** identifying which slide it is (default `data-label`)

Out of the box that means:

```html
<section class="slide" data-label="01 cover"> ... </section>
<section class="slide" data-label="02 features"> ... </section>
```

If your deck uses a different convention, override with the flags. Examples:

```bash
# Decks using <article class="page" id="page-1">
python3 editor.py deck.html --slide-tag article --slide-class page --slide-key id

# Decks using <div data-slide="1">
python3 editor.py deck.html --slide-tag div --slide-class slide --slide-key data-slide
```

The save endpoint uses these to find and rewrite each slide block by regex against the original file.

---

## Editing flow

### Direct text editing

Every text element inside a slide is automatically `contenteditable`. The editor walks each slide and marks any leaf-level element (one whose children are all inline tags or unclassed `<span>`s) as editable. You don't toggle a mode — just click and type. Press `⌘S` to save.

### Move mode

Click `移動模式` in the toolbar (turns red, cursor becomes a grab hand). Drag any element. The position is stored as a `transform: translate(x, y)` on the element's inline `style` attribute. Original layout is preserved — you're nudging an element from its natural position, not absolute-positioning it.

The editor reads `<deck-stage width="…">` if present, otherwise falls back to the slide's `offsetWidth`, to convert screen-pixel drag deltas into slide-coordinate translations. So your drags work the same whether the deck is rendered at 100% or scaled to fit a small window.

Double-click an element in move mode to clear its transform (back to original position).

### Font size

Click any text. A small toolbar floats above the element with `−` `current size` `+` `RESET` buttons. Or press `Alt+↑` / `Alt+↓` to bump 2px at a time. Sizes are stored as inline `font-size` on the element.

### Prompt-based AI rewrite

Click `標記 prompt` (turns red, cursor becomes a crosshair). Click the element you want rewritten. A modal opens with two buttons:

- **`加入佇列`** — appends the prompt to `prompts.json`. Switch to your Claude Code conversation and ask it to "process queue" / "跑 queue" — Claude reads the JSON, edits the HTML directly with full surrounding context, and clears processed entries.
- **`立即重寫`** — shells out to `claude -p` immediately. After 10–15 seconds, the modal switches to a side-by-side `改寫前 / 改寫後` view. Accept (apply + mark slide dirty) or reject (close, no change).

Pending prompts show as red square markers next to their elements until processed.

### Save & backups

`⌘S` (or click `存檔`) writes every modified slide back to the source HTML. The server matches each slide block by `data-label` (or your custom `--slide-key`) and replaces just that section's inner HTML — untouched slides aren't rewritten.

A timestamped backup goes to `.backups/` before every save. The 20 most recent are kept; older ones are pruned automatically.

---

## Architecture

`editor.py` is a single ~700 line Python script wrapping the standard library `http.server`. It does three things:

1. **Serves the deck file**, injecting an editor JS bundle (toolbar, modals, all event handlers) immediately before `</body>` on the way out. The deck file on disk is unmodified.
2. **Persists slide-level edits** via `POST /save-slide`. The handler reads the source HTML, regex-replaces the matching slide block, writes the file. Auto-backup happens before each write.
3. **Manages prompts**. `POST /queue-prompt` and `POST /delete-prompt` mutate `prompts.json`. `POST /ai-edit` shells out to `claude -p` for instant rewrites (gated by `--no-ai`).

The injected JS is embedded as a string template in the Python file. No separate build step. No npm. Just `python3 editor.py` and you're running.

---

## Design

The editor UI follows the **好事發生數位 design system v2.0** — paper background, hairline rules, square corners, Noto Sans TC at weight 300, restrained accent red used only for "this is a decision" markers (active modes, pending prompts, primary call-to-action). No emoji, no drop shadows, no rounded corners, no tech-blue.

Five colors total:

| Token | Hex | Role |
|---|---|---|
| `--ed-ink` | `#2D2A26` | Primary type, anchor borders |
| `--ed-bg` | `#F5F5F0` | Page paper |
| `--ed-gray` | `#8C8C88` | Secondary type, captions |
| `--ed-line` | `#E0E0D8` | Hairline rules |
| `--ed-red` | `#C84630` | Decision markers (≤5% per page) |

Plus `--ed-bg-warm` `#FAFAF5` and `--ed-bg-soft` `#EDEDE6` as surface tints.

All editor styles use scoped `--ed-*` CSS variables so they don't collide with whatever your deck's stylesheet defines.

---

## About 好事發生數位 (Ohya Digital)

好事發生數位 is a Taipei-based digital strategy consultancy founded by Gary Yang. We help professional services firms — consultancies, healthcare systems, B2B exporters — turn their expertise into discoverable, readable, sales-ready online assets.

Two practice areas:

- **好事發生數位有限公司** — SEO and digital strategy consulting, primarily for professional services firms (consultancies, healthcare systems, specialty B2B).
- **Optimus One AI** — Algorithm development and AI workflow integration for enterprise clients.

This editor was built to support our consulting workflow. We generate a lot of HTML slide decks for client engagements — proposals, workshop materials, executive readouts — and we wanted a way to iterate on copy quickly with AI assistance while keeping every change traceable in a real source file. Existing slide tools (Google Slides, Keynote, Slidev) are great, but none of them give you "select this paragraph, tell Claude how to rewrite it, see the diff" inside the live deck. So we built one.

If you're working on something related — slide tooling, AI-assisted editing, design systems for consulting decks — we'd love to hear from you.

- **Email** — gary@ohya.co
- **LINE** — `Skimmr`

---

## License

MIT. Use it, fork it, ship it. Attribution appreciated but not required.
