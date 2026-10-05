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
    grip: '<circle class="dot" cx="9" cy="6" r="1.4"/><circle class="dot" cx="15" cy="6" r="1.4"/><circle class="dot" cx="9" cy="12" r="1.4"/><circle class="dot" cx="15" cy="12" r="1.4"/><circle class="dot" cx="9" cy="18" r="1.4"/><circle class="dot" cx="15" cy="18" r="1.4"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
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

  // P3T2: project list and add-project form
  const buildSidebar = (state) =>
    h("aside", { class: "sidebar" },
      h("h1", { class: "brand" }, icon("stairs", "brand-icon"), "Stairs"),
      h("nav", { "aria-label": "專案清單" },
        h("ul", { class: "project-list" },
          state.projects.map((p) =>
            h("li", null,
              h("button", {
                type: "button",
                class: "project-item",
                text: p.name,
                "aria-current": p.id === state.activeProjectId ? "true" : null,
                "data-action": "select-project",
                "data-id": p.id,
                "data-focus-key": `project:${p.id}`,
              }))))),
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
        h("button", { type: "submit", class: "btn btn-primary", "data-focus-key": "add-project-submit" }, icon("plus"), "新增")));

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

  // P3T3: step rows with the three looks of SPEC F3; P3T7 adds ↑↓ for not-done steps
  const buildSteps = (project, ui) => {
    const current = Q.getCurrentStepIndex(project);
    const firstOpen = Q.countDone(project);
    const last = project.steps.length - 1;
    return h("ol", { class: "step-list", "data-step-list": "" },
      project.steps.map((step, i) => {
        const status = step.done ? "done" : i === current ? "current" : "locked";
        const locked = status === "locked";
        return h("li", {
          class: `step step-${status}`,
          // P5T3: stair level; CSS turns it into the capped indent
          style: `--i: ${i}`,
          title: locked ? LOCK_HINT : null,
          "aria-current": status === "current" ? "step" : null,
          "data-step-row": "",
          "data-step-id": step.id,
          "data-done": String(step.done),
        },
          step.done
            ? h("span", { class: "handle handle-off", "aria-hidden": "true" })
            : h("span", { class: "handle", "aria-hidden": "true", "data-drag-handle": "" }, icon("grip")),
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
              "data-action": "toggle",
              "data-id": step.id,
              "data-focus-key": `step-check:${step.id}`,
            }),
            // P5T3: drawn tick over the restyled checkbox, shown by CSS when checked
            icon("check", "check-mark")),
          locked ? h("span", { class: "lock", "aria-hidden": "true" }, icon("lock")) : null,
          buildName(ui, "step", step.id, step.title, "step-title"),
          h("span", { class: "arrows" },
            step.done
              ? null
              : [
                  iconBtn("up", `上移：${step.title}`, "move-up", step.id, `step-up:${step.id}`, { disabled: i === firstOpen }),
                  iconBtn("down", `下移：${step.title}`, "move-down", step.id, `step-down:${step.id}`, { disabled: i === last }),
                ]),
          iconBtn("pencil", `改名步驟：${step.title}`, "start-rename", step.id, `rename:step:${step.id}`, { "data-kind": "step" }),
          iconBtn("trash", `刪除步驟：${step.title}`, "delete-step", step.id, `delete-step:${step.id}`));
      }));
  };

  // P3T1: right side, including the two empty states of SPEC §5.2
  const buildMain = (state, ui) => {
    const project = state.projects.find((p) => p.id === state.activeProjectId);
    if (!project) {
      return h("main", { class: "main" },
        h("p", { class: "empty", text: "還沒有專案。在左邊輸入名稱，建立你的第一個專案吧！" }));
    }
    const total = project.steps.length;
    return h("main", { class: "main" },
      h("header", { class: "project-header" },
        h("h2", { class: "project-name" }, buildName(ui, "project", project.id, project.name, "name-text")),
        iconBtn("pencil", `改名專案：${project.name}`, "start-rename", project.id, `rename:project:${project.id}`, { "data-kind": "project" }),
        iconBtn("trash", `刪除專案：${project.name}`, "delete-project", project.id, "delete-project")),
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

  // P3T9: celebrate dialog; confetti is pure CSS, each piece tuned by custom properties
  const CONFETTI_COUNT = 24;
  const openCelebrate = ({ projectName }) => {
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
        h("div", { class: "dialog-actions" }, closeBtn),
      ],
      focusEl: closeBtn,
      onDismiss: () => handlers.onCloseCelebrate(),
      // app restores focus itself through ui.focusKey (ARCHITECTURE §3.3)
      returnKey: null,
    });
  };

  // P3T1: full re-render; P3T6 adds focus save / restore (ARCHITECTURE §3.4)
  const render = (state, ui) => {
    const prevKey = getFocusKey();
    const wanted = ui.focusKey || prevKey;

    // P3T9: app closed the celebration → drop the dialog before rebuilding
    if (dialog && dialog.kind === "celebrate" && !ui.celebrate) closeDialog(false);

    saveDrafts();
    rendering = true;
    root.replaceChildren(
      // P3T10: storage warning bar
      ui.storageWarning ? h("div", { class: "storage-warning", text: "無法儲存，重新整理後資料會消失" }) : "",
      h("div", { class: "layout" }, buildSidebar(state), buildMain(state, ui)),
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
      case "move-up": handlers.onMoveBy(id, -1); break;
      case "move-down": handlers.onMoveBy(id, 1); break;
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
    input.value = "";
    flushRename();
    if (form.dataset.form === "add-project") handlers.onCreateProject(value);
    else if (form.dataset.form === "add-step") handlers.onAddStep(value);
  };

  const onKeyDown = (e) => {
    const t = e.target;
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

  return { init, render, confirm, getFocusKey };
})();
