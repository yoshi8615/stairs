# Stairs 實作計畫（PLAN）

> 對應規格：`SPEC.md` v1.8　｜　對應架構：`ARCHITECTURE.md`　｜　日期：2026-10-04（P5、P6 加於 2026-10-05；P7 加於 2026-10-06）

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
| A9 日期時間選單 | 自己做（`picker.js`） | P7T4 |
| A10 `deadline` 格式 | 當地時間字串 `YYYY-MM-DDTHH:MM` | P7T1 |
| A11 拖曳怎麼開始 | 滑鼠 5px 門檻；觸控長按 400ms | P7T3 |
| A12 鍵盤排序 | Alt+↑ / Alt+↓ | P7T3 |
| A13 已完成判斷 | 自動用 `isProjectComplete`；舊資料補讀取當下時間 | P7T1 |
| A14 建立時按取消 | 不建立，名稱保留 | P7T5 |
| A15 切換欄位位置 | 固定在畫面最下面正中間（v1.8 被 A19 取代） | P7T7 |
| A16 行事曆檔 | `state.js` 產生文字、`view.js` 用 Blob 下載 | P7T9 |
| A17 隱藏式專案列表 | 電腦和手機都用；抽屜一直在 DOM，用轉場滑動 | P7T10 |
| A18 左邊緣右滑 | `drag.js` 用被動 touch 事件判斷 | P7T10 |
| A19 切換欄位位置 | 搬進抽屜底部（取代 A15） | P7T10 |
| A20 完成後的行事曆事件 | 不刪，慶祝畫面提醒使用者自己刪 | P7T11 |

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

### P5　介面美化（SPEC v1.3 §5.3）

只改外觀，不改任何功能和資料。`js/state.js`、`js/storage.js`、`js/app.js` 都不動。

#### P5T1　顏色和字體
- **檔案：** `css/style.css`
- **內容：** 換掉 `:root` 和深色模式兩組 CSS 變數：橘色主色、淺色米白底、深色接近黑的底。專案名稱和標題改用系統內建的襯線字（例如 Georgia、明體），不載入網路字體。
- **依賴：** P4T1
- **檢查：** 淺色、深色各開一次，畫面都換成新配色；用 DevTools 量橘色按鈕上的文字對比度至少 4.5:1。

#### P5T2　線條圖示
- **檔案：** `js/view.js`、`css/style.css`
- **內容：** view 加一個 `icon(name)`，產生 SVG 線條圖示（`stroke="currentColor"`、`aria-hidden="true"`）。換掉 ⋮⋮、✏️、🗑️、🔒、↑、↓。🎉 保留。按鈕的 `aria-label` 不改。
- **依賴：** P5T1
- **檢查：** 畫面上除了 🎉 和使用者自己打的字，沒有 emoji；淺色、深色下圖示顏色都跟著文字顏色變；C2 仍然沒有輸出。

#### P5T3　階梯狀步驟與三種狀態
- **檔案：** `js/view.js`、`css/style.css`
- **內容：** view 在每個步驟上設一個 CSS 變數表示第幾階；CSS 用它算縮排，有上限，手機寬度縮排比較小。三種狀態重新設計：已完成（橘色實心勾、變淡、刪除線）、目前（橘色外框、最醒目）、鎖住（灰色、虛線框、鎖頭圖示）。
- **依賴：** P5T2
- **檢查：** 一個專案有 12 個步驟時，前幾階往右排成階梯，超過上限後對齊在最右；三種狀態一眼分得出來；拖曳時放下位置的線對得上；375px 寬沒有橫向捲軸，標題還看得到。

#### P5T4　細節
- **檔案：** `css/style.css`
- **內容：** 按鈕、側欄專案清單、進度條、彈窗、hover 和焦點外框，統一成新風格。
- **依賴：** P5T3
- **檢查：** 只用鍵盤操作一輪，每個可按的東西都看得到焦點外框；按鈕觸控區仍至少 40×40px。

#### P5T5　美化後驗收
- **檔案：** 不改檔案（發現問題就回到對應步驟修）。
- **依賴：** P5T4
- **檢查：** §3 C1–C8 再跑一次，全部通過。

#### P5T6　App 圖示（SPEC v1.5 §5.3）
- **檔案：** `img/icon-180.png`（新增）、`index.html`
- **內容：** 畫一張 180×180 PNG（黑底橘色階梯，不透明）；`index.html` 加 `rel="icon"`、`rel="apple-touch-icon"` 和主畫面名稱。iPhone 只在「加入主畫面」那一刻抓圖示，舊的主畫面圖示不會自己換；刪掉舊圖示會連資料一起刪（README），所以要先加新的、確認資料搬好再刪舊的。
- **依賴：** P5T5
- **檢查：** 瀏覽器分頁出現圖示；iPhone Safari 重新「加入主畫面」後，主畫面是黑底橘色階梯、名稱是 Stairs；C2 仍然沒有輸出。

### P6　動畫（SPEC v1.4 §5.3）

用瀏覽器內建的 View Transitions（`document.startViewTransition`）。畫面仍是整頁重畫；瀏覽器在重畫前後各拍一張，中間補動畫。只改 `js/view.js` 和 `css/style.css`，`js/app.js`、`js/drag.js`、資料層、儲存層都不動。

#### P6T1　轉場骨架
- **檔案：** `js/view.js`、`css/style.css`
- **內容：** `view.render` 改成在轉場裡重畫。轉場的重畫會晚一個畫格，所以：
  - 轉場還沒開始重畫時又來一次 `render` → 只記下最新的 state，重畫一次就好。
  - `view.getFocusKey`、`view.confirm` 先把還沒做的重畫立刻做完（並跳過那次動畫），讓 app 讀到的畫面永遠是最新的。
  - 不支援、`prefers-reduced-motion`、彈窗開著、要跳慶祝彈窗、第一次畫面 → 直接重畫，不做動畫。
  - 每個步驟、進度條、新增步驟框各有自己的 `view-transition-name`，其他部分直接換掉不淡入淡出。
  - 轉場進行中滑鼠點擊直接穿過去（`pointer-events: none`），不擋操作。
- **依賴：** P5T5
- **檢查：** ↑↓、拖曳後步驟滑到新位置；進度條會長長；快速連按 ↓ 或在新增框連按 Enter，結果和沒動畫時一樣，焦點也一樣。

#### P6T2　個別動畫
- **檔案：** `js/view.js`、`css/style.css`
- **內容：** 新增步驟淡入、刪除步驟淡出；剛打勾的那一階勾勾彈一下、剛解鎖的那一階橘框亮一下（view 記住上一次每一階的狀態，只有「剛改變」的那一階加動畫 class）；彈窗淡入放大。`prefers-reduced-motion` 時全部關掉。
- **依賴：** P6T1
- **檢查：** 只有剛改變的那一階有動畫，其他階不會每次都跟著彈；DevTools 開「prefers-reduced-motion: reduce」後完全沒有動畫。

#### P6T3　動畫後驗收
- **檔案：** 不改檔案（發現問題就回到對應步驟修）。
- **依賴：** P6T2
- **檢查：** §3 C1–C8 再跑一次，全部通過。

### P7　截止日期、已完成分頁、拖曳改版、加入行事曆、隱藏式專案列表（SPEC v1.6–v1.8）

ARCHITECTURE §6 A9–A20 是這一階段的決定。P7T2、P7T3 和截止日期無關，可以先做。

#### P7T1　資料欄位與查詢
- **檔案：** `js/state.js`、`js/tests.js`
- **內容：** `isValidDeadline`、`syncCompletedAt`（ARCHITECTURE §2.1）；`addStep`、`deleteStep`、`checkStep`、`uncheckStep` 經過 `syncCompletedAt`；`createProject` 加 `deadline` 參數、新專案帶 `deadline` 和 `completedAt: null`；新增 `setDeadline`、`listProjects`；`normalize` 補兩個欄位的規則（SPEC §3.3）。測試的「不變式檢查」加上第二條。
- **依賴：** P6T3
- **檢查：** C1 全部通過（原本 41 項不能壞），新增的測試至少包含：
  - 打勾最後一階 → `completedAt` 是數字；再取消 → `null`；全部完成後加新步驟 → `null`。
  - 刪掉最後一個未完成步驟 → `completedAt` 是數字；刪到剩 0 步 → `null`。
  - 已完成專案改名、改截止日期 → `completedAt` 不變。
  - `setDeadline`：`"2026-02-30T10:00"`、`"2026-10-05"`、`"abc"`、數字 → 回傳同一個 state；`null` → 清除。
  - `createProject` 帶不合法的 `deadline` → 回傳同一個 state。
  - `listProjects(state, "open")`：早的在前、沒日期的在最後、同時間照建立順序；`"done"`：完成時間新的在前；0 步驟的專案在 `"open"`。
  - `normalize`：沒有這兩個欄位的舊資料 → 專案都還在；壞掉的 `deadline` → `null`；全部完成但沒 `completedAt` → 補成數字；沒完成但有 `completedAt` → `null`。

#### P7T2　階梯縮排
- **檔案：** `css/style.css`
- **內容：** `--stair-max` 改成 `2`；手機的 `--stair` 改成 `9px`（ARCHITECTURE §2.3）。
- **依賴：** P6T3
- **檢查：** 12 個步驟時，第 3 階起全部對齊；375px 寬沒有橫向捲軸、標題看得到；DevTools 量手機第 2 階的縮排是 9px。

#### P7T3　拖曳改版、Alt+↑↓
- **檔案：** `js/drag.js`、`js/view.js`、`js/app.js`、`css/style.css`
- **內容：** 拿掉 ⋮⋮ 把手和 ↑↓ 按鈕（連同它們的 CSS、`move-up`／`move-down` 動作、`step-up:`／`step-down:` 焦點 key）；`drag.js` 照 ARCHITECTURE §6 A11 改成從整列開始、滑鼠 5px 門檻、觸控長按 400ms；`view.js` 加 Alt+↑/↓ 的 `keydown` 和 `aria-keyshortcuts`；`app.js` 的 `onMoveBy` 焦點改成留在原本的控制項（A12）。手機版面的 ✏️ 🗑️ 位置重新看一次（ARCHITECTURE A7）。
- **依賴：** P7T2
- **檢查：** SPEC §8「F2 步驟」全部通過；DevTools 手機模擬：直接滑過步驟頁面會捲、長按後才拖；拖曳中頁面不捲；鍵盤 Alt+↓ 連按兩次，同一個步驟往下兩格，焦點不變。**真 iPhone** 上長按拖曳和捲動由使用者驗收（A11 的風險）。

#### P7T4　日期時間選單本體
- **檔案：** `js/picker.js`（新增）、`js/view.js`、`index.html`、`css/style.css`
- **內容：** `Stairs.picker.create(value)`（月曆、‹ ›、週日開頭、選中橘色實心圓、今天橘字、小時滾輪 `scroll-snap`、方向鍵、`role="spinbutton"`）；`view.pickDeadline` 用共用 dialog 包起來（兩種 `mode` 的按鈕、回呼規則）；`index.html` 照 ARCHITECTURE §1.1 的順序加 `picker.js`。
- **依賴：** P7T1
- **檢查：** 在 Console 執行 `Stairs.view.pickDeadline({ mode: "edit", value: "2026-10-05T16:00" }, console.log)`：月曆停在 2026 年 10 月、5 號是橘色圓、1 號在週四底下、滾輪停在 16:00；按完成印出字串，按清除印出 `null`，取消／Esc／點外面什麼都不印；只用鍵盤可以操作完；375px 寬放得下；深色模式正常。C2 沒有輸出。

#### P7T5　截止日期接線
- **檔案：** `js/view.js`、`js/app.js`
- **內容：** 專案名稱下方的截止日期按鈕和 `onEditDeadline`；`onCreateProject` 改成先開選單（ARCHITECTURE §2.4）；`view.clearDraft`，新增專案框送出時不再自己清空（A14）。
- **依賴：** P7T4
- **檢查：** SPEC §8「F8 截止日期」全部通過；焦點：建立流程結束回到新增專案框，修改流程結束回到截止日期按鈕。

#### P7T6　側欄排序與分組
- **檔案：** `js/view.js`、`css/style.css`
- **內容：** 側欄改用 `listProjects`；日期分隔線（`role="separator"`、灰色小字、兩邊橫線）；全部都沒截止日期時不顯示分隔線。
- **依賴：** P7T5
- **檢查：** SPEC §8「F9 排序與分組」全部通過。

#### P7T7　未完成／已完成切換欄位
- **檔案：** `js/view.js`、`js/app.js`、`css/style.css`、`index.html`
- **內容：** `ui.tab`、`onSetTab`；固定在畫面最下面正中間的切換欄位（`role="tablist"`、← → 切換）；已完成清單灰色名稱＋「完成於」小字；兩種空分頁文字；打開的專案只在看得到時醒目標示；`body` 下方留空間、`env(safe-area-inset-bottom)`、`viewport-fit=cover`（A15）。
- **依賴：** P7T6
- **檢查：** SPEC §8「F10 未完成／已完成」全部通過；捲到最底切換欄位沒蓋住任何東西；彈窗打開時點不到切換欄位。

#### P7T8　側欄和切換欄位的動畫
- **檔案：** `js/view.js`、`css/style.css`
- **內容：** 側欄每個專案一個 `view-transition-name`，分頁之間移動、重新排序時滑動／淡入淡出；切換欄位的色塊滑過去（ARCHITECTURE §2.3）。減少動態效果時全部關掉。
- **依賴：** P7T7
- **檢查：** 改截止日期後專案滑到新位置；切換分頁時色塊滑過去；DevTools 開「prefers-reduced-motion: reduce」後沒有動畫。

#### P7T9　加入行事曆（SPEC v1.7 F11）
- **檔案：** `js/state.js`、`js/tests.js`、`js/view.js`、`js/app.js`、`css/style.css`
- **內容：** `state.js` 加 `toIcs(project)`（ARCHITECTURE §2.1、A16）：RFC 5545 格式、CRLF 換行、文字跳脫、每行最多 75 bytes 折行、不帶時區的 `DTSTART`、`TRIGGER:-PT24H`、事件 id `<專案 id>@stairs`。截止日期按鈕旁邊的「加入行事曆」按鈕和 `handlers.onAddToCalendar`；app 算檔名、呼叫 `view.download`。
- **依賴：** P7T8
- **檢查：** C1 全部通過，新增的測試至少包含：沒有截止日期 → `null`；`DTSTART`、`TRIGGER`、`UID` 正確；名稱裡的 `,` `;` `\` 被跳脫；100 字的中文名稱折行後每行 ≤ 75 bytes，解開折行後標題和原本一樣；每行用 CRLF 結尾。無介面 Chrome：有截止日期才有按鈕；按下去下載的檔名和內容正確；資料沒變。SPEC §8「F11」的行事曆和 iPhone 項目由使用者手動驗收。

#### P7T10　隱藏式專案列表（SPEC v1.8 F12）
- **檔案：** `js/view.js`、`js/app.js`、`js/drag.js`、`css/style.css`
- **內容：** 側欄改成抽屜（ARCHITECTURE §2.3、A17）：`ui.drawer`、左下角 ≡ 按鈕、✕、遮罩、`inert`、Esc；未完成／已完成切換搬進抽屜底部（A19）；拿掉兩欄版面和手機上下排列，`.main` 置中；`drag.js` 加左邊緣右滑打開、在抽屜上左滑關閉（A18）；`handlers.onOpenDrawer`／`onCloseDrawer`，選專案和建立專案後關抽屜，焦點照 SPEC §6；空狀態文字改成指向 ≡。
- **依賴：** P7T9
- **檢查：** SPEC §8「F12」除了真手機那項全部通過；無介面 Chrome 模擬觸控：從左邊緣右滑會開、從中間右滑不會開、上下捲動和長按拖曳步驟不會開；1000px 和 375px 都沒有橫向捲軸；P7 原本的自動檢查（分頁、建立專案、拖曳…）改成先開抽屜後全部仍通過。

#### P7T11　慶祝畫面提醒刪行事曆（SPEC v1.8 F5）
- **檔案：** `js/app.js`、`js/view.js`、`css/style.css`
- **內容：** `ui.celebrate` 多帶 `hasDeadline`（A20），慶祝彈窗依它顯示灰色小字。
- **依賴：** P7T10
- **檢查：** SPEC §8「F5 慶祝」最後一項通過：有截止日期的專案完成時有那行字，沒有截止日期的沒有。

#### P7T12　P7 驗收（2026-10-06 經使用者同意從 P7T10 移到最後）
- **檔案：** 不改檔案（發現問題就回到對應步驟修）。
- **依賴：** P7T11
- **檢查：** §3 C1–C8 再跑一次，全部通過；另外在真 iPhone 上確認：長按拖曳、滾輪、≡ 按鈕和抽屜底部的切換欄位沒被底部橫條擋住、主畫面 App 從左邊緣右滑能打開列表，以及 SPEC §8「F11」：Safari 和主畫面 App 都能把行事曆檔加進行事曆。

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
  grep -nE 'localStorage|Stairs\.storage|Stairs\.state\.(create|rename|delete|add|move|check|uncheck|set)' js/view.js js/drag.js js/picker.js
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

---

## 4. 完成紀錄

| 日期 | 內容 |
|---|---|
| 2026-10-05 | P1–P4 全部完成，§3 C1–C8 全部通過。`test.html` 41 項通過；另用無介面（headless）Chrome 自動操作檢查 84 項（SPEC §8、鍵盤操作、手機版面、觸控拖曳）。使用者在瀏覽器和手機上完成手動驗收。線上版：GitHub Pages（`https://yoshi8615.github.io/stairs/`）。實作時補上的決定見 ARCHITECTURE §6 A5–A8。 |
| 2026-10-05 | P5T1–P5T4 完成。自動檢查通過：C1（`test.html` 41 / 41）、C2–C4；無介面 Chrome 檢查淺色／深色、桌機／375px 截圖、沒有橫向捲軸、按鈕都至少 40×40、畫面沒有 emoji、階梯縮排到第 9 階停止、打勾解鎖、拖曳放下線位置正確。按鈕文字對比度：淺色 4.75、深色 5.88。**P5T5 尚未完成**：C5（Firefox）、C8（Safari、Edge、Firefox）、真手機需使用者手動驗收。 |
| 2026-10-05 | P6T1–P6T2 完成。自動檢查通過：C1（41 / 41）、C2–C4；無介面 Chrome 用真的鍵盤／滑鼠事件檢查 21 項：轉場確實播放（步驟、進度條、新增框各自有動畫）、快速連按 ↓ 和連按 Enter 新增的結果與焦點都正確、只有剛改變的那一階有打勾／解鎖動畫、取消打勾的確認視窗和 Esc 後焦點、刪除和改名後焦點、拖曳、慶祝彈窗、減少動態效果時不跑轉場、Console 沒有錯誤。**P6T3 尚未完成**：Firefox、Safari、真手機上的動畫需使用者手動看。 |
| 2026-10-05 | P5T6 完成：`img/icon-180.png`（180×180、不透明）和 `index.html` 的圖示連結；C2 通過。iPhone 主畫面圖示需使用者 push 後重新「加入主畫面」確認。 |
| 2026-10-06 | P7T1–P7T8 完成。自動檢查通過：C1（`test.html` 52 / 52，含 11 項新測試）、C2–C4；無介面 Chrome 用真的滑鼠、鍵盤、觸控事件檢查 62 項：v1.5 舊資料升級不丟專案、階梯縮排到第 3 階停止（桌機 20px、手機 9px）、沒有把手和 ↑↓、按住整列拖曳、雙擊改名和點勾選框不會變成拖曳、已完成步驟不能拖、Alt+↑↓ 排序和焦點、手機快速滑過不拖／長按 0.4 秒才拖、日期時間選單（2026/10/1 在週四、換月、方向鍵、滾輪、完成／清除／跳過／取消／Esc、預設下一個整點、焦點回去）、建立專案的三種結果、側欄日期分組、分頁切換和完成日期、已完成專案取消打勾回到未完成、切換欄位置中且不蓋住新增框、375px 沒有橫向捲軸、按鈕至少 40×40、側欄和切換欄位的轉場動畫、Console 沒有錯誤。實作時補的規則：目前這一階被 Alt+↓ 移下去而變成鎖住時，焦點改到它的 ✏️（SPEC v1.6 F2）。**P7T10 驗收尚未完成**（原本的 P7T9 驗收，2026-10-06 經使用者同意和新加的「加入行事曆」互換編號）：真 iPhone 上的長按拖曳、滾輪手感、切換欄位和底部橫條，以及 C5、C8 需使用者手動驗收。 |
| 2026-10-06 | P7T9 完成（SPEC v1.7 F11 加入行事曆）。自動檢查通過：C1（`test.html` 56 / 56，含 4 項 `toIcs` 新測試：沒截止日期回傳 `null`、DTSTART／TRIGGER／UID／CRLF、跳脫、中文長名稱折行 ≤ 75 bytes）、C2–C4；無介面 Chrome：有截止日期才有按鈕、下載檔名與內容與 MIME 正確、資料不變、提示文字、375px 沒有橫向捲軸；P7 原本 62 項再跑一次全部通過。**P7T10 尚未完成**：真 iPhone（Safari 和主畫面 App）把行事曆檔加進行事曆並收到 24 小時前通知，以及前一筆列的手動項目。 |
| 2026-10-06 | P7T10–P7T11 完成（SPEC v1.8 F12 隱藏式專案列表、F5 行事曆提醒）。自動檢查通過：C1（56 / 56）、C2–C4；無介面 Chrome 新增 27 項：載入時抽屜收起且 inert、畫面置中、≡ 在左下角、≡ 打開／Esc／點遮罩／✕／左滑關閉、選專案後關閉且焦點回 ≡、Tab 不會跑出抽屜、切換欄位在抽屜底部、左邊緣右滑打開但從中間右滑和直向移動不會、長按拖曳步驟仍可用且不會打開抽屜、375px 和 1000px 沒有橫向捲軸、新增步驟框不被 ≡ 擋住、抽屜有轉場動畫、慶祝畫面只有在有截止日期時顯示行事曆提醒；P7 原本 62 項改成先開抽屜後全部通過，另加一項檢查畫面上沒有多餘的文字（修掉一個會印出「null」的 bug）。**P7T12 驗收尚未完成**：真 iPhone 上的項目（見 P7T12）。 |
