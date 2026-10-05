var Stairs = window.Stairs || {};

// P1T1: storage layer namespace
Stairs.storage = (() => {
  // P2T1: storage key (SPEC §3.3)
  const KEY = "stairs.v1";

  // P2T1: load; never throws. Firefox with storage disabled gives `window.localStorage === null`,
  // so the property access itself stays inside the try
  const load = () => {
    let text;
    try {
      text = window.localStorage.getItem(KEY);
    } catch (err) {
      console.warn("[Stairs] 無法讀取 localStorage，改用空資料", err);
      return Stairs.state.emptyState();
    }
    if (text === null) return Stairs.state.emptyState();

    let raw;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      console.warn("[Stairs] 存檔的 JSON 壞掉，改用空資料", err);
      return Stairs.state.emptyState();
    }
    return Stairs.state.normalize(raw);
  };

  // P2T1: save; returns false on any failure (blocked storage, quota, ...)
  const save = (state) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.warn("[Stairs] 無法儲存", err);
      return false;
    }
  };

  return { load, save };
})();
