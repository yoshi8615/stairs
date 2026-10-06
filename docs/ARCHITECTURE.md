# Stairs 架構文件（ARCHITECTURE）

> 對應規格：`SPEC.md` v1.9　｜　日期：2026-10-04（v1.6 的更新：2026-10-06）

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
├── img/
│   └── icon-180.png    ← App 圖示：瀏覽器分頁和 iPhone 主畫面共用
├── css/
│   └── style.css       ← 全部樣式、CSS 變數、深色模式、手機版面、彩帶動畫
├── js/
│   ├── state.js        ← 資料邏輯層
│   ├── storage.js      ← 儲存層
│   ├── picker.js       ← 畫面層：日期時間選單的內容（月曆＋小時滾輪）
│   ├── view.js         ← 畫面層：畫出畫面、接收點擊和鍵盤
│   ├── drag.js         ← 畫面層：Pointer Events 拖曳（按住整列、手機長按）
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
| `picker.js` | `Stairs.picker` |
| `view.js` | `Stairs.view` |
| `drag.js` | `Stairs.drag` |
| `app.js` | `Stairs.app` |

- 每個檔案開頭用 `var Stairs = window.Stairs || {};` 的方式取得同一個物件，再把自己的部分掛上去。
- **載入順序固定**（後面的可以用前面的，前面的不可以用後面的）：

| 頁面 | 順序 |
|---|---|
| `index.html` | `state.js` → `storage.js` → `picker.js` → `view.js` → `drag.js` → `app.js` |
| `test.html` | `state.js` → `tests.js` |

---

## 2. 分層架構

```
            使用者（滑鼠、觸控、鍵盤）
                     │
                     ▼
   ┌───────────────────────────────────────┐
   │ 畫面層 picker.js ＋ view.js ＋ drag.js ＋ style.css │
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
- 內部輔助函式 `normalize(raw)`：把任何東西（可能是壞資料）變成合法的 state。規則照 SPEC §3.3 的「讀取時」那幾條。它不修改傳進來的東西，給儲存層用，也讓 `test.html` 能直接測修正規則。（v1.6 起，補 `completedAt` 時會用到 `Date.now()`，和 `createProject` 的 `createdAt` 一樣。）
- 不變式第二條（SPEC §3.2）：用一個內部輔助函式 `syncCompletedAt(oldProject, newProject)`，放在所有單一專案修改共用的 `updateProject` 裡，所以會改步驟的函式（`addStep`、`deleteStep`、`checkStep`、`uncheckStep`）都會經過它，規則集中在一個地方。
- 截止日期格式檢查：內部輔助函式 `isValidDeadline(s)`，`createProject`、`setDeadline`、`normalize` 共用。「真的日期」的檢查方式：拆出年月日時分，用 `new Date(Date.UTC(年, 月-1, 日))` 建出來後，年月日要和原本一樣（2 月 30 日會變成 3 月 2 日，就不一樣），時 ≤ 23、分 ≤ 59。用 UTC 是為了避開有日光節約時間的地區「某一小時不存在」的問題。
- `listProjects(state, tab)`：分頁的篩選和排序（SPEC F9、F10）。放在這一層，因為它是純邏輯，`test.html` 可以直接測。截止日期是固定格式的字串，可以直接用字串比大小。**日期分組不在這裡做**，分隔線是畫面的事，由 view 比對相鄰兩個專案的 `deadline.slice(0, 10)` 決定。
- `toIcs(project)`（v1.7，SPEC F11）：產生行事曆檔的文字。放在這一層，因為它是純文字轉換，`test.html` 可以直接測；它不碰 DOM，下載由畫面層做（§6 A16）。
- `markCalendarAdded(state, projectId)` / `clearCalendarAdded(state, projectId)`（v1.9，SPEC F11）：把 `calendarDeadline` 設成目前的 `deadline` / `null`。存的是**截止日期字串**而不是「加過沒」的布林值，這樣改了截止日期後，比對兩者就知道行事曆是舊的（§6 A21）。`normalize` 對壞掉的 `calendarDeadline` 設成 `null`，和 `deadline` 用同一個 `isValidDeadline`。

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
- `view.confirm(message, onYes, labels)`（v1.9 加 `labels`：`{ yes, no }`，預設「確定／取消、焦點在取消」；`no: null` 表示只有一顆 `yes` 按鈕，焦點在它上面。F11「已加入」用 `{ yes: "知道了", no: null }`，「重新加入」用 `{ yes: "下載新的", no: "取消" }`）：顯示自己做的確認視窗（不用瀏覽器內建 `confirm()`，見 §6 A1）。使用者按「確定」才呼叫 `onYes`；按「取消」、Esc、點外面都只關掉視窗。確認視窗和慶祝彈窗共用同一套 dialog 做法（`role="dialog"`、焦點移動、Esc、點外面關閉、關掉後焦點回去）。
- 焦點保存與還原（見 §3.4）。
- 無障礙（SPEC §6）：`aria-label`、`disabled`、`title`、dialog 的 role 和焦點。
- `view.pickDeadline({ mode, value }, onResult)`（v1.6）：用共用 dialog 打開日期時間選單，內容由 `picker.js` 產生。
  - `mode` 是 `"create"`（按鈕：取消／跳過／完成）或 `"edit"`（按鈕：取消／完成，`value` 不是 `null` 時多「清除」）。
  - 結果：完成 → `onResult(字串)`；跳過、清除 → `onResult(null)`；取消、Esc、點外面 → **不呼叫**。
  - 和 `view.confirm` 一樣，打開前先把還沒做的重畫做完（P6T1）。
- `view.download(filename, text, type)`（v1.7）：用 `Blob` 和暫時的 `<a download>` 讓瀏覽器下載一個檔案（SPEC F11），之後釋放 Blob 網址。不判斷內容。
- `view.clearDraft(name)`（v1.6）：清掉某個輸入框的草稿。新增專案框送出時 view **不再自己清空**，因為按取消要保留名稱（SPEC F8）；由 app 在真的建立後呼叫。新增步驟框照舊，送出就清空。
- 側欄（v1.6）：用 `Stairs.state.listProjects(state, ui.tab)` 拿到排好的清單，畫出專案、日期分隔線（SPEC F9）或完成日期小字（SPEC F10）。分隔線不能拿到焦點；用 `role="separator"` 加 `aria-label`（例如「2026/10/05」），讓螢幕閱讀器讀得到日期。
- 專案列表抽屜（v1.8，SPEC F12，§6 A17）：側欄改成抽屜 `aside.drawer`，**一直在 DOM 裡**，`ui.drawer` 決定開或關。
  - 關著：移到畫面外（`transform`）、`visibility: hidden`、`inert`。開著：滑進來，後面多一層半透明遮罩，`.main` 和 ≡ 按鈕設 `inert`。
  - 抽屜有固定的 `view-transition-name`，所以開和關都由 P6 的轉場滑動，不用另外寫 JS 動畫。
  - ≡ 按鈕：`position: fixed` 在左下角（加 `env(safe-area-inset-*)`），`aria-expanded`、`aria-controls`；`.main` 下方留出它的空間。
  - Esc：抽屜開著、焦點不在改名輸入框時 → `handlers.onCloseDrawer()`。點遮罩、✕ 也一樣。
- 切換欄位（v1.6；v1.8 起放在抽屜最下面，`position: sticky` 貼底，見 §6 A19）。滑動的色塊是一個獨立的 `<span>`，用 class 決定它在左格或右格。整頁重畫會換掉元素，CSS transition 不會播，所以給它一個固定的 `view-transition-name`，讓 P6 的轉場把它從舊位置滑到新位置；不支援或減少動態效果時直接跳過去。
- Alt+↑ / Alt+↓（v1.6）：掛在 `#app` 的 `keydown` 委派。目標在某個未完成步驟列裡、且不是改名輸入框 → `preventDefault`，呼叫 `handlers.onMoveBy(stepId, ±1)`。
- `picker.js`（v1.6）：只做日期時間選單的**內容**，不管 dialog。
  - `Stairs.picker.create(value)` → 回傳 `{ el, getValue() }`。`el` 是月曆＋小時滾輪的 DOM；`getValue()` 回傳 `YYYY-MM-DDTHH:00` 字串。
  - 月曆的換月、方向鍵移動、選日期，全部在 `el` 自己內部處理，不碰 `#app`、不呼叫 `handlers`。
  - 小時滾輪：一個可捲動的容器，加 CSS `scroll-snap`；用捲動位置算出目前是第幾格；`↑`／`↓` 鍵改捲動位置。每次 `scroll` 事件都用「捲動位置 ÷ 一格高度」四捨五入算出中間那格，不用等捲動停下來（不需要 `scrollend`，iPhone 上也一樣），按「完成」時再算一次。
  - 「現在的下一個整點」的預設值在這裡算（它需要讀現在時間，不屬於資料邏輯層）。
- `drag.js`：用 Pointer Events 做拖曳。只負責「拖的過程」：半透明、放下位置的線、`touch-action`、算出 `toIndex`。放下位置限制在未完成區：拖到已完成區時，線停在未完成區最上面，`toIndex` 也修正成未完成區第一格（見 §6 A4）。放下時呼叫 `handlers.onMove(stepId, toIndex)`。
  - v1.6 起沒有把手，`pointerdown` 從**未完成步驟列**開始（勾選框、按鈕、輸入框上按下去不算）。怎麼分辨「拖」和「點／捲動」見 §6 A11。
  - v1.8：抽屜的滑動手勢也在這裡（都是觸控手勢，放一起才能互相讓）。用被動的 `touchstart`／`touchmove`／`touchend`，不用 Pointer Events，因為瀏覽器開始捲動時會送 `pointercancel` 把手勢切斷。從左邊緣 24px 內開始、往右超過 60px 且橫向為主 → `handlers.onOpenDrawer()`；抽屜開著時在抽屜上往左超過 60px → `handlers.onCloseDrawer()`。步驟正在拖曳時不判斷（§6 A18）。
- `style.css`：`:root` 的 CSS 變數、`prefers-color-scheme` 深色模式、`< 640px` 手機版面、40×40px 觸控區、彩帶動畫、`prefers-reduced-motion`。
  - v1.6：階梯上限 `--stair-max` 從 `8` 改成 `2`（第 3 階起都縮 2 格）；手機的 `--stair` 從 `6px` 改成 `9px`。
  - v1.9：view 給每個步驟的 `--i` 改成「從目前這一階算起的位置」：已完成的步驟是 `0`，未完成的是 `i - 已完成數`；CSS 的上限 `--stair-max: 2` 不變（SPEC §5.3）。
  - v1.9：改名輸入框第一次出現時，view 用 `setSelectionRange(長度, 長度)` 把游標放在最後，不再 `select()`（SPEC F7）。
  - v1.6：`body` 下方留出切換欄位的高度加上 `env(safe-area-inset-bottom)`；`index.html` 的 viewport 要加 `viewport-fit=cover`，`env()` 在 iPhone 上才有值。（v1.8 起留的是左下角 ≡ 按鈕的空間。）
  - v1.8：拿掉兩欄 grid 和 `< 640px` 上下排列；`.main` 水平置中，電腦和手機同一種版面，手機只有邊距較小。

**可以依賴：**
- 資料邏輯層的**唯讀查詢**函式：`getCurrentStepIndex`、`countDone`、`isProjectComplete`、`listProjects`。
- `view.js` 可以用 `picker.js`；`picker.js` 什麼都不依賴。
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
- 什麼時候打開日期時間選單（v1.6，SPEC F1、F8）：
  - `onCreateProject(name)`：名稱去空白後是空的 → 什麼都不做。否則 `view.pickDeadline({ mode: "create", value: null }, (d) => …)`，在回呼裡 `dispatch(createProject, name, d)`、`view.clearDraft("add-project")`、`ui.tab = "open"`。
  - `onEditDeadline()`：`view.pickDeadline({ mode: "edit", value: 目前的 deadline }, (d) => dispatch(setDeadline, pid, d))`。
- `onAddToCalendar()`（v1.7，SPEC F11；v1.9 分三種狀態）：`calendarDeadline` 是 `null` → 直接下載；等於 `deadline` → `view.confirm` 說明「要自己到行事曆取消」，按「知道了」→ `dispatch(clearCalendarAdded)`；不同 → `view.confirm` 說明「舊的要自己刪」，按「下載新的」才下載。下載 = `text = Stairs.state.toIcs(目前的專案)`（`null` 就什麼都不做），然後 `dispatch(markCalendarAdded)`；檔名把專案名稱裡不能當檔名的字元換成 `_`，再呼叫 `view.download`。
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
| `celebrate` | `{ projectName }` 或 `null` | 慶祝彈窗是否打開。（v1.8 加的 `hasDeadline` 在 v1.9 拿掉，慶祝畫面不再提行事曆，見 §6 A20。） |
| `drawer` | boolean | 專案列表抽屜開著嗎（SPEC F12，v1.8）。啟動時是 `false`，不存檔。 |
| `storageWarning` | boolean | 是否顯示「無法儲存，重新整理後資料會消失」。 |
| `focusKey` | string 或 `null` | 重畫後要把焦點放在哪（見 §3.4）。 |
| `tab` | `"open"` 或 `"done"` | 專案列表顯示哪個分頁（SPEC F10）。啟動時是 `"open"`。 |

**`handlers` 物件**（由 app 提供給 view 和 drag）：

| 函式 | 對應功能 |
|---|---|
| `onCreateProject(name)` / `onSelectProject(projectId)` | F1 |
| `onAddStep(title)` / `onMove(stepId, toIndex)` / `onMoveBy(stepId, delta)` | F2 |
| `onCheck(stepId)` / `onUncheck(stepId)` | F4、F6 |
| `onStartRename(kind, id)` / `onRename(kind, id, name)` / `onCancelRename()` | F7 改名 |
| `onDeleteProject(projectId)` / `onDeleteStep(stepId)` | F7 刪除 |
| `onCloseCelebrate()` | F5 |
| `onEditDeadline()` | F8（v1.6） |
| `onSetTab(tab)` | F10（v1.6） |
| `onAddToCalendar()` | F11（v1.7） |
| `onOpenDrawer()` / `onCloseDrawer()` | F12（v1.8） |

抽屜和焦點（v1.8，SPEC §6）：`onOpenDrawer` 把 `ui.focusKey` 設成目前專案在列表裡的 key（看不到就 `add-project-input`）；`onCloseDrawer` 設成 `drawer-btn`；`onSelectProject` 也關抽屜、焦點到 `drawer-btn`；建立專案（完成或跳過）關抽屜、焦點到 `add-step-input`。

`onMoveBy(stepId, delta)` 是鍵盤 Alt+↑ / Alt+↓ 用的（v1.5 以前是 ↑↓ 按鈕；`delta` 是 `-1` 或 `+1`），接線層把它換算成 `moveStep` 的 `toIndex`。移動後 `ui.focusKey` 設成移動前焦點所在的那個 key，焦點留在同一個控制項上。

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

- 每個能拿到焦點的元素都有 `data-focus-key`，例如 `step-check:s_xxx`、`add-step-input`；v1.6 加 `deadline-btn`、`tab:open`、`tab:done`。（`step-up:` / `step-down:` 在 v1.6 拿掉。）
- `render` 前：如果 `ui.focusKey` 是 `null`，就記下目前 `document.activeElement` 的 key。
- `render` 後：找到同 key 的元素並 `focus()`；找不到就不動。
- 接線層需要指定焦點時（例如新增步驟後要回到 `add-step-input`，Alt+↑↓ 後要跟著那個步驟的同一個控制項），就設定 `ui.focusKey`，用完清成 `null`。

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
| 日期時間選單 | 自己做：月曆用 `<button>` 格子，小時滾輪用 CSS `scroll-snap` | SPEC F8、本文件 §6 A9 |
| 動畫 | View Transitions（`document.startViewTransition`），側欄專案和切換欄位色塊也用它 | SPEC §5.3、PLAN P6 |

---

## 6. 決定紀錄

| # | 問題 | 背景 | 決定 |
|---|---|---|---|
| A1 | 確認視窗（F6、F7 刪專案）用瀏覽器內建 `confirm()`，還是自己做一個 dialog？ | SPEC 只寫「跳確認」。內建的最簡單、鍵盤可用，但無法套深色模式和樣式。 | **自己做**，和慶祝彈窗共用 dialog 做法。原因：Chrome 跳幾次 `confirm()` 後會出現「不要再讓這個網頁跳視窗」，勾了之後 `confirm()` 永遠回傳 `false`，F6 就再也無法取消前面的步驟。 |
| A2 | `normalize` 怎樣算「格式不對」？例如某個步驟名是空字串、某欄位型別錯。整份丟掉重來，還是只丟掉壞的那一筆？ | SPEC §3.3 原本只寫「JSON 壞掉或格式不對 → 用空資料啟動」，沒寫到單筆壞掉的情況。 | **分兩種**：最外層壞掉 → 空資料；單一專案或步驟壞掉 → 只丟掉那一筆。已寫進 SPEC v1.2 §3.3。原因：一筆壞掉不該讓全部資料消失。 |
| A3 | JS 可以用到哪個版本的語法（例如 `const`、箭頭函式、展開運算子）？ | SPEC 只要求「最新版」瀏覽器，這些都支援。 | **現代語法**（見 §5）。原因：純函式要一直複製物件，用 `...` 比較短、比較不會寫錯。ES module 仍然不用（SPEC §2）。 |
| A4 | 拖曳時如果拖到已完成區，放下的線要停在未完成區最上面，還是不顯示？ | SPEC F2 只說「不能拖進已完成區」，沒說視覺上怎麼表現。 | **線停在未完成區最上面**，放手後步驟移到那裡。原因：使用者一直看得到放手後會去哪。`moveStep` 收到已完成區的位置會不動（SPEC §7），所以 `drag.js` 呼叫前要先修正 `toIndex`。 |
| A5 | 操作完焦點要去哪？ | SPEC §6 只規定慶祝彈窗的焦點；整頁重畫後其他元素會被換掉。 | 確認視窗打開時焦點在「取消」（比較安全）。改名按 Enter／Esc 後回到那一項的 ✏️；按 Tab 或點別處離開時，焦點留在使用者去的地方。刪除步驟後移到隔壁步驟的 🗑️。↑↓ 移到頭或尾、按鈕變 disabled 時，焦點改到另一顆箭頭。 |
| A6 | 改名中用滑鼠點別的按鈕，「離開輸入框就儲存」要什麼時候存？ | 按下滑鼠時輸入框就失焦。如果馬上存檔重畫，按鈕會被換掉，那一下點擊就不見了。 | `view.js` 先記下改名內容，**等滑鼠或手指放開後才存**；任何其他動作送出前也會先把它存掉。鍵盤 Tab 離開則立刻存。 |
| A7 | SPEC 沒寫到的畫面細節 | 實作時才發現的小地方。 | 新增框打到一半的字，在其他操作重畫後不會不見。手機寬度時，↑↓ ✏️ 🗑️ 換到第二行，讓名稱有空間（v1.6 拿掉 ↑↓ 後，✏️ 🗑️ 回到和名稱同一行，375px 寬名稱仍有足夠空間）。彈窗打開時 `#app` 設成 `inert`，後面的頁面不能點。鎖住的步驟整列都有「需先完成上一階」提示，因為有些瀏覽器不會在 disabled 的勾選框上顯示提示。名稱長度用 Unicode 字元（code point）計算，emoji 不會被切一半。 |
| A8 | 讀到兩個專案（或步驟）的 `id` 一樣時怎麼辦？ | SPEC §3.3 沒寫。正常使用不會發生（時間＋亂數），只有手動改資料或資料壞掉時才會。 | **v1 不處理。** 重複時操作只會找到第一筆，刪除會一起刪掉。要處理的話，先在 SPEC §3.3 加規則（例如保留第一筆、丟掉後面重複的），再改 `normalize`。 |
| A9 | 日期時間選單用瀏覽器內建的 `<input type="datetime-local">`，還是自己做？（SPEC v1.6 F8） | 內建的程式最少，iPhone 上長得很像，但電腦上長得不一樣，而且 24／12 小時制跟著系統設定走。 | **自己做**（`picker.js`）。原因：SPEC 要求每個地方都是 24 小時制、一小時一格，內建的做不到。 |
| A10 | `deadline` 存成毫秒數字，還是字串？ | 分組是「當地的哪一天」；存毫秒會受時區影響，換時區後同一個專案可能跑到另一天。 | **字串** `YYYY-MM-DDTHH:MM`，當地時間（SPEC v1.6 §3.1）。原因：寫什麼就顯示什麼，字串可以直接比大小排序，取前 10 個字就是日期。 |
| A11 | 沒有把手後，怎麼分辨「拖曳」和「點擊、捲動」？（SPEC v1.6 F2） | 整列都能拖，但手機上手指放在步驟上也要能捲動頁面。 | **滑鼠**：`pointerdown` 後移動超過 5px 才開始拖。**觸控**：步驟列設 `touch-action: pan-y`（平常可以上下捲），`pointerdown` 後開一個 400ms 計時器；計時器到之前手指移動超過 10px 或收到 `pointercancel`（瀏覽器開始捲動）→ 取消。計時器到了才開始拖，這時加一個非被動（`passive: false`）的 `touchmove` 監聽，對它 `preventDefault()` 擋住捲動，放開後拿掉。步驟列加 `user-select: none`、`-webkit-touch-callout: none`，長按期間擋 `contextmenu`。**風險**：iOS Safari 對 `touchmove` 的 `preventDefault` 和 `pointercancel` 的時機和桌機模擬不同，要在真的 iPhone 上驗收。 |
| A12 | 拿掉 ↑↓ 按鈕後的鍵盤排序 | SPEC §6 要求所有功能都能只用鍵盤。 | **Alt+↑ / Alt+↓**（SPEC v1.6 F2）。沿用 `onMoveBy`，焦點留在原本的控制項上；勾選框因為變成鎖住而 disabled 時，改到同一步驟的 ✏️（SPEC v1.6 F2）。A5 裡「↑↓ 按鈕變 disabled 時焦點改到另一顆箭頭」那條規則跟著拿掉。 |
| A13 | 已完成的專案怎麼判斷？舊資料的完成日期怎麼補？ | 使用者希望完成的專案不要消失，而是放到「已完成」。 | **自動判斷**：用 `isProjectComplete`，不另外存「已封存」旗標；`completedAt` 只用來顯示和排序（SPEC v1.6 §3.2 第二條）。舊資料讀進來時用讀取當下的時間補上。 |
| A14 | 建立專案時在選單按「取消」 | 選單有「跳過」（建立、不設日期），「取消」要不要也建立？ | **不建立**，名稱保留在輸入框（SPEC v1.6 F8）。所以新增專案框送出時 view 不再自己清空，改由 app 呼叫 `view.clearDraft`。 |
| A15 | 切換欄位放哪裡？（**v1.8 被 A19 取代**） | 使用者希望放在整個畫面最下面。 | **`position: fixed` 在畫面最下面正中間**（SPEC v1.6 F10），`body` 下方留空間並避開 iPhone 的安全區域。彈窗打開時 `#app` 是 `inert`，切換欄位在 `#app` 裡，所以一起不能點。 |
| A16 | 行事曆檔（SPEC v1.7 F11）在哪裡產生、怎麼下載？ | Stairs 沒有伺服器，不能自己推播通知；改由行事曆 App 提醒。 | **`state.js` 的 `toIcs` 產生文字**（純函式，可以測），**`view.js` 用 Blob 下載**。格式照 RFC 5545：CRLF 換行；`,` `;` `\` 和換行要跳脫；每行最多 75 bytes，超過就折行（下一行開頭一個空白），不切斷中文字；`DTSTART` 不帶時區（和 A10 一樣是當地時間），不寫 `DTEND`（長度 0）；`VALARM` 用 `TRIGGER:-PT24H`；`UID` 是 `<專案 id>@stairs`；`DTSTAMP` 用產生當下的 UTC 時間。**風險**：iPhone 主畫面 App（獨立視窗）處理下載的方式和 Safari 不同，可能無法直接加入行事曆，要在真機上驗收；不行時請使用者改從 Safari 打開按一次。 |
| A17 | 隱藏式專案列表（SPEC v1.8 F12）只給手機用，還是電腦也用？怎麼做？ | 使用者希望畫面中間只放目前的專案，保持整潔。 | **電腦和手機都用**，只有一種版面。抽屜一直在 DOM 裡、用 `ui.drawer` 開關，開關的滑動交給既有的 View Transitions；關著時 `inert`，開著時後面的 `.main` 和 ≡ 按鈕 `inert`。 |
| A18 | 左邊緣右滑要怎麼偵測？ | Pointer Events 在瀏覽器開始捲動時會被 `pointercancel` 切斷；iPhone Safari 分頁的左邊緣右滑是「上一頁」。 | **在 `drag.js` 用被動的 touch 事件**判斷：從左邊 24px 內開始、往右超過 60px、橫向為主才打開；步驟拖曳中不判斷。Safari 分頁可能被「上一頁」搶走，這點寫進 SPEC F12，主畫面 App 不受影響，≡ 按鈕永遠可用。 |
| A19 | 抽屜收起來後，未完成／已完成切換放哪？ | A15 原本固定在畫面最下面正中間；收起列表後，切換看不到它在換什麼。 | **搬進抽屜最下面**（`position: sticky` 貼底）。**取代 A15。** 畫面最下面只剩左下角的 ≡。 |
| A20 | 專案完成後能不能自動刪掉 iPhone 行事曆裡的事件？（**v1.9 起慶祝畫面不再提醒**，見 A21） | 網頁沒有權限動行事曆；要自動同步必須有伺服器（訂閱網址），違反 SPEC §2。下載「取消事件」檔，iPhone 行事曆也不會處理。 | **不刪，改成提醒**：有截止日期的專案完成時，慶祝畫面多一行「記得到行事曆刪掉」（SPEC v1.8 F5）。`ui.celebrate` 多帶 `hasDeadline`。 |
| A21 | F11 怎麼記住「加過行事曆」？（SPEC v1.9） | 使用者分不清楚自己加過沒；改了截止日期之後，行事曆裡是舊的時間。 | **存最後一次下載時的截止日期 `calendarDeadline`**，不是布林值：`null` = 沒加過、等於 `deadline` = 已加入、不同 = 要重新加入。它只代表「下載過」，Stairs 無法知道使用者最後有沒有真的存進行事曆。按「已加入」的說明只有「知道了」，按下後清成 `null`，按鈕回到「加入行事曆」（使用者的選擇：看完說明就當作自己會去處理）；Esc、點外面不清。使用者要把完成的事件留在行事曆裡，所以拿掉 A20 的慶祝畫面提醒。 |
