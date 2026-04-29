# slide-editor

瀏覽器內的 HTML 簡報編輯器。**點任何文字直接改、拖元件、調字級、選一段話讓 AI 改寫**。改完直接寫回原檔，自動備份。

單一 Python 檔，零外部相依，無建置步驟。為了「**Claude Design 出第一版、本機編輯器接手後續迭代**」這個工作流而做。

```
python3 editor.py path/to/deck.html
```

## 介紹影片

40 秒介紹影片，三段功能實機演示：游標移動、hover 提示、文字打字、圖片拖放、四角縮放、AI 改寫 modal、改前改後對照、套用。

[![slide-editor 介紹影片](assets/thumbnail.png)](https://www.youtube.com/watch?v=XzqKnguk63k)

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

第一版交給 Claude Design 處理（它擅長從零生整份 deck）。後續所有調整 ── 改文案、搬卡片、改字級、要 AI 重寫某一段 ── 全部在本機 `slide-editor` 裡完成。手動編輯完全免費，AI 改寫每次只送一個元素 + 一個指令進 LLM，token 用量是 Claude Design 重生整份的零頭。

---

## 它能做什麼

| | |
|---|---|
| **直接編輯** | 滑到任何文字會出現淡灰細線 → 點下去 → 直接打字。 |
| **移動元件** | 開「移動模式」→ 拖任何元件 → 位置存成 `transform: translate(x,y)` 寫進 inline style。雙擊可還原。 |
| **改字級** | 點任何文字 → 上方浮出小工具列：`−` 縮小 / 目前大小 / `+` 放大 / `RESET` 還原。或鍵盤 `Alt+↑` / `Alt+↓`。 |
| **AI 改寫（即時）** | 標記某段文字 → 輸入指令（「改更口語」「縮成兩句」）→ 10–18 秒後跳出「改前 ／ 改後」對照 → 接受或丟棄。 |
| **AI 改寫（佇列）** | 同樣標記但選「加入佇列」→ 累積一批 prompt → 回 Claude Code 對話框說「跑 queue」一次處理。 |
| **插入圖片** | 拖檔進瀏覽器 → 落在拖放點。或工具列「新增圖片」→ 選檔 → 自動放在當前看的那張 slide 中央。 |
| **縮放圖片** | 點圖片 → 四個角出現方塊 handle → 拖角縮放（鎖定長寬比）。`Backspace` 刪除選中的圖片。 |
| **存檔** | `⌘S` 寫回原始 HTML。每次存檔前自動備份到 `.backups/`，保留 20 份。 |

編輯器 JS 是 server 注入的，原始 HTML 檔在你按存檔之前**完全不會被動到**。

---

## 安裝

需要 Python 3.7 以上。沒了。

```bash
git clone https://github.com/garyyang1001/slide-editor.git
cd slide-editor
python3 editor.py examples/demo.html
```

開瀏覽器到終端機印的網址（預設 `http://127.0.0.1:8765/demo.html`）。

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
python3 editor.py DECK [options]

DECK                  HTML 簡報檔的路徑（必填）

--port PORT           HTTP port（預設：8765）
--host HOST           綁定地址（預設：127.0.0.1）
--backend BACKEND     AI backend：claude / codex / auto（預設：auto）
--no-ai               停用即時 AI 改寫（佇列功能還在）

--slide-tag TAG       slide 用的 HTML tag（預設：section）
--slide-class CLASS   slide 的 CSS class（預設：slide）
--slide-key ATTR      slide 的唯一鍵屬性（預設：data-label）
```

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

### 二　移動元件

點工具列「**移動模式**」（會變紅、游標變抓手）。拖任何元件。

位置存成元素的 inline style：`transform: translate(20px, -8px)`。原本的 flow layout 不會崩，等於是「把元件從原位輕微推開」而不是絕對定位重來。

如果 deck 用 `<deck-stage width="…">` 縮放，編輯器會自己處理 scale 換算 ── 你拖 20px 就是 slide 座標 20px，不會因為視窗大小而跑掉。

雙擊任何元件：清掉它的 transform，回到原位。

### 三　改字級

點任何文字（focus 進去）。上方會浮出小工具列，四顆按鈕：

```
[ − ]  [ 18px ]  [ + ]  [ RESET ]
```

或鍵盤 `Alt+↑` / `Alt+↓` 一次 2px。大小寫進元素的 inline `font-size`，跟 ⌘S 一起存。

### 四　AI 改寫

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

### 五　插入與縮放圖片

兩種上傳路徑，看你要不要當下指定位置：

- **拖檔**　把圖片從 Finder 拖進瀏覽器，落在哪張 slide 圖就放哪裡（拖過 slide 時會出現紅色虛線提示）。**用這個指定確切位置**。
- **按鈕**　工具列「**新增圖片**」→ 選檔 → 圖片自動放到**當前看的那張 slide 中央**，並自動選中（馬上看到縮放 handle）。**不用切換頁面、不用第二次點擊**。

按鈕流程的「當前 slide」偵測有四層保險：

1. `[data-deck-active]` 屬性（`<deck-stage>` 跟類似系統會標）
2. 當前唯一可見的 slide（檢查 `display` / `opacity` / `visibility` / 渲染矩形）
3. 視窗中央最接近的 slide（給捲動式 deck 用）
4. 第一張（最後保險）

圖片儲存到 deck 旁的 `images/` 資料夾，HTML 用相對路徑引用（`<img src="images/..." />`）。檔名加毫秒時間戳避免衝突。**支援格式**：jpg / png / webp / gif / svg，**單檔上限** 10 MB。

插入後：

- **移動**　開移動模式拖曳，跟其他元件一樣（`transform: translate` 加在 inline style）。
- **縮放**　點圖片 → 四個角出現方塊 handle → 拖角縮放，鎖定長寬比。
- **刪除**　選中圖片按 `Backspace` 或 `Delete`。

### 存檔

`⌘S` 或工具列「**存檔**」。Server 找到對應 slide 的區塊（用你的 `--slide-key`），把 inner HTML 換掉、寫回檔案。沒動過的 slide 不會被重寫。

每次存檔前自動備份到 `.backups/deck-YYYYMMDD-HHMMSS.html`，保留最近 20 份。

---

## 鍵盤捷徑

| 按鍵 | 動作 |
|---|---|
| `⌘S` / `Ctrl+S` | 儲存所有變動 |
| `⌘+Enter` | 對話框內，送出 prompt 加入佇列 |
| `Alt+↑` / `Alt+↓` | 放大／縮小目前選取的文字 2px |
| `雙擊` | 移動模式下，將該元件還原到原位 |
| `Backspace` / `Delete` | 刪除目前選取的圖片 |
| 拖檔到 slide | 上傳並插入圖片到拖放位置 |
| `Esc` | 關閉對話框 ／ 退出標記模式 ／ 退出移動模式 |
| `?` | 開啟使用說明 overlay |

---

## 架構

`editor.py` 是一支約 1900 行的 Python 腳本，包了標準庫的 `http.server`。做四件事：

1. **服務 deck 檔**　收到 GET 請求時把編輯器 JS bundle（toolbar、modal、所有事件處理）注入到 `</body>` 前面才回傳。原始檔不動。
2. **存 slide 級的編輯**　`POST /save-slide`：讀原檔、regex 找對應 slide、換 inner HTML、寫回。寫之前自動備份到 `.backups/`。
3. **管 prompt + 跑 AI**　`/queue-prompt`、`/delete-prompt`、`/clear-prompts`、`/list-prompts` 操作 `prompts.json`。`/ai-edit` shells out 到 `claude` 或 `codex` CLI 做即時改寫，依 `--backend` 旗標選擇。
4. **處理圖片上傳**　`POST /upload-image` 自帶 multipart 解析器（不依賴已被 deprecate 的 `cgi` module），驗證副檔名、MIME、大小、檔名 sanitize、`realpath` 防穿越，存到 `<docroot>/images/`。

注入的 JS 是 Python 檔裡的字串模板。沒有 build step、沒有 npm、沒有外部 Python 套件。`python3 editor.py deck.html` 一行就跑。

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

### 聯絡

- 📧 [gary@ohya.co](mailto:gary@ohya.co)
- 📞 0926-000-214
- 💬 LINE：`Skimmr`
- 🌐 [ohya.co](https://ohya.co)

---

## License

MIT。用、改、賣都隨意。署名鼓勵但非必要。
