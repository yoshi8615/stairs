# Stairs 實作計畫（PLAN）

> 對應規格：`SPEC.md` v1.2　｜　對應架構：`ARCHITECTURE.md`　｜　日期：2026-10-04

---

## 0. 本文件的地位

1. 本文件回答「**照什麼順序做**」：每一步做什麼、碰哪些檔案、做完怎麼檢查。
2. 優先順序：`SPEC.md` > `ARCHITECTURE.md` > `PLAN.md`。和上層矛盾時，**以上層為準**，並回報使用者。
3. 步驟編號是 `PxTy`（第 x 階段、第 y 項）。寫程式時，每段程式上方用同樣的編號標註，例如 `P1T5: checkStep`。
4. 編號只往後加，不重用、不插號、不重新編號。

---

## 1. 目標與範圍

### 1.1 目標

照 `SPEC.md` v1.2 做出完整的 Stairs 網頁：
- F1–F7 全部功能、SPEC §5 畫面、SPEC §6 無障礙、SPEC §3.3 儲存規則。
- 另外做一個 `test.html`，雙擊就能自動檢查資料邏輯層（ARCHITECTURE §4.2）。

### 1.2 範圍外

- SPEC §9 列的全部項目（帳號、同步、協作、截止日、子步驟、匯出入、Undo、專案排序）。
- 任何 npm、建置工具、測試框架、外部套件。
- 修改 `SPEC.md`。要改行為，先照 SPEC §0 改規格，再回來改計畫。
- `test.html` 不測畫面層和儲存層；那兩層靠 §3 的手動驗收。

### 1.3 已決定的事

ARCHITECTURE §6 的決定紀錄。每一項影響哪些步驟：

| 項目 | 決定 | 影響的步驟 |
|---|---|---|
| A1 確認視窗做法 | 自己做，和慶祝彈窗共用 dialog | P3T4、P3T5、P3T9 |
| A2 `normalize` 怎樣算格式不對 | 最外層壞 → 空資料；單筆壞 → 只丟那一筆（SPEC v1.2 §3.3） | P1T6 |
| A3 JS 語法版本 | 現代語法，不用 ES module | P1T1（之後所有檔案都照它） |
| A4 拖到已完成區的視覺表現 | 線停在未完成區最上面，`toIndex` 先修正 | P3T8 |

---

## 2. 實作步驟（依序）

每一步都要能單獨做完、單獨檢查。「依賴」寫的是**必須先完成**的步驟。

### P1　資料邏輯層（ARCHITECTURE §2.1）

#### P1T1　檔案骨架
- **檔案：** `index.html`、`test.html`、`css/style.css`、`js/state.js`、`js/storage.js`、`js/view.js`、`js/drag.js`、`js/app.js`、`js/tests.js`（全部新建，先放空殼）
- **內容：** 每個 JS 檔用 `var Stairs = window.Stairs || {};` 掛上自己的命名空間；兩個 HTML 照 ARCHITECTURE §1.1 的順序載入。`tests.js` 內建小型 `assert` 和結果列表。
- **依賴：** A3 已決定。
- **檢查：** 雙擊兩個 HTML，DevTools Console 沒有錯誤；在 Console 打 `Stairs` 看得到各層的物件。

#### P1T2　空資料、id、查詢函式
- **檔案：** `js/state.js`、`js/tests.js`
- **內容：** `emptyState`、id 產生、`getCurrentStepIndex`、`countDone`、`isProjectComplete`；另寫一個測試用的「不變式檢查」函式放在 `tests.js`。
- **依賴：** P1T1
- **檢查：** `test.html` 有這些函式的測試且全部通過，包含：0 步驟的專案 `isProjectComplete` 是 `false`、全部未完成時 `getCurrentStepIndex` 是 `0`、全部完成時是 `-1`。

#### P1T3　專案操作
- **檔案：** `js/state.js`、`js/tests.js`
- **內容：** `createProject`、`renameProject`、`deleteProject`、`setActiveProject`。名稱去空白、空的拒絕、100 字截斷（SPEC §3.1）。`deleteProject` 照 SPEC F7 調整 `activeProjectId`。
- **依賴：** P1T2
- **檢查：** `test.html` 全部通過，至少包含：新專案在最後且變成 active；空白名稱回傳**同一個** state（`===`）；刪中間的 active 專案 → 切到下一個；刪最後一個 → 切到上一個；刪唯一一個 → `null`；傳進去的 state 沒被改到（測試前後 `JSON.stringify` 相同）。

#### P1T4　步驟新增、改名、刪除
- **檔案：** `js/state.js`、`js/tests.js`
- **內容：** `addStep`、`renameStep`、`deleteStep`。200 字截斷。
- **依賴：** P1T2
- **檢查：** `test.html` 全部通過，至少包含：全部完成的專案加新步驟 → 新步驟變成目前這一階；刪掉目前這一階 → 下一個未完成的變成目前這一階；改名不影響 `done`。

#### P1T5　打勾、取消、移動
- **檔案：** `js/state.js`、`js/tests.js`
- **內容：** `checkStep`、`uncheckStep`、`moveStep`（SPEC F2、F4、F6、§7）。
- **依賴：** P1T2
- **檢查：** `test.html` 全部通過，至少包含：
  - 勾鎖住的步驟 → 回傳同一個 state。
  - `✓ ✓ ✓ □` 取消第 2 階 → `✓ □ □ □`。
  - `moveStep` 移已完成的步驟、或 `toIndex` 落在已完成區、或超出範圍 → 回傳同一個 state。
  - 每個測試做完都跑不變式檢查。

#### P1T6　`normalize`（讀取時的修正）
- **檔案：** `js/state.js`、`js/tests.js`
- **內容：** 照 SPEC §3.3「讀取時」的規則，加上 A2 的決定。
- **依賴：** P1T2、A2 已決定
- **檢查：** `test.html` 全部通過，至少包含：`null`、數字、字串、缺 `projects` → 空資料；`✓ □ ✓` → `✓ □ □`；`activeProjectId` 指向不存在 → 第一個專案（沒專案則 `null`）；`version` 不是 `1` → 空資料；某個步驟的 `done` 是字串 → 只丟掉那個步驟，其他步驟和專案都還在；某個專案名是空白 → 只丟掉那個專案；名稱超過長度 → 截斷，不丟掉。

### P2　儲存層（ARCHITECTURE §2.2）

#### P2T1　`load` / `save`
- **檔案：** `js/storage.js`
- **內容：** 照 ARCHITECTURE §2.2。所有例外都接住。
- **依賴：** P1T6
- **檢查：** 開 `index.html`，在 Console 執行：
  - `Stairs.storage.save(Stairs.state.createProject(Stairs.state.emptyState(), "測試"))` 回傳 `true`，DevTools → Application → Local Storage 看得到 `stairs.v1`。
  - 把 `stairs.v1` 改成亂碼後執行 `Stairs.storage.load()`，回傳空資料且 Console 有警告，沒有紅字錯誤。

### P3　畫面層與接線層（ARCHITECTURE §2.3、§2.4）

#### P3T1　接線骨架與靜態版面
- **檔案：** `js/app.js`、`js/view.js`、`css/style.css`
- **內容：** app 的啟動流程（ARCHITECTURE §4.1）和 `dispatch`；view 的 `render` 畫出 SPEC §5.1 版面、§5.2 兩種空狀態、進度條；CSS 變數、深色模式。
- **依賴：** P2T1
- **檢查：** 清空 localStorage 後開 `index.html`，看到「還沒有專案…」；系統切深色模式，畫面跟著變。

#### P3T2　F1 專案新增與切換
- **檔案：** `js/view.js`、`js/app.js`
- **依賴：** P3T1
- **檢查：** SPEC §8「F1 專案」三項全部通過；重新整理後目前打開的專案不變。

#### P3T3　F2 新增步驟、F3 鎖定外觀、F4 打勾
- **檔案：** `js/view.js`、`js/app.js`、`css/style.css`
- **內容：** 三種步驟外觀（SPEC F3 表格）、🔒、`disabled`、`title`、目前這一階的醒目標示。
- **依賴：** P3T2
- **檢查：** SPEC §8「F3 / F4」三項、「F2 步驟」第 1 項通過。

#### P3T4　共用 dialog、F6 取消打勾
- **檔案：** `js/app.js`、`js/view.js`、`css/style.css`
- **內容：** 先做共用的 dialog（`role="dialog"`、`aria-modal`、打開時焦點移進去、Esc 和點外面關閉、關掉後焦點回去），再用它做 `view.confirm(message, onYes)`（ARCHITECTURE §2.3），最後接上 F6。
- **依賴：** P3T3、A1 已決定
- **檢查：** SPEC §8「F6 取消打勾」三項全部通過；確認視窗按取消後，勾選框外觀仍是勾著的。

#### P3T5　F7 改名與刪除
- **檔案：** `js/view.js`、`js/app.js`
- **內容：** 鉛筆按鈕和雙擊進入改名、文字全選、Enter／離開儲存、Esc 取消；刪除步驟；刪除專案（確認）。
- **依賴：** P3T3、A1 已決定
- **檢查：** SPEC §8「F7 改名與刪除」三項全部通過。

#### P3T6　焦點保存與還原
- **檔案：** `js/view.js`、`js/app.js`
- **內容：** ARCHITECTURE §3.4。
- **依賴：** P3T5
- **檢查：** 只用鍵盤：在新增步驟框連續按 Enter 新增 3 個，焦點一直留在輸入框；Tab 到某個勾選框按空白鍵打勾，焦點仍在同一個步驟上。

#### P3T7　↑↓ 排序按鈕
- **檔案：** `js/view.js`、`js/app.js`
- **內容：** 只在未完成步驟顯示；第一個未完成步驟的 ↑、最後一個的 ↓ 要 disabled；按完焦點跟著那個步驟的同一顆按鈕。
- **依賴：** P3T6
- **檢查：** SPEC §8「F2 步驟」第 5 項通過；只用鍵盤連按 ↓ 兩次，同一個步驟往下移兩格。

#### P3T8　拖曳
- **檔案：** `js/drag.js`、`js/view.js`、`css/style.css`
- **內容：** Pointer Events、⋮⋮ 把手、半透明、放下位置的線、`touch-action`；放下時呼叫 `handlers.onMove`。
- **依賴：** P3T7、A4 已決定
- **檢查：** SPEC §8「F2 步驟」第 2、3、4 項通過；在 DevTools 手機模擬模式下拖曳時頁面不會跟著捲動。

#### P3T9　F5 慶祝彈窗
- **檔案：** `js/app.js`、`js/view.js`、`css/style.css`
- **內容：** 用 P3T4 做好的共用 dialog，焦點移到「關閉」；加上純 CSS 彩帶（約 2 秒）、`prefers-reduced-motion` 不播動畫。
- **依賴：** P3T4、P3T6
- **檢查：** SPEC §8「F5 慶祝」四項全部通過；DevTools → Rendering 開啟「prefers-reduced-motion: reduce」後，只有文字沒有動畫。

#### P3T10　無法儲存提示、手機版面
- **檔案：** `js/view.js`、`css/style.css`
- **內容：** `ui.storageWarning` 的提示列；`< 640px` 上下排列；按鈕觸控區至少 40×40px；全部 icon 按鈕的 `aria-label`。
- **依賴：** P3T9
- **檢查：** §3 的 C5、C6 通過。

### P4　總驗收

#### P4T1　全部檢查一次
- **檔案：** 不改檔案（發現問題就回到對應步驟修）。
- **依賴：** P3T10
- **檢查：** §3 全部項目通過。

---

## 3. 驗收標準

全部通過才算完成。指令都在專案根目錄（`stairs/`）用 Git Bash 執行。

**C1　資料邏輯測試**
- 做法：雙擊 `test.html`。
- 通過：最上面顯示「通過 Y / Y」，沒有任何失敗項。

**C2　不用 module、不用外部資源**
- 做法：
  ```
  grep -rnE 'type="module"|^\s*(import|export) |https?://' index.html test.html css js
  ```
- 通過：沒有任何輸出。

**C3　資料邏輯層不碰 DOM 和儲存**
- 做法：
  ```
  grep -nE 'document|localStorage' js/state.js
  ```
- 通過：沒有任何輸出。

**C4　畫面層不直接改資料、不碰儲存**
- 做法：
  ```
  grep -nE 'localStorage|Stairs\.storage|Stairs\.state\.(create|rename|delete|add|move|check|uncheck|setActive)' js/view.js js/drag.js
  ```
- 通過：沒有任何輸出。

**C5　無法儲存提示**
- 做法：Firefox 網址列打 `about:config`，把 `dom.storage.enabled` 設成 `false`，再雙擊 `index.html`。測完記得改回 `true`。
- 通過：畫面上方顯示「無法儲存，重新整理後資料會消失」；新增專案、新增步驟、打勾都照常可用；Console 沒有紅字錯誤。

**C6　手機版面**
- 做法：DevTools 手機模擬，寬度 375px。
- 通過：專案清單在上、步驟在下；沒有橫向捲軸；用 DevTools 量每顆按鈕至少 40×40px。

**C7　SPEC 手動驗收**
- 做法：照 `SPEC.md` §8 逐項在瀏覽器操作。
- 通過：每一項都打勾。

**C8　四種瀏覽器**
- 做法：在最新版 Chrome、Edge、Firefox、Safari 各雙擊一次 `index.html`。
- 通過：能新增專案、新增步驟、打勾，重新整理後資料還在。沒有 Safari 可測時，回報使用者這項沒做到，不可以當成通過。
