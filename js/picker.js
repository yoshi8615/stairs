var Stairs = window.Stairs || {};

// P7T4: date-time picker content (view layer, ARCHITECTURE §2.3, A9). It only builds and drives
// its own DOM; the dialog around it, the buttons and the result all belong to view.js.
Stairs.picker = (() => {
  const WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  const pad2 = (n) => String(n).padStart(2, "0");
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

  // same tiny builder idea as view.js; picker.js loads first and depends on nothing
  const h = (tag, props, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, String(v));
    }
    for (const c of children.flat()) {
      if (c !== null && c !== undefined && c !== false) el.append(c);
    }
    return el;
  };

  const CHEVRONS = { prev: '<path d="M15 18l-6-6 6-6"/>', next: '<path d="M9 6l6 6-6 6"/>' };
  const chevron = (dir) => {
    const t = document.createElement("template");
    t.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${CHEVRONS[dir]}</svg>`;
    return t.content.firstChild;
  };

  // SPEC v1.6 F8: an existing deadline, else the next whole hour (23:30 → tomorrow 00:00)
  const initial = (value) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})/.exec(value || "");
    if (m) return { y: +m[1], m: +m[2] - 1, d: +m[3], hr: +m[4] };
    const t = new Date();
    t.setMinutes(0, 0, 0);
    t.setHours(t.getHours() + 1);
    return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate(), hr: t.getHours() };
  };

  const create = (value) => {
    const sel = initial(value);
    let shownY = sel.y;
    let shownM = sel.m;
    let focusDay = sel.d; // the one day button in the Tab order (roving tabindex)
    const today = new Date();

    // ---- calendar ----
    const title = h("span", { class: "cal-title", "aria-live": "polite" });
    const prevBtn = h("button", { type: "button", class: "btn icon-btn cal-nav", "aria-label": "上個月" }, chevron("prev"));
    const nextBtn = h("button", { type: "button", class: "btn icon-btn cal-nav", "aria-label": "下個月" }, chevron("next"));
    const grid = h("div", { class: "cal-grid" });

    const drawMonth = () => {
      title.textContent = `${shownY}年${shownM + 1}月`;
      const first = new Date(shownY, shownM, 1).getDay(); // 0 = Sunday, the first column
      const n = daysIn(shownY, shownM);
      focusDay = clamp(focusDay, 1, n);
      const cells = [];
      for (let i = 0; i < first; i++) cells.push(h("span", { class: "cal-blank" }));
      for (let d = 1; d <= n; d++) {
        const isSel = sel.y === shownY && sel.m === shownM && sel.d === d;
        const isToday = today.getFullYear() === shownY && today.getMonth() === shownM && today.getDate() === d;
        cells.push(h("button", {
          type: "button",
          class: `cal-day${isSel ? " is-selected" : ""}${isToday ? " is-today" : ""}`,
          tabindex: d === focusDay ? "0" : "-1",
          "aria-pressed": isSel ? "true" : "false",
          "aria-label": `${shownY}年${shownM + 1}月${d}日 ${WEEKDAYS[(first + d - 1) % 7]}${isToday ? "（今天）" : ""}`,
          "data-day": d,
          text: String(d),
        }));
      }
      grid.replaceChildren(...cells);
    };

    const dayButton = () => grid.querySelector(`[data-day="${focusDay}"]`);

    const showMonth = (y, m) => {
      const t = new Date(y, m, 1);
      shownY = t.getFullYear();
      shownM = t.getMonth();
      drawMonth();
    };

    prevBtn.addEventListener("click", () => showMonth(shownY, shownM - 1));
    nextBtn.addEventListener("click", () => showMonth(shownY, shownM + 1));

    grid.addEventListener("click", (e) => {
      const b = e.target.closest(".cal-day");
      if (!b) return;
      focusDay = Number(b.dataset.day);
      Object.assign(sel, { y: shownY, m: shownM, d: focusDay });
      drawMonth();
      dayButton().focus();
    });

    // SPEC v1.6 §6: ←→ one day, ↑↓ one week; crossing a month edge turns the page
    const STEP = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    grid.addEventListener("keydown", (e) => {
      if (!(e.key in STEP) || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const t = new Date(shownY, shownM, focusDay + STEP[e.key]);
      focusDay = t.getDate();
      showMonth(t.getFullYear(), t.getMonth());
      dayButton().focus();
    });

    // ---- hour wheel (24 h, one row per hour) ----
    const items = Array.from({ length: 24 }, (_, hr) =>
      h("div", { class: "wheel-item", "data-hour": hr, text: `${pad2(hr)}:00` }));
    const scroller = h("div", {
      class: "wheel-scroll",
      role: "spinbutton",
      tabindex: "0",
      "aria-label": "小時",
      "aria-valuemin": 0,
      "aria-valuemax": 23,
    }, h("div", { class: "wheel-pad" }), items, h("div", { class: "wheel-pad" }));

    let itemH = 36; // measured in mount(); CSS --wheel-item sets it
    let shownHour = -1;
    const hourAt = () => clamp(Math.round(scroller.scrollTop / itemH), 0, 23);

    // the centered row is the value; it updates while scrolling, snap settles it
    const syncHour = () => {
      const hr = hourAt();
      if (hr === shownHour) return;
      shownHour = hr;
      sel.hr = hr;
      scroller.setAttribute("aria-valuenow", hr);
      scroller.setAttribute("aria-valuetext", `${hr} 點`);
      items.forEach((it, i) => it.classList.toggle("is-selected", i === hr));
    };
    scroller.addEventListener("scroll", syncHour, { passive: true });

    const goTo = (hr, smooth) => {
      scroller.scrollTo({ top: clamp(hr, 0, 23) * itemH, behavior: smooth ? "smooth" : "auto" });
      syncHour();
    };

    scroller.addEventListener("click", (e) => {
      const it = e.target.closest(".wheel-item");
      if (it) goTo(Number(it.dataset.hour), !matchMedia("(prefers-reduced-motion: reduce)").matches);
    });

    // spinbutton keys: ↑ is +1 hour (ARIA), Home / End jump to the ends
    scroller.addEventListener("keydown", (e) => {
      const target = { ArrowUp: sel.hr + 1, ArrowDown: sel.hr - 1, Home: 0, End: 23 }[e.key];
      if (target === undefined) return;
      e.preventDefault();
      goTo(target, false);
    });

    const el = h("div", { class: "picker" },
      h("div", { class: "cal-head" }, title, h("span", { class: "cal-navs" }, prevBtn, nextBtn)),
      h("div", { class: "cal-weekdays", "aria-hidden": "true" }, WEEKDAYS.map((w) => h("span", { text: w }))),
      grid,
      h("div", { class: "wheel" }, h("div", { class: "wheel-band", "aria-hidden": "true" }), scroller));

    drawMonth();

    return {
      el,
      // SPEC v1.6 §6: the dialog opens with focus on the selected day
      focusTarget: () => dayButton(),
      // scroll positions only exist once the element is in the page
      mount: () => {
        itemH = items[0].getBoundingClientRect().height || itemH;
        scroller.scrollTop = sel.hr * itemH;
        shownHour = -1;
        syncHour();
      },
      getValue: () => `${sel.y}-${pad2(sel.m + 1)}-${pad2(sel.d)}T${pad2(hourAt())}:00`,
    };
  };

  return { create };
})();
