# Stairs 架構文件（ARCHITECTURE）

> 對應規格：`SPEC.md` v1.2　｜　日期：2026-10-04

---

## 0. 本文件的地位

1. 本文件回答「**怎麼組織**」：檔案結構、每層負責什麼、層和層之間怎麼互動。
2. 優先順序：`SPEC.md` > `ARCHITECTURE.md` > `PLAN.md`。和 SPEC 矛盾時，**以 SPEC 為準**，並回報使用者。
3. 以後如果有還沒決定的事，標成 **待定** 並加在 §6，不要自己腦補；決定後在 §6 寫上結論。

---

## 1. 檔案結構

文件放在 `docs/`，程式放在專案根目錄（也就是 `docs/` 的上一層，`../`）。

```
stairs/
├── index.html          ← 主程式入口，雙擊就能用
├── test.html           ← 資料邏輯的自動檢查頁，雙擊就能跑
├── css/
│   └── style.css       ← 全部樣式、CSS 變數、深色模式、手機版面、彩帶動畫
├── js/
│   ├── state.js        ← 資料邏輯層
│   ├── storage.js      ← 儲存層
│   ├── view.js         ← 畫面層：畫出畫面、接收點擊和鍵盤
│   ├── drag.js         ← 畫面層：Pointer Events 拖曳
│   ├── app.js          ← 接線層
│   └── tests.js        ← 只給 test.html 用的測試案例
└── docs/
    ├── SPEC.md
    ├── ARCHITECTURE.md
    └── PLAN.md
```

### 1.1 載入方式

- 全部用一般 `<script src="...">`，**不用 ES module**（SPEC §2）。
- 所有程式掛在**一個全域物件 `Stairs`** 底下，不另外產生全域變數：

| 檔案 | 掛在哪裡 |
|---|---|
| `state.js` | `Stairs.state` |
| `storage.js` | `Stairs.storage` |
| `view.js` | `Stairs.view` |
| `drag.js` | `Stairs.drag` |
| `app.js` | `Stairs.app` |

- 每個檔案開頭用 `var Stairs = window.Stairs || {};` 的方式取得同一個物件，再把自己的部分掛上去。
- **載入順序固定**（後面的可以用前面的，前面的不可以用後面的）：

| 頁面 | 順序 |
|---|---|
| `index.html` | `state.js` → `storage.js` → `view.js` → `drag.js` → `app.js` |
| `test.html` | `state.js` → `tests.js` |

---

## 2. 分層架構

```
            使用者（滑鼠、觸控、鍵盤）
                     │
                     ▼
   ┌───────────────────────────────────────┐
   │ 畫面層   view.js ＋ drag.js ＋ style.css │
   └───────────────────────────────────────┘
          │ 呼叫 handlers（使用者想做什麼）   ▲ render(state, ui)
          ▼                                  │
   ┌───────────────────────────────────────┐
   │ 接線層   app.js                         │
   └───────────────────────────────────────┘
          │ 純函式（舊 state → 新 state）     │ save / load
          ▼                                  ▼
   ┌──────────────────────┐   ┌──────────────────────┐
   │ 資料邏輯層  state.js  │ ◀─│ 儲存層  storage.js    │
   └──────────────────────┘   └──────────────────────┘
                                         │
                                         ▼
                              localStorage["stairs.v1"]
```

一共四層。`test.html` 不是一層，它是檢查工具，只碰資料邏輯層。

### 2.1 資料邏輯層（`js/state.js`）

**負責：**
- SPEC §7 表格裡除了 `load` / `save` 以外的全部函式。
- 不變式（SPEC §3.2）：每個函式做完都要成立。
- 名稱規則（SPEC §3.1）：去頭尾空白、空的就不接受、專案名 100 字／步驟名 200 字截斷。
- id 產生（SPEC §3.1 的格式）。
- 內部輔助函式 `normalize(raw)`：把任何東西（可能是壞資料）變成合法的 state。規則照 SPEC §3.3 的「讀取時」那幾條。它是純函式，給儲存層用，也讓 `test.html` 能直接測修正規則。

**可以依賴：** 什麼都不依賴。

**不可以：**
- 碰 `document`、DOM、`localStorage`、`console` 以外的任何瀏覽器 API。
- 修改傳進來的 state（一律回傳新物件，SPEC §7）。
- 不合法的操作丟錯誤。一律回傳**原本那個** state 物件（同一個參考），讓接線層可以用 `next === state` 判斷「沒變」。

### 2.2 儲存層（`js/storage.js`）

**負責：**
- `load()`：讀 `localStorage["stairs.v1"]` → `JSON.parse` → `Stairs.state.normalize()` → 回傳 state。
  - 沒資料、JSON 壞掉、讀取丟錯 → 回傳 `Stairs.state.emptyState()`；壞掉時 `console.warn`。
- `save(state)`：`JSON.stringify` 後寫入。任何錯誤都接住，回傳 `false`；成功回傳 `true`。

**可以依賴：** 資料邏輯層（只用 `emptyState`、`normalize`）。

**不可以：**
- 碰 DOM，不可以自己顯示「無法儲存」提示（那是畫面層的事，由接線層告訴它）。
- 做任何資料規則判斷。修正規則全部在 `normalize`，儲存層只負責讀寫和 JSON。
- 讓例外跑出去。`load` / `save` 都不可以讓程式當掉（SPEC §3.3）。

### 2.3 畫面層（`js/view.js`、`js/drag.js`、`css/style.css`）

**負責：**
- `view.render(state, ui)`：依照 state 和 ui 狀態（見 §3.2）把整個畫面重畫一次。包含 SPEC §5 的版面、空狀態、F3 的三種步驟外觀、進度條、慶祝彈窗、無法儲存提示。
- 事件：用事件委派（listener 掛在外層容器），把使用者的動作翻成 `handlers` 的呼叫，例如 `handlers.onCheck(stepId)`。
- `view.confirm(message, onYes)`：顯示自己做的確認視窗（不用瀏覽器內建 `confirm()`，見 §6 A1）。使用者按「確定」才呼叫 `onYes`；按「取消」、Esc、點外面都只關掉視窗。確認視窗和慶祝彈窗共用同一套 dialog 做法（`role="dialog"`、焦點移動、Esc、點外面關閉、關掉後焦點回去）。
- 焦點保存與還原（見 §3.4）。
- 無障礙（SPEC §6）：`aria-label`、`disabled`、`title`、dialog 的 role 和焦點。
- `drag.js`：用 Pointer Events 做拖曳。只負責「拖的過程」：半透明、放下位置的線、`touch-action`、算出 `toIndex`。放下位置限制在未完成區：拖到已完成區時，線停在未完成區最上面，`toIndex` 也修正成未完成區第一格（見 §6 A4）。放下時呼叫 `handlers.onMove(stepId, toIndex)`。
- `style.css`：`:root` 的 CSS 變數、`prefers-color-scheme` 深色模式、`< 640px` 手機版面、40×40px 觸控區、彩帶動畫、`prefers-reduced-motion`。

**可以依賴：**
- 資料邏輯層的**唯讀查詢**函式：`getCurrentStepIndex`、`countDone`、`isProjectComplete`。
- 接線層傳進來的 `handlers` 物件。

**不可以：**
- 修改 state 物件（SPEC §2）。
- 直接呼叫會改資料的函式（`create*`、`rename*`、`delete*`、`add*`、`move*`、`check*`、`uncheck*`、`setActive*`）。要改資料只能呼叫 `handlers`。
- 碰 `localStorage` 或 `Stairs.storage`。
- 自己判斷「操作合不合法」來決定資料怎麼變。畫面可以**擋**（例如 disabled、拖曳只能落在未完成區），但最後的規則由資料邏輯層把關。

### 2.4 接線層（`js/app.js`）

**負責：**
- 持有**唯一一份**目前的 state，和 ui 狀態（§3.2）。
- 啟動流程（§4.1）。
- `dispatch`：所有改資料的動作都經過這裡（§3.1）。
- 慶祝判斷（SPEC §7 最後一段）：`checkStep` 前後各問一次 `isProjectComplete`。
- 什麼時候要確認（F6、F7 刪專案），以及確認視窗的文字和 N 的計算。
- 決定操作後焦點要去哪（例如新增步驟後回到輸入框）。

**可以依賴：** 資料邏輯層、儲存層、畫面層。

**不可以：**
- 自己改 state 的內容。只能把「純函式回傳的新 state」換上去。
- 自己產生 DOM 或改樣式。畫面一律交給 `view.render`。
- 把 ui 狀態存進 localStorage（慶祝狀態**不存檔**，SPEC §7）。

---

## 3. 互動與資料流

全部是**同步**的，沒有網路、沒有非同步。

### 3.1 單向流程

```
使用者動作 → view 呼叫 handlers.onXxx(...)
          → app.dispatch：next = Stairs.state.xxx(state, ...)
          → next === state ? （沒變，只重畫） : （換上 next → save(next)）
          → view.render(state, ui)
```

- **每次動作後都重畫**，就算資料沒變。原因：瀏覽器原生的勾選框按下去會先自己變勾，資料沒變時要靠重畫把它變回來。
- `save` 回傳 `false` → `ui.storageWarning = true`。

### 3.2 跨層的資料形狀

| 邊界 | 傳什麼 |
|---|---|
| 資料邏輯層 ↔ 接線層 | SPEC §3.1 的 state 物件。 |
| 儲存層 ↔ localStorage | state 物件 `JSON.stringify` 後的字串。 |
| 接線層 → 畫面層 | `render(state, ui)`。`ui` 是只在記憶體裡的物件（見下表）。 |
| 畫面層 → 接線層 | `handlers` 物件上的函式呼叫（見下表）。 |

**`ui` 物件**（不存檔）：

| 欄位 | 型別 | 意思 |
|---|---|---|
| `editing` | `{ kind: "project" \| "step", id }` 或 `null` | 哪個名稱正在改名。 |
| `celebrate` | `{ projectName }` 或 `null` | 慶祝彈窗是否打開。 |
| `storageWarning` | boolean | 是否顯示「無法儲存，重新整理後資料會消失」。 |
| `focusKey` | string 或 `null` | 重畫後要把焦點放在哪（見 §3.4）。 |

**`handlers` 物件**（由 app 提供給 view 和 drag）：

| 函式 | 對應功能 |
|---|---|
| `onCreateProject(name)` / `onSelectProject(projectId)` | F1 |
| `onAddStep(title)` / `onMove(stepId, toIndex)` / `onMoveBy(stepId, delta)` | F2 |
| `onCheck(stepId)` / `onUncheck(stepId)` | F4、F6 |
| `onStartRename(kind, id)` / `onRename(kind, id, name)` / `onCancelRename()` | F7 改名 |
| `onDeleteProject(projectId)` / `onDeleteStep(stepId)` | F7 刪除 |
| `onCloseCelebrate()` | F5 |

`onMoveBy(stepId, delta)` 是 ↑↓ 按鈕用的（`delta` 是 `-1` 或 `+1`），接線層把它換算成 `moveStep` 的 `toIndex`。

### 3.3 一條完整路徑：打勾最後一階

以「寫論文」有 3 步、前 2 步已完成為例：

1. 使用者點第 3 階的勾選框。
2. `view.js` 的委派 listener 讀到 `data-action="check"`、`data-step-id="s_..."` → 呼叫 `handlers.onCheck("s_...")`。
3. `app.js`：
   1. `before = isProjectComplete(project)` → `false`
   2. `next = Stairs.state.checkStep(state, pid, "s_...")`
   3. `next !== state` → 換上 `next`，`Stairs.storage.save(next)`（`false` 就打開 `storageWarning`）
   4. `after = isProjectComplete(新的 project)` → `true`
   5. `before` 是 `false`、`after` 是 `true` → `ui.celebrate = { projectName: "寫論文" }`，記下目前焦點的 key，等彈窗關掉後還原
4. `view.render(state, ui)`：步驟清單變成 3 個 ✓、進度 3 / 3、出現慶祝彈窗，焦點移到「關閉」按鈕（SPEC §6）。
5. 重新整理頁面：`ui` 不存檔，所以不會再跳（SPEC F5）。

如果點的是鎖住的步驟（理論上 disabled 點不到）：第 3.2 步 `checkStep` 回傳原本的 state → 不存檔 → 重畫，畫面不變。

### 3.4 焦點保存與還原

整個重畫會把 DOM 換掉，焦點會不見。做法：

- 每個能拿到焦點的元素都有 `data-focus-key`，例如 `step-check:s_xxx`、`step-up:s_xxx`、`add-step-input`。
- `render` 前：如果 `ui.focusKey` 是 `null`，就記下目前 `document.activeElement` 的 key。
- `render` 後：找到同 key 的元素並 `focus()`；找不到就不動。
- 接線層需要指定焦點時（例如新增步驟後要回到 `add-step-input`，↑↓ 後要跟著那個步驟的同一顆按鈕），就設定 `ui.focusKey`，用完清成 `null`。

---

## 4. 啟動流程

### 4.1 `index.html`

1. `app.js` 在 `DOMContentLoaded` 時啟動。
2. `state = Stairs.storage.load()`。
3. 馬上 `Stairs.storage.save(state)` 試寫一次：
   - 用來偵測 localStorage 能不能用（SPEC §3.3 最後一條）；失敗 → `ui.storageWarning = true`。
   - 也順便把 `normalize` 修正過的資料寫回去。
4. `view.render(state, ui)`，並把 `handlers` 交給 `view` 和 `drag`。

### 4.2 `test.html`

1. 只載入 `state.js` 和 `tests.js`，**不載入**儲存層和畫面層，也不碰 localStorage。
2. `tests.js` 內建一個很小的 `assert`，跑完把每一項的通過／失敗列在頁面上，最上面一行顯示「通過 X / Y」。
3. 每個會改資料的測試，做完都要再跑一次「不變式檢查」。
4. 測試不可以比對 id 的實際值（id 裡有時間和亂數），只比對前綴和格式。

---

## 5. 技術與框架

| 項目 | 決定 | 來源 |
|---|---|---|
| 語言 | 純 HTML / CSS / JavaScript | SPEC §2 |
| 框架、npm、建置工具、CDN | 不用 | SPEC §2 |
| 模組 | 不用 ES module；全域 `Stairs` 物件 | SPEC §2、本文件 §1.1 |
| 儲存 | `localStorage`，key `stairs.v1` | SPEC §3.3 |
| 拖曳 | Pointer Events | SPEC F2 |
| 測試 | 自己寫的 `test.html` ＋ `tests.js`，不用測試框架 | 本文件 §4.2 |
| 支援瀏覽器 | 最新版 Chrome、Edge、Firefox、Safari，桌機和手機 | SPEC §2 |
| JS 語法版本 | 現代語法：`const`/`let`、箭頭函式、`...` 展開、模板字串、`?.`。不用 ES module | 本文件 §6 A3 |

---

## 6. 決定紀錄

| # | 問題 | 背景 | 決定 |
|---|---|---|---|
| A1 | 確認視窗（F6、F7 刪專案）用瀏覽器內建 `confirm()`，還是自己做一個 dialog？ | SPEC 只寫「跳確認」。內建的最簡單、鍵盤可用，但無法套深色模式和樣式。 | **自己做**，和慶祝彈窗共用 dialog 做法。原因：Chrome 跳幾次 `confirm()` 後會出現「不要再讓這個網頁跳視窗」，勾了之後 `confirm()` 永遠回傳 `false`，F6 就再也無法取消前面的步驟。 |
| A2 | `normalize` 怎樣算「格式不對」？例如某個步驟名是空字串、某欄位型別錯。整份丟掉重來，還是只丟掉壞的那一筆？ | SPEC §3.3 原本只寫「JSON 壞掉或格式不對 → 用空資料啟動」，沒寫到單筆壞掉的情況。 | **分兩種**：最外層壞掉 → 空資料；單一專案或步驟壞掉 → 只丟掉那一筆。已寫進 SPEC v1.2 §3.3。原因：一筆壞掉不該讓全部資料消失。 |
| A3 | JS 可以用到哪個版本的語法（例如 `const`、箭頭函式、展開運算子）？ | SPEC 只要求「最新版」瀏覽器，這些都支援。 | **現代語法**（見 §5）。原因：純函式要一直複製物件，用 `...` 比較短、比較不會寫錯。ES module 仍然不用（SPEC §2）。 |
| A4 | 拖曳時如果拖到已完成區，放下的線要停在未完成區最上面，還是不顯示？ | SPEC F2 只說「不能拖進已完成區」，沒說視覺上怎麼表現。 | **線停在未完成區最上面**，放手後步驟移到那裡。原因：使用者一直看得到放手後會去哪。`moveStep` 收到已完成區的位置會不動（SPEC §7），所以 `drag.js` 呼叫前要先修正 `toIndex`。 |
