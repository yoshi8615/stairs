var Stairs = window.Stairs || {};

// P1T1: view layer namespace
Stairs.view = (() => {
  // Only the read-only queries of the data layer are used here
  const Q = Stairs.state;
  const LOCK_HINT = "需先完成上一階";

  // P3T1: module state
  let root = null;
  let dialogRoot = null;
  let handlers = null;
  let rendering = false;

  // P3T1: tiny DOM builder; events are delegated, so no "on*" props
  const PROP_KEYS = new Set(["value", "checked", "disabled"]);
  const h = (tag, props, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (PROP_KEYS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of children.flat()) {
      if (c !== null && c !== undefined && c !== false) el.append(c);
    }
    return el;
  };

  // P5T2: line icons (SPEC v1.3 §5.3). Parsed as HTML so the SVG namespace comes for free;
  // strokes take currentColor, so every icon follows the text color in both themes.
  const ICONS = {
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    stairs: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
  };
  const iconTpl = {};
  const icon = (name, cls = "") => {
    if (!iconTpl[name]) {
      const t = document.createElement("template");
      t.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
      iconTpl[name] = t.content.firstChild;
    }
    const el = iconTpl[name].cloneNode(true);
    if (cls) el.classList.add(cls);
    return el;
  };

  const iconBtn = (name, label, action, id, focusKey, extra = {}) =>
    h("button", {
      type: "button",
      class: "btn icon-btn",
      "aria-label": label,
      title: label,
      "data-action": action,
      "data-id": id,
      "data-focus-key": focusKey,
      ...extra,
    }, icon(name));

  // P3T6: focus keys (ARCHITECTURE §3.4)
  const getFocusKey = () => {
    const el = document.activeElement;
    return (el && el.dataset && el.dataset.focusKey) || null;
  };
  const findByKey = (key) => root.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);

  // P3T6: text typed in the add inputs survives unrelated re-renders
  const drafts = {};
  const saveDrafts = () => {
    root.querySelectorAll("[data-draft]").forEach((el) => {
      drafts[el.dataset.draft] = el.value;
    });
  };
  const restoreDrafts = () => {
    root.querySelectorAll("[data-draft]").forEach((el) => {
      el.value = drafts[el.dataset.draft] || "";
    });
  };

  // P3T5: a name is either plain text (double-click to rename) or the rename input
  const buildName = (ui, kind, id, name, cls) => {
    const editing = ui.editing && ui.editing.kind === kind && ui.editing.id === id;
    if (editing) {
      return h("input", {
        type: "text",
        class: `text-input rename-input ${cls}`,
        value: name,
        autocomplete: "off",
        "aria-label": kind === "project" ? "專案新名稱" : "步驟新名稱",
        "data-rename-kind": kind,
        "data-rename-id": id,
        "data-focus-key": "rename-input",
      });
    }
    return h("span", { class: cls, "data-dbl-rename": kind, "data-id": id, text: name });
  };

  // P7T6: date text shown to the user, "YYYY/MM/DD"
  const pad2 = (n) => String(n).padStart(2, "0");
  const deadlineDay = (deadline) => deadline.slice(0, 10).replace(/-/g, "/");
  const localDay = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
  };

  // P7T8: list entries slide / fade like steps do
  const vtName = (prefix, id) => `view-transition-name: ${CSS.escape(`${prefix}-${id}`)}; view-transition-class: proj`;

  // P7T6: open tab = deadline order with a separator per day (SPEC v1.6 F9);
  // P7T7: done tab = newest first, gray, with the completion date (SPEC v1.6 F10)
  const buildProjectItems = (state, ui) => {
    const done = ui.tab === "done";
    const items = Q.listProjects(state, ui.tab);
    if (items.length === 0) {
      return h("p", { class: "empty side-empty", text: done ? "還沒有完成的專案。" : "沒有未完成的專案。" });
    }
    const showSeparators = !done && items.some((p) => p.deadline !== null);
    const out = [];
    let lastGroup = null;
    for (const p of items) {
      if (showSeparators) {
        const group = p.deadline === null ? "none" : p.deadline.slice(0, 10);
        if (group !== lastGroup) {
          const label = p.deadline === null ? "無截止日期" : deadlineDay(p.deadline);
          out.push(h("li", { class: "project-sep", role: "separator", "aria-label": label, style: vtName("sep", group) },
            h("span", { "aria-hidden": "true", text: label })));
          lastGroup = group;
        }
      }
      out.push(h("li", { style: vtName("proj", p.id) },
        h("button", {
          type: "button",
          class: `project-item${done ? " project-item-done" : ""}`,
          "aria-current": p.id === state.activeProjectId ? "true" : null,
          "data-action": "select-project",
          "data-id": p.id,
          "data-focus-key": `project:${p.id}`,
        },
          h("span", { class: "project-item-name", text: p.name }),
          done ? h("span", { class: "project-item-meta", text: `完成於 ${localDay(p.completedAt)}` }) : null)));
    }
    return h("ul", { class: "project-list" }, out);
  };

  // P3T2: project list and add-project form; P7T10: inside a drawer that is always in the DOM
  // and only reachable while open (SPEC v1.8 F12, A17)
  const buildDrawer = (state, ui) =>
    h("aside", {
      id: "project-drawer",
      class: `drawer${ui.drawer ? " is-open" : ""}`,
      role: ui.drawer ? "dialog" : null,
      "aria-modal": ui.drawer ? "true" : null,
      "aria-label": "專案列表",
      inert: !ui.drawer,
    },
      h("div", { class: "drawer-head" },
        h("h1", { class: "brand" }, icon("stairs", "brand-icon"), "Stairs"),
        iconBtn("close", "關閉專案列表", "close-drawer", null, "drawer-close")),
      h("nav", { id: "project-nav", class: "drawer-nav", "aria-label": ui.tab === "done" ? "已完成專案" : "未完成專案" },
        buildProjectItems(state, ui)),
      h("form", { class: "add-form add-project", "data-form": "add-project" },
        h("input", {
          type: "text",
          class: "text-input",
          placeholder: "新專案名…",
          autocomplete: "off",
          "aria-label": "新專案名稱",
          "data-draft": "add-project",
          "data-focus-key": "add-project-input",
        }),
        h("button", { type: "submit", class: "btn btn-primary", "data-focus-key": "add-project-submit" }, icon("plus"), "新增")),
      buildTabbar(ui));

  // P7T10: ≡ in the bottom-left corner opens the drawer
  const buildDrawerButton = (ui) =>
    h("button", {
      type: "button",
      class: "btn drawer-btn",
      "aria-label": "打開專案列表",
      title: "專案列表",
      "aria-expanded": ui.drawer ? "true" : "false",
      "aria-controls": "project-drawer",
      inert: ui.drawer,
      "data-action": "open-drawer",
      "data-focus-key": "drawer-btn",
    }, icon("menu"));

  // P3T1: progress text and bar
  const buildProgress = (done, total) => {
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return h("div", { class: "progress" },
      h("span", { class: "progress-text", text: `進度 ${done} / ${total}` }),
      h("div", {
        class: "progress-bar",
        role: "progressbar",
        "aria-label": "進度",
        "aria-valuemin": 0,
        "aria-valuemax": total,
        "aria-valuenow": done,
      }, h("div", { class: "progress-fill", style: `width: ${pct}%` })));
  };

  // P6T2: each step's status at the last render, so only a step that just changed animates
  let lastStatus = new Map();

  // P7T3: not-done steps reorder with Alt+↑ / Alt+↓ (SPEC v1.6 F2, §6)
  const MOVE_KEYS = "Alt+ArrowUp Alt+ArrowDown";

  // P3T3: step rows with the three looks of SPEC F3; P7T3: no handle or ↑↓, the whole row drags
  const buildSteps = (project, ui) => {
    const current = Q.getCurrentStepIndex(project);
    const prevStatus = lastStatus;
    lastStatus = new Map();
    return h("ol", { class: "step-list", "data-step-list": "" },
      project.steps.map((step, i) => {
        const status = step.done ? "done" : i === current ? "current" : "locked";
        const locked = status === "locked";
        const was = prevStatus.get(step.id);
        lastStatus.set(step.id, status);
        const just = status === "done" && was === "current" ? " step-just-done"
          : status === "current" && was === "locked" ? " step-just-unlocked" : "";
        const keys = step.done ? null : MOVE_KEYS;
        return h("li", {
          class: `step step-${status}${just}`,
          // P5T3: stair level; CSS turns it into the capped indent
          // P6T1: own transition name so the row slides between positions
          style: `--i: ${i}; view-transition-name: ${CSS.escape(`step-${step.id}`)}; view-transition-class: step`,
          title: locked ? LOCK_HINT : null,
          "aria-current": status === "current" ? "step" : null,
          "data-step-row": "",
          "data-step-id": step.id,
          "data-done": String(step.done),
        },
          // label widens the hit area to 40×40 without making the title clickable
          h("label", { class: "check-hit" },
            h("input", {
              type: "checkbox",
              class: "check",
              checked: step.done,
              disabled: locked,
              title: locked ? LOCK_HINT : null,
              "aria-label": step.title,
              "aria-describedby": locked ? "lock-hint" : null,
              "aria-keyshortcuts": keys,
              "data-action": "toggle",
              "data-id": step.id,
              "data-focus-key": `step-check:${step.id}`,
            }),
            // P5T3: drawn tick over the restyled checkbox, shown by CSS when checked
            icon("check", "check-mark")),
          locked ? h("span", { class: "lock", "aria-hidden": "true" }, icon("lock")) : null,
          buildName(ui, "step", step.id, step.title, "step-title"),
          iconBtn("pencil", `改名步驟：${step.title}`, "start-rename", step.id, `rename:step:${step.id}`,
            { "data-kind": "step", "aria-keyshortcuts": keys }),
          iconBtn("trash", `刪除步驟：${step.title}`, "delete-step", step.id, `delete-step:${step.id}`,
            { "aria-keyshortcuts": keys }));
      }));
  };

  // P7T9: SPEC v1.7 F11 — the calendar never follows later changes, so say so on the button
  const CALENDAR_HINT = "下載行事曆檔，截止前 24 小時提醒。之後改截止日期要重新加入。";

  // P3T1: right side, including the two empty states of SPEC §5.2
  const buildMain = (state, ui) => {
    const project = state.projects.find((p) => p.id === state.activeProjectId);
    if (!project) {
      return h("main", { class: "main" },
        h("p", { class: "empty", text: "還沒有專案。點左下角的 ≡ 打開專案列表，建立你的第一個專案吧！" }));
    }
    const total = project.steps.length;
    return h("main", { class: "main" },
      h("header", { class: "project-header" },
        h("h2", { class: "project-name" }, buildName(ui, "project", project.id, project.name, "name-text")),
        iconBtn("pencil", `改名專案：${project.name}`, "start-rename", project.id, `rename:project:${project.id}`, { "data-kind": "project" }),
        iconBtn("trash", `刪除專案：${project.name}`, "delete-project", project.id, "delete-project")),
      // P7T5: F8 deadline button under the name; P7T9: F11 calendar button beside it
      h("div", { class: "deadline-row" },
        h("button", {
          type: "button",
          class: `btn deadline-btn${project.deadline ? " has-deadline" : ""}`,
          "aria-label": project.deadline ? `截止日期：${deadlineDay(project.deadline)} ${project.deadline.slice(11, 16)}，點一下修改` : null,
          "data-action": "edit-deadline",
          "data-focus-key": "deadline-btn",
        },
          icon("calendar"),
          project.deadline ? `截止 ${deadlineDay(project.deadline)} ${project.deadline.slice(11, 16)}` : "設定截止日期"),
        project.deadline
          ? h("button", {
              type: "button",
              class: "btn deadline-btn",
              title: CALENDAR_HINT,
              "aria-description": CALENDAR_HINT,
              "data-action": "add-to-calendar",
              "data-focus-key": "calendar-btn",
            }, icon("bell"), "加入行事曆")
          : null),
      buildProgress(Q.countDone(project), total),
      total === 0
        ? h("p", { class: "empty", text: "這個專案還沒有步驟。在下面新增第一階。" })
        : buildSteps(project, ui),
      h("form", { class: "add-form", "data-form": "add-step" },
        h("input", {
          type: "text",
          class: "text-input",
          placeholder: "新步驟…",
          autocomplete: "off",
          "aria-label": "新步驟標題",
          "data-draft": "add-step",
          "data-focus-key": "add-step-input",
        }),
        h("button", { type: "submit", class: "btn btn-primary", "data-focus-key": "add-step-submit" }, icon("plus"), "新增")));
  };

  // P7T7: open / done switch (SPEC F10); P7T10: at the bottom of the drawer (A19). The thumb is
  // its own element with a view-transition-name, so the re-render slides it to the other side.
  const buildTabbar = (ui) => {
    const tab = (value, label) => {
      const selected = ui.tab === value;
      return h("button", {
        type: "button",
        class: "tab",
        role: "tab",
        id: `tab-${value}`,
        tabindex: selected ? "0" : "-1",
        "aria-selected": selected ? "true" : "false",
        "aria-controls": "project-nav",
        "data-action": "set-tab",
        "data-tab": value,
        "data-focus-key": `tab:${value}`,
        text: label,
      });
    };
    return h("div", { class: "tabbar" },
      h("div", { class: "tabs", role: "tablist", "aria-label": "專案分頁" },
        h("span", { class: `tabs-thumb${ui.tab === "done" ? " is-right" : ""}`, "aria-hidden": "true" }),
        tab("open", "未完成"),
        tab("done", "已完成")));
  };

  // P3T4: shared dialog for confirm and celebrate (role, focus in, Esc / outside click, focus back)
  let dialog = null; // { kind, overlay, returnKey }

  const openDialog = ({ kind, label, labelledBy, describedBy, content, focusEl, onDismiss, returnKey }) => {
    const panel = h("div", {
      class: `dialog dialog-${kind}`,
      role: "dialog",
      tabindex: "-1",
      "aria-modal": "true",
      "aria-label": label,
      "aria-labelledby": labelledBy,
      "aria-describedby": describedBy,
    }, content);
    const overlay = h("div", { class: "dialog-overlay" }, panel);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) onDismiss();
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    });
    dialog = { kind, overlay, returnKey };
    root.inert = true;
    dialogRoot.append(overlay);
    focusEl.focus();
  };

  const closeDialog = (restoreFocus) => {
    if (!dialog) return;
    const { overlay, returnKey } = dialog;
    dialog = null;
    overlay.remove();
    root.inert = false;
    const el = restoreFocus && returnKey ? findByKey(returnKey) : null;
    if (el && !el.disabled) el.focus();
  };

  // P3T4: custom confirm (ARCHITECTURE §2.3, A1); initial focus on 取消 as the safe choice
  const confirm = (message, onYes) => {
    // P6T1: the dialog must open over the current DOM
    flush();
    if (dialog) return;
    const dismiss = () => closeDialog(true);
    const cancelBtn = h("button", { type: "button", class: "btn", text: "取消" });
    const yesBtn = h("button", { type: "button", class: "btn btn-primary", text: "確定" });
    cancelBtn.addEventListener("click", dismiss);
    yesBtn.addEventListener("click", () => {
      closeDialog(true);
      onYes();
    });
    openDialog({
      kind: "confirm",
      label: "確認",
      describedBy: "dialog-message",
      content: [
        h("p", { id: "dialog-message", class: "dialog-message", text: message }),
        h("div", { class: "dialog-actions" }, cancelBtn, yesBtn),
      ],
      focusEl: cancelBtn,
      onDismiss: dismiss,
      returnKey: getFocusKey(),
    });
  };

  // P7T4: date-time picker in the shared dialog (SPEC v1.6 F8, ARCHITECTURE §2.3).
  // onResult(string) on 完成, onResult(null) on 跳過 / 清除, nothing on 取消 / Esc / outside.
  const pickDeadline = ({ mode, value }, onResult) => {
    flush();
    if (dialog) return;
    const picker = Stairs.picker.create(value);
    const close = () => closeDialog(true);
    const button = (text, cls, fn) => {
      const b = h("button", { type: "button", class: `btn ${cls}`, text });
      b.addEventListener("click", fn);
      return b;
    };
    const finish = (result) => {
      close();
      onResult(result);
    };
    const side = mode === "create" ? button("跳過", "", () => finish(null))
      : value !== null ? button("清除", "", () => finish(null)) : null;
    openDialog({
      kind: "picker",
      labelledBy: "picker-title",
      content: [
        h("h2", { id: "picker-title", class: "dialog-title", text: mode === "create" ? "設定截止日期" : "截止日期" }),
        picker.el,
        h("div", { class: "dialog-actions picker-actions" },
          side ? h("span", { class: "actions-side" }, side) : null,
          button("取消", "", close),
          button("完成", "btn-primary", () => finish(picker.getValue()))),
      ],
      focusEl: picker.focusTarget(),
      onDismiss: close,
      // SPEC v1.6 §6: back to where the picker was opened from
      returnKey: mode === "create" ? "add-project-input" : getFocusKey(),
    });
    picker.mount();
  };

  // P7T9: let the browser save a generated file (SPEC v1.7 F11, A16)
  const download = (filename, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h("a", { href: url, download: filename, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    // revoke later: some browsers read the blob after click() returns
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  // P7T5: app empties the add-project input only after a project was really created (A14)
  const clearDraft = (name) => {
    drafts[name] = "";
    const el = root.querySelector(`[data-draft="${name}"]`);
    if (el) el.value = "";
  };

  // P3T9: celebrate dialog; confetti is pure CSS, each piece tuned by custom properties
  const CONFETTI_COUNT = 24;
  const openCelebrate = ({ projectName, hasDeadline }) => {
    const closeBtn = h("button", { type: "button", class: "btn btn-primary", text: "關閉" });
    closeBtn.addEventListener("click", () => handlers.onCloseCelebrate());
    const confetti = h("div", { class: "confetti", "aria-hidden": "true" },
      Array.from({ length: CONFETTI_COUNT }, (_, i) =>
        h("span", {
          style: `--x: ${(i * 37) % 100}%; --delay: ${(i % 6) * 0.08}s; --hue: ${(i * 47) % 360}; --spin: ${i % 2 ? 1 : -1}`,
        })));
    openDialog({
      kind: "celebrate",
      labelledBy: "celebrate-title",
      describedBy: "celebrate-project",
      content: [
        confetti,
        h("h2", { id: "celebrate-title", class: "celebrate-title", text: "🎉 全部完成！" }),
        h("p", { id: "celebrate-project", class: "celebrate-project", text: projectName }),
        // P7T11: a web page cannot delete calendar events itself (SPEC v1.8 F5, A20)
        hasDeadline ? h("p", { class: "celebrate-note", text: "如果加過行事曆，記得到行事曆刪掉這個截止事件。" }) : null,
        h("div", { class: "dialog-actions" }, closeBtn),
      ],
      focusEl: closeBtn,
      onDismiss: () => handlers.onCloseCelebrate(),
      // app restores focus itself through ui.focusKey (ARCHITECTURE §3.3)
      returnKey: null,
    });
  };

  // P3T1: full re-render; P3T6 adds focus save / restore (ARCHITECTURE §3.4)
  const draw = (state, ui) => {
    const prevKey = getFocusKey();
    const wanted = ui.focusKey || prevKey;

    // P3T9: app closed the celebration → drop the dialog before rebuilding
    if (dialog && dialog.kind === "celebrate" && !ui.celebrate) closeDialog(false);

    saveDrafts();
    rendering = true;
    root.replaceChildren(
      // P3T10: storage warning bar
      ui.storageWarning ? h("div", { class: "storage-warning", text: "無法儲存，重新整理後資料會消失" }) : "",
      // P7T10: the page behind an open drawer is inert
      h("div", { class: "layout", inert: ui.drawer }, buildMain(state, ui)),
      buildDrawerButton(ui),
      // replaceChildren would print null as text, so "" stands for "nothing"
      ui.drawer ? h("div", { class: "drawer-backdrop", "data-action": "close-drawer", "aria-hidden": "true" }) : "",
      buildDrawer(state, ui),
      h("span", { id: "lock-hint", class: "sr-only", text: LOCK_HINT }));
    rendering = false;
    restoreDrafts();

    const el = wanted ? findByKey(wanted) : null;
    if (el && !el.disabled) {
      el.focus();
      // select all only when the rename input first appears
      if (wanted === "rename-input" && prevKey !== "rename-input") el.select();
    }

    if (ui.celebrate && !dialog) openCelebrate(ui.celebrate);
  };

  // P6T1: render inside a view transition (SPEC v1.4 §5.3). The browser runs the callback a frame
  // later, so `pending` holds the newest arguments until then and flush() draws them right away
  // whenever app needs the DOM to be current.
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let pending = null;
  let transition = null;

  const flush = () => {
    if (!pending) return;
    const { state, ui } = pending;
    pending = null;
    draw(state, ui);
    transition.skipTransition();
  };

  const render = (state, ui) => {
    // app clears ui.focusKey right after render returns; keep the values from this call
    const args = { state, ui: { ...ui } };
    const animate = typeof document.startViewTransition === "function" && !reduceMotion.matches &&
      !dialog && !ui.celebrate && root.hasChildNodes();
    if (!animate) {
      if (pending) {
        pending = null;
        transition.skipTransition();
      }
      draw(args.state, args.ui);
      return;
    }
    if (pending) {
      pending = args; // the transition already waiting will draw the newest state
      return;
    }
    pending = args;
    transition = document.startViewTransition(() => {
      if (!pending) return;
      const a = pending;
      pending = null;
      draw(a.state, a.ui);
    });
    // a skipped transition rejects `ready`; that is expected, not an error
    transition.ready.catch(() => {});
    transition.updateCallbackDone.catch((e) => console.error(e));
  };

  // P3T5: rename commit on blur. A mouse click elsewhere first blurs the input; committing right
  // away would re-render and swallow that click, so wait until the pointer is released.
  let pointerDown = false;
  let pendingRename = null;

  const flushRename = () => {
    if (!pendingRename) return;
    const { kind, id, value } = pendingRename;
    pendingRename = null;
    handlers.onRename(kind, id, value);
  };

  const onFocusOut = (e) => {
    if (rendering || !e.target.matches(".rename-input")) return;
    pendingRename = { kind: e.target.dataset.renameKind, id: e.target.dataset.renameId, value: e.target.value };
    if (!pointerDown) setTimeout(flushRename, 0);
  };

  const onPointerEnd = () => {
    pointerDown = false;
    if (pendingRename) setTimeout(flushRename, 0);
  };

  // P3T2–P3T7: delegated events → handlers (every action commits a pending rename first)
  const onClick = (e) => {
    const t = e.target.closest("[data-action]");
    if (!t || t.dataset.action === "toggle") return;
    const id = t.dataset.id;
    flushRename();
    switch (t.dataset.action) {
      case "select-project": handlers.onSelectProject(id); break;
      case "start-rename": handlers.onStartRename(t.dataset.kind, id); break;
      case "delete-project": handlers.onDeleteProject(id); break;
      case "delete-step": handlers.onDeleteStep(id); break;
      case "edit-deadline": handlers.onEditDeadline(); break;
      case "set-tab": handlers.onSetTab(t.dataset.tab); break;
      case "add-to-calendar": handlers.onAddToCalendar(); break;
      case "open-drawer": handlers.onOpenDrawer(); break;
      case "close-drawer": handlers.onCloseDrawer(); break;
    }
  };

  const onDblClick = (e) => {
    const t = e.target.closest("[data-dbl-rename]");
    if (!t) return;
    flushRename();
    handlers.onStartRename(t.dataset.dblRename, t.dataset.id);
  };

  const onChange = (e) => {
    const t = e.target;
    if (t.dataset.action !== "toggle") return;
    const id = t.dataset.id;
    const checked = t.checked;
    flushRename();
    if (checked) handlers.onCheck(id);
    else handlers.onUncheck(id);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    const input = form.querySelector("input");
    const value = input.value;
    // P7T5: the project name stays until app confirms the create (cancel keeps it, A14)
    if (form.dataset.form === "add-step") input.value = "";
    flushRename();
    if (form.dataset.form === "add-project") handlers.onCreateProject(value);
    else if (form.dataset.form === "add-step") handlers.onAddStep(value);
  };

  const onKeyDown = (e) => {
    const t = e.target;

    // P7T10: Esc closes the open drawer (SPEC v1.8 F12)
    if (e.key === "Escape" && t.closest(".drawer.is-open") && !t.matches(".rename-input")) {
      e.preventDefault();
      handlers.onCloseDrawer();
      return;
    }

    // P7T3: Alt+↑ / Alt+↓ on any control inside a not-done step (SPEC v1.6 F2)
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && !t.matches(".rename-input")) {
      const row = t.closest("[data-step-row]");
      if (!row || row.dataset.done === "true") return;
      e.preventDefault();
      flushRename();
      handlers.onMoveBy(row.dataset.stepId, e.key === "ArrowUp" ? -1 : 1);
      return;
    }

    // P7T7: ← → switch tabs (SPEC v1.6 §6)
    if (t.matches("[role=tab]") && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      handlers.onSetTab(e.key === "ArrowLeft" ? "open" : "done");
      return;
    }

    if (!t.matches(".rename-input")) return;
    if (e.key === "Enter") {
      e.preventDefault();
      pendingRename = null;
      handlers.onRename(t.dataset.renameKind, t.dataset.renameId, t.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      pendingRename = null;
      handlers.onCancelRename();
    }
  };

  // P3T1: wire delegated listeners once
  const init = (handlerObj) => {
    handlers = handlerObj;
    root = document.getElementById("app");
    dialogRoot = document.getElementById("dialog-root");
    root.addEventListener("click", onClick);
    root.addEventListener("dblclick", onDblClick);
    root.addEventListener("change", onChange);
    root.addEventListener("submit", onSubmit);
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", () => { pointerDown = true; }, true);
    document.addEventListener("pointerup", onPointerEnd, true);
    document.addEventListener("pointercancel", onPointerEnd, true);
  };

  // P6T1: focus is read from the DOM, so it must be current
  return { init, render, confirm, pickDeadline, clearDraft, download, getFocusKey: () => { flush(); return getFocusKey(); } };
})();
