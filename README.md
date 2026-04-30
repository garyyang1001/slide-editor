# Claude Slide Editor

> repo / 套件名：`slide-editor`　·　產品名（首頁顯示）：**Claude Slide Editor**

瀏覽器內的 HTML 簡報編輯器。**點文字直接編輯、新增標題／段落、改字體字重、貼上圖片、AI 一鍵改寫某段、右鍵刪除元件、拖元件、自動備份**。改完寫回原檔。

單一 Python 檔，零外部相依，無建置步驟。為「**Claude Design 出第一版，本機編輯器接手後續迭代**」這個工作流而做。

兩種啟動方式：

```bash
# A) 啟動首頁（拖 Claude Design zip 進來、或貼路徑、或從最近開過清單）
python3 main.py

# B) 直接編輯指定 deck
python3 main.py path/to/deck.html

# 或用 package 形式（同效）
python3 -m slide_editor [DECK]
```

## 介紹影片

40 秒介紹影片，三段功能實機演示：游標移動、hover 提示、文字打字、圖片拖放、四角縮放、AI 改寫 modal、改前改後對照、套用。

[![Claude Slide Editor 介紹影片](assets/thumbnail.png)](https://www.youtube.com/watch?v=XzqKnguk63k)

▶ **[YouTube 上看完整影片](https://www.youtube.com/watch?v=XzqKnguk63k)**

> 影片用 [Remotion](https://www.remotion.dev/) 寫的，原始碼在 [`video/`](video/)，`cd video && npm install && npm run render` 一行可重出。

---

## 為什麼做這個

[Claude Design](https://claude.ai/) 跟 Artifacts 出第一版簡報很猛，但**做後續調整非常吃 token**：每改一句話、調一張卡片，整份 deck 都要重灌進 context，幾輪下來 quota 就燒光。對需要反覆打磨文案的簡報工作，這個成本不合理。

`slide-editor` 解的是這個問題。流程：

```
  ┌─────────────────┐    匯出 zip    ┌──────────────┐    本機編輯    ┌──────────────┐
  │  Claude Design  │ ─────────────▶│  unzip 到本機 │ ─────────────▶│ slide-editor │
  │  生第一版簡報    │                │              │                │  本機迭代     │
  └─────────────────┘                └──────────────┘                └──────────────┘
                                                                           │
                                                                           ▼
                                                                     ⌘S 寫回原檔
                                                                     自動備份
```

第一版交給 Claude Design 處理（它擅長從零生整份 deck）。後續所有調整 ── 改文案、搬卡片、改字級、要 AI 重寫某一段、新增 / 刪除元件 ── 全部在本機 `slide-editor` 裡完成。手動編輯完全免費，AI 改寫每次只送一個元素 + 一個指令進 LLM，token 用量是 Claude Design 重生整份的零頭。

---

## 它能做什麼

| | |
|---|---|
| **直接編輯文字** | 滑到任何文字 → 淡灰細線提示 → 點下去 → 打字。所有 slide 內可編輯文字自動偵測。 |
| **新增元件** | 工具列「＋ 標題」/「＋ 文字」→ 游標準心 → 點 slide 位置放，placeholder 文字全選，直接打字取代。 |
| **粗 / 斜 / 底** | 字體工具列 `B` / `I` / `U`，或鍵盤 `⌘B` / `⌘I` / `⌘U`。 |
| **改字體** | 13 款 Google Fonts：Noto Sans/Serif TC、Inter、Plus Jakarta、IBM Plex、Manrope、Crimson Pro、Lora、JetBrains Mono…，動態載入。 |
| **改字重 / 字級** | 字體工具列下拉 300/400/500/700 + 加減按鈕（或 `Alt+↑` / `Alt+↓`）。 |
| **移動元件** | 移動模式 → 拖元件，或選中後用方向鍵微調。位置存成 `transform: translate(x,y)`。雙擊還原。 |
| **結構面板** | 工具列「結構」查看目前 slide 的 DOM 樹，點一列即可選中對應元素。 |
| **插入圖片** | 拖檔進瀏覽器 → 落在拖放點。或工具列「新增圖片」→ 自動放當前 slide 中央。 |
| **縮放圖片** | 點圖片 → 四角 handle → 拖角縮放，鎖定長寬比。 |
| **AI 改寫（即時）** | 標記某段 → 輸入指令 → 10–18 秒後跳「改前 / 改後」對照 → 接受或丟棄。 |
| **AI 改寫（佇列）** | 標記後選「加入佇列」→ 累積一批 → 回 Claude Code 對話框說「跑 queue」批次處理。 |
| **右鍵刪除元件** | 右鍵任何元素 → 紙底選單 → 刪這個 / 刪外層容器。 |
| **拖移工具列** | 工具列頂端「編輯器 ／ ⋯」可拖到任何位置，記憶在 localStorage，雙擊還原。 |
| **返回首頁** | 工具列「← 首頁」回啟動頁換別份簡報。未存會三選一守門：先存再返回 / 丟棄返回 / 取消。 |
| **存檔** | `⌘S` 寫回原始 HTML。每次存前自動備份到 `.backups/`，保留 20 份。 |
| **匯出 PDF** | 工具列「匯出 PDF」會先存檔，再用本機 Chrome 產生一份每頁一張 slide 的 PDF。 |

編輯器 JS 是 server 注入的，原始 HTML 檔在你按存檔之前**完全不會被動到**。

---

## 安裝

需要 Python 3.7 以上。沒了。

```bash
git clone https://github.com/garyyang1001/slide-editor.git
cd slide-editor
python3 main.py             # 啟動首頁
# 或
python3 main.py examples/demo.html   # 直接編輯指定 deck
```

開瀏覽器到終端機印的網址（預設 `http://127.0.0.1:8765/`）。

> 舊指令 `python3 editor.py` 仍然可用（保留為向後相容 shim）。

如果想用「即時 AI 改寫」（按下「立即重寫」會 10–18 秒後跳對照），需要至少裝**其中一個** AI CLI：

| Backend | 安裝 | 登入方式 | 不用 API key |
|---|---|---|---|
| **Claude Code CLI** | [docs.claude.com/en/docs/claude-code](https://docs.claude.com/en/docs/claude-code) | Anthropic 帳號 | ✓ |
| **OpenAI Codex CLI** | `npm i -g @openai/codex` | ChatGPT 帳號（OAuth） | ✓ |

兩個都用 OAuth 登入、吃你的訂閱 quota，**完全不用 API key**。預設會自動偵測，先用 claude，沒裝才用 codex。

完全不要 AI 的話加 `--no-ai`，手動編輯 + 排隊 prompt 一樣可用。

---

## 使用方式

```
python3 main.py [DECK] [options]
# or:
python3 -m slide_editor [DECK] [options]

DECK                  HTML 簡報檔的路徑（可省略 → 啟動首頁）

--port PORT           HTTP port（預設：8765）
--host HOST           綁定地址（預設：127.0.0.1）
--backend BACKEND     AI backend：claude / codex / auto（預設：auto）
--no-ai               停用即時 AI 改寫（佇列功能還在）

--slide-tag TAG       slide 用的 HTML tag（預設：section）
--slide-class CLASS   slide 的 CSS class（預設：slide）
--slide-key ATTR      slide 的唯一鍵屬性（預設：data-label）
```

### 啟動首頁

不傳 `DECK` 跑 `python3 editor.py`，server 會啟動成 launcher 模式，瀏覽器到 `http://127.0.0.1:8765/` 看到一張紙感封面，三種載入方式：

1. **拖 zip**　Claude Design 匯出的 zip 拖進去 → 自動解壓到 `~/.slide-editor/projects/<name>-<時間戳>/` → 找到 `.html` → 切換成 editor 模式 → 跳轉
2. **貼路徑**　絕對路徑到本機 `.html` → 驗證 → 載入
3. **最近開過**　顯示最近 10 個專案，點一下重開

未來想換別份簡報：editor 工具列「← 首頁」回到啟動頁。

### 你的 deck 結構長什麼樣

預設情況下，編輯器假設每張 slide 是這個形狀：

```html
<section class="slide" data-label="01 cover"> ... </section>
<section class="slide" data-label="02 features"> ... </section>
```

如果你的 deck 用不一樣的結構，用旗標調整：

```bash
# 用 <article class="page" id="page-1"> 結構
python3 editor.py deck.html --slide-tag article --slide-class page --slide-key id

# 用 <div data-slide="1"> 結構
python3 editor.py deck.html --slide-tag div --slide-class slide --slide-key data-slide
```

存檔的 regex 會根據這三個值組出來，找到對應的 slide 區塊覆寫。

---

## 編輯方式

### 一　直接改文字

每個 slide 內的文字元素自動是 `contenteditable`。編輯器會掃 slide 內所有元素，把「子元素都是 inline tag 或無 class span 的 leaf 元素」標成可編輯。**不用切換模式 ── 滑過去就有淡灰細線提示，點下去就能改**。

`⌘S` 存檔。

### 二　新增元件

工具列「**＋ 標題**」（h2）或「**＋ 文字**」（p）→ 游標變準心，slide hover 邊框變紅 → **點任何 slide 任何位置** → 元件落地 + 自動 focus + placeholder 文字全選 → 直接打字取代。

新元件用 `position: absolute` + 點擊位置作 left/top，所以不會破壞原本 layout。可以用後續所有功能編輯（字體、字重、粗斜底、移動、刪除）。

### 三　改字體 ／ 字重 ／ 字級 ／ 粗斜底

點任何文字 → 元素上方浮出小工具列：

```
[ 字體 ▾ ]  [ 字重 ▾ ]  [ B ]  [ I ]  [ U ]  [ − ]  [ 16px ]  [ + ]  [ RESET ]
```

| 控制 | 動作 |
|---|---|
| **字體下拉** | 13 款 Google Fonts。Noto Sans/Serif TC、Inter、Plus Jakarta Sans、IBM Plex Sans、Manrope、Space Grotesk、DM Sans、Crimson Pro、Lora、Playfair Display、JetBrains Mono、IBM Plex Mono。**選了動態載入**，沒選不會先載入。 |
| **字重下拉** | 300 / 400 / 500 / 700 |
| **B ／ I ／ U** | 粗體 / 斜體 / 底線。先選一段文字再點，或鍵盤 `⌘B` / `⌘I` / `⌘U`。 |
| **− ／ +** | 字級減／加 2px（也可 `Alt+↑` / `Alt+↓`） |
| **RESET** | 還原所有 font 設定（family、weight、size 一起清掉） |

所有改動寫進元素的 inline style，跟著 `⌘S` 一起存檔。

### 四　移動元件

點工具列「**移動模式**」（會變紅、游標變抓手）。拖任何元件。

位置存成元素的 inline style：`transform: translate(20px, -8px)`。原本的 flow layout 不會崩，等於是「把元件從原位輕微推開」而不是絕對定位重來。

如果 deck 用 `<deck-stage width="…">` 縮放，編輯器會自己處理 scale 換算 ── 你拖 20px 就是 slide 座標 20px，不會因為視窗大小而跑掉。

點一下元素會用紅框選取；選中後可以用方向鍵微調 1px，按住 `Shift` 變成 10px。這個快捷鍵在 capture 階段處理，避免被 deck 自己的左右鍵翻頁邏輯吃掉。

雙擊任何元件：清掉它的 transform，回到原位。

### 五　查看 slide 結構

工具列「**結構**」會打開目前 slide 的 DOM 樹。每列會顯示 tag、class、id 和一小段文字，點一列即可選中該元素，方便處理「標題跑到 slide-frame 外面」、「巢狀 h2」、「空標題」這類版面問題。

存檔前，編輯器會做一個小型結構整理：

- 把跑出 `.slide-frame` / `.slide-body` 的可見元素移回主要內容區
- 把 heading 裡面巢狀的 heading 改成 `span`
- 移除空的 heading

這不是設計重排，只是避免 editable DOM 存出不穩定的 HTML。

### 六　插入與縮放圖片

兩種上傳路徑，看你要不要當下指定位置：

- **拖檔**　把圖片從 Finder 拖進瀏覽器，落在哪張 slide 圖就放哪裡。**用這個指定確切位置**。
- **按鈕**　工具列「**新增圖片**」→ 選檔 → 圖片自動放到**當前看的那張 slide 中央**，並自動選中（馬上看到縮放 handle）。

按鈕流程的「當前 slide」偵測有四層保險：

1. `[data-deck-active]` 屬性（`<deck-stage>` 跟類似系統會標）
2. 當前唯一可見的 slide（檢查 `display` / `opacity` / `visibility` / 渲染矩形）
3. 視窗中央最接近的 slide（給捲動式 deck 用）
4. 第一張（最後保險）

圖片儲存到 deck 旁的 `images/` 資料夾，HTML 用相對路徑引用。**支援格式**：jpg / png / webp / gif / svg，**單檔上限** 10 MB。

插入後：

- **移動**　開移動模式拖曳，跟其他元件一樣。
- **縮放**　點圖片 → 四個角出現方塊 handle → 拖角縮放，鎖定長寬比。
- **刪除**　選中圖片按 `Backspace` 或 `Delete`。

### 七　AI 改寫某段

點工具列「**標記 prompt**」（會變紅、游標變準心）。在 slide 上點你要改寫的元素 → 跳出對話框：

```
改寫這段內容
位於 02 features ·  <h3>

當前內容：
─────────────────────────
| Type to edit text     |
─────────────────────────

[ textarea：你要怎麼改 ]

[ 取消 ]  [ 加入佇列 ]  [ 立即重寫 ]
```

兩個按鈕擇一：

- **加入佇列**　prompt 寫到 `prompts.json`。回 Claude Code 對話框說「跑 queue」/「處理 queue」 → 我會讀檔、看上下文、用 Edit 改 HTML、自動清空佇列。一次處理多筆，效果最好。
- **立即重寫**　當下呼叫 claude 或 codex CLI，10–18 秒後對話框切換成「改寫前 ／ 改寫後」並排。`套用` / `丟棄` / `改 prompt 再試`。

待處理的 prompt 會在元素旁顯示紅色小方塊計數，可以隨時點開看／刪。

### 八　刪除元件

**右鍵任何元素** → 跳出紙底選單，紅框框出當前要刪的目標：

| 選項 | 動作 |
|---|---|
| **刪除這個元素** | 只刪你右鍵點到的 |
| **刪除外層容器** | 刪整個包住它的 div / 卡片 / section（如果有） |
| **取消** | 關閉選單什麼都不做 |

不小心刪錯：去 `.backups/` 找上次的 HTML 還原。

### 九　工具列位置

右下角預設位置擋到 slide？拖工具列頂端「**編輯器 ／ ⋯**」那條可以把整個工具列移到任何地方。位置會記在 localStorage，重新整理還在那。

不小心拖到看不見？**雙擊頂端那條**還原到右下角預設。

### 存檔 + 自動備份

`⌘S` 或工具列「**存檔**」。Server 找到對應 slide 的區塊（用你的 `--slide-key`），把 inner HTML 換掉、寫回檔案。沒動過的 slide 不會被重寫。

每次存檔前自動備份到 `.backups/deck-YYYYMMDD-HHMMSS.html`，保留最近 20 份。

### 匯出 PDF

工具列「**匯出 PDF**」會先呼叫存檔，確認沒有未存成功的 slide 後，再向 server 的 `/export-pdf` 要一份 PDF。Server 會用本機 Chrome headless 開啟不含編輯器 overlay 的 deck，套用列印 CSS，讓每個 slide 變成 PDF 的一頁。

匯出需要本機有 Chrome 或 Chromium。macOS 會優先找 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。

### 返回首頁

工具列「**← 首頁**」回到啟動頁，可以換別份簡報來編。如果你還有未存檔的變動，會跳對話框三選一：

- **取消** ── 留下繼續編
- **丟棄變動返回** ── 直接走，當前變動不寫回檔
- **先存檔再返回** ── 先存所有變動再回首頁

---

## 鍵盤捷徑

| 按鍵 | 動作 |
|---|---|
| `⌘S` / `Ctrl+S` | 儲存所有變動 |
| `⌘B` / `⌘I` / `⌘U` | 粗體 / 斜體 / 底線 |
| `⌘+Enter` | 對話框內，送出 prompt 加入佇列 |
| `Alt+↑` / `Alt+↓` | 放大／縮小目前選取的文字 2px |
| 移動模式下 `↑` / `↓` / `←` / `→` | 微調目前選取元素 1px |
| 移動模式下 `Shift+↑` / `Shift+↓` / `Shift+←` / `Shift+→` | 微調目前選取元素 10px |
| `右鍵` | 開啟刪除元素選單 |
| `雙擊` | 移動模式下還原元件位置　／　工具列頂端還原工具列位置 |
| `Backspace` / `Delete` | 刪除目前選取的圖片 |
| 拖檔到 slide | 上傳並插入圖片到拖放位置 |
| `Esc` | 關閉對話框 ／ 退出標記 / 移動 / 插入元件 / 放置圖片模式 |
| `?` | 開啟使用說明 overlay |

---

## 架構

```
slide-editor/
├── main.py                    # 入口（13 行）
├── editor.py                  # 向後相容 shim
└── slide_editor/              # package
    ├── __init__.py
    ├── __main__.py            # python -m slide_editor 進入點
    ├── server.py              # Config + Handler + main()  (~520 行)
    ├── launcher.py            # zip 解壓 + recents + 模式切換  (~140)
    ├── images.py              # multipart 解析器 + 圖片上傳  (~140)
    ├── ai.py                  # Claude / Codex CLI backends  (~165)
    └── overlay/
        ├── editor.js          # 注入到 deck 的 JS bundle  (~1850 行)
        └── launcher.html      # 啟動首頁  (~250 行)
```

Python 程式碼總共約 1000 行，以前是單檔 3000+ 行。JS / HTML 拆出去獨立檔案，IDE 才有正確的 syntax highlighting。

伺服器做六件事：

1. **服務 deck 檔**　收到 GET 請求時把 `overlay/editor.js` 注入到 `</body>` 前面才回傳。原始檔不動。
2. **存 slide 級的編輯**　`POST /save-slide`：讀原檔、regex 找對應 slide、換 inner HTML、寫回。寫之前自動備份到 `.backups/`。
3. **管 prompt + 跑 AI**　`/queue-prompt`、`/delete-prompt`、`/clear-prompts`、`/list-prompts` 操作 `prompts.json`。`/ai-edit` shells out 到 `claude` 或 `codex` CLI 做即時改寫，依 `--backend` 旗標選擇。
4. **處理圖片上傳**　`POST /upload-image` 自帶 multipart 解析器（不依賴已被 deprecate 的 `cgi` module），驗證副檔名、MIME、大小、檔名 sanitize、`realpath` 防穿越，存到 `<docroot>/images/`。
5. **匯出 PDF**　`GET /export-pdf` 用本機 Chrome headless 開啟純 deck 頁面，移除編輯器 overlay 和 stage runtime，透過 Chrome DevTools Protocol 的 `Page.printToPDF` 產生橫式 PDF。
6. **Launcher 模式**　不傳 deck arg 時，server 啟動成 launcher。`POST /launch/zip` 解壓到 `~/.slide-editor/projects/`、`POST /launch/path` 驗證路徑、`POST /launch/reset` 切回 launcher 模式。`~/.slide-editor/recent.json` 記最近 20 筆，`POST /api/recent/delete` 可單筆刪除。

沒有 build step、沒有 npm、沒有外部 Python 套件。`python3 main.py` 一行就跑。

---

## 設計

編輯器 UI 對齊**好事發生數位 design system v2.0** ── 紙感背景、hairline rules、直角、Noto Sans TC weight 300，紅色只用在「這是個決定」的標記（active mode、待處理 prompt、主要 CTA）。**無 emoji、無陰影、無圓角、無 tech-blue**。

色票只有五色：

| Token | Hex | 角色 |
|---|---|---|
| `--ed-ink` | `#2D2A26` | 主要文字、anchor border |
| `--ed-bg` | `#F5F5F0` | 紙張背景 |
| `--ed-gray` | `#8C8C88` | 次要文字、caption |
| `--ed-line` | `#E0E0D8` | 細線分隔 |
| `--ed-red` | `#C84630` | 決定性標記（每頁 ≤5%） |

加上 `--ed-bg-warm` `#FAFAF5` 和 `--ed-bg-soft` `#EDEDE6` 兩個 surface 色階。

所有編輯器樣式用 `--ed-*` 命名空間，跟 deck 自己的 CSS 不會撞。

---

## 關於好事發生數位 ／ Ohya Digital

**好事發生數位**是台中的 AI 顧問與數位策略團隊。創辦人 **Gary**。

### 服務

- **AI 顧問服務**：協助企業決定哪些流程適合 AI、怎麼導入、怎麼驗收
- **AI SEO 行銷**：把搜尋流量、內容生產、AI 工具串成可持續的成長引擎
- **AI 客服系統**：客戶詢問自動分類、答案查找、人工接手點設計
- **n8n 自動化工作流**：把分散在各系統的資料、流程、通知串起來
- **WordPress / SEO / 網頁設計 / 數位行銷策略**：傳統項目，做扎實，不追潮流

### 為什麼做這個工具

> AI 轉型，始於對效率的追求。

這個工具是顧問工作流程的副產品。我們做提案、教育訓練、客戶簡報，每個禮拜都在打磨一份份 HTML deck。Claude Design 出第一版很快，但每改一段話都要重灌整份 deck 進 context，token 燒得心痛。所以我們做了 `slide-editor` ── **第一版交給 Claude Design，後續迭代在本機跑，每次 AI 改寫只送一個元素**，成本是原本的零頭。

我們相信「不追求炫技，只專注於解決問題的本質」。如果你也在用 Claude / Codex 做內容工作，這個工具是現成的、開源的、隨便你改。

> **好事發生數位出品，版權沒有，歡迎隨意取用。**

### 聯絡

- 📧 [gary@ohya.co](mailto:gary@ohya.co)
- 📞 0926-000-214
- 💬 LINE：`Skimmr`
- 🌐 [ohya.co](https://ohya.co)

---

## License

MIT。用、改、賣都隨意。署名鼓勵但非必要。
