var Stairs = window.Stairs || {};

// P1T1: wiring layer namespace
Stairs.app = (() => {
  const S = Stairs.state;

  // P3T1: the single state, plus in-memory ui state (never saved)
  let state = null;
  // P7T7: tab is "open" / "done" and always starts on "open" (SPEC v1.6 F10)
  // P7T10: drawer is the hidden project list, closed on every load (SPEC v1.8 F12)
  const ui = { editing: null, celebrate: null, storageWarning: false, focusKey: null, tab: "open", drawer: false };
  let celebrateReturnKey = null;

  const activeProject = () => state.projects.find((p) => p.id === state.activeProjectId) || null;

  // P3T1: render, then drop the one-shot focus request
  const render = () => {
    Stairs.view.render(state, ui);
    ui.focusKey = null;
  };

  // P3T1: swap in a new state and save it; unchanged state is not saved
  const commit = (next) => {
    if (next === state) return;
    state = next;
    if (!Stairs.storage.save(state)) ui.storageWarning = true;
  };

  // P3T1: dispatch (ARCHITECTURE §3.1); always re-render so native checkboxes snap back
  const dispatch = (fn, ...args) => {
    commit(fn(state, ...args));
    render();
  };

  // P3T5: after Enter / Esc focus is still in the rename input, which is about to vanish;
  // send it to that item's ✏️ button. After a blur, focus is already where the user put it.
  const focusAfterRename = (kind, id) => {
    if (Stairs.view.getFocusKey() === "rename-input") ui.focusKey = `rename:${kind}:${id}`;
  };

  const handlers = {
    // P3T2: F1; P7T5: the deadline picker comes first, cancel creates nothing (SPEC v1.6 F8, A14)
    onCreateProject: (name) => {
      ui.editing = null;
      render();
      if (name.trim() === "") return;
      Stairs.view.pickDeadline({ mode: "create", value: null }, (deadline) => {
        ui.tab = "open";
        // P7T10: the new project opens with the drawer closed, ready for its first step
        ui.drawer = false;
        ui.focusKey = "add-step-input";
        Stairs.view.clearDraft("add-project");
        dispatch(S.createProject, name, deadline);
      });
    },
    onSelectProject: (projectId) => {
      ui.editing = null;
      // P7T10: picking a project closes the drawer (SPEC v1.8 F12, §6)
      if (ui.drawer) {
        ui.drawer = false;
        ui.focusKey = "drawer-btn";
      }
      dispatch(S.setActiveProject, projectId);
    },

    // P3T3: F2 add (focus stays in the input for the next step)
    onAddStep: (title) => {
      ui.focusKey = "add-step-input";
      dispatch(S.addStep, state.activeProjectId, title);
    },

    // P3T8: drag drop
    onMove: (stepId, toIndex) => {
      dispatch(S.moveStep, state.activeProjectId, stepId, toIndex);
    },

    // P3T7: keyboard reorder; P7T3: now Alt+↑ / Alt+↓, focus stays on the same control (A12)
    onMoveBy: (stepId, delta) => {
      const p = activeProject();
      const from = p ? p.steps.findIndex((s) => s.id === stepId) : -1;
      if (from === -1) return render();
      const next = S.moveStep(state, p.id, stepId, from + delta);
      let key = Stairs.view.getFocusKey();
      // the current step moved down becomes locked and its checkbox disabled: use its ✏️ instead
      const moved = next.projects.find((x) => x.id === p.id);
      if (key === `step-check:${stepId}` && moved.steps[S.getCurrentStepIndex(moved)]?.id !== stepId) {
        key = `rename:step:${stepId}`;
      }
      ui.focusKey = key;
      commit(next);
      render();
    },

    // P7T5: F8 change or clear the open project's deadline
    onEditDeadline: () => {
      const p = activeProject();
      if (!p) return render();
      Stairs.view.pickDeadline({ mode: "edit", value: p.deadline },
        (deadline) => dispatch(S.setDeadline, p.id, deadline));
    },

    // P7T9: F11 download a calendar file; P8T2: three button states (SPEC v1.9 F11, A21)
    onAddToCalendar: () => {
      const p = activeProject();
      if (!p || p.deadline === null) return;
      const download = () => {
        const text = S.toIcs(p);
        if (text === null) return;
        // characters no file system accepts become "_"
        const base = p.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "Stairs";
        Stairs.view.download(`${base}.ics`, text, "text/calendar;charset=utf-8");
        dispatch(S.markCalendarAdded, p.id);
      };
      const when = (d) => `${d.slice(0, 10).replace(/-/g, "/")} ${d.slice(11, 16)}`;

      if (p.calendarDeadline === null) return download();
      if (p.calendarDeadline === p.deadline) {
        // only 知道了 forgets the download; Esc / outside just close
        return Stairs.view.confirm(
          `這個專案已經加入過行事曆（截止 ${when(p.deadline)}）。網頁沒辦法幫你刪除行事曆裡的事件；` +
          `要取消提醒，請到行事曆 App 刪掉「截止：${p.name}」。按「知道了」後，這裡會變回「加入行事曆」。`,
          () => dispatch(S.clearCalendarAdded, p.id),
          { yes: "知道了", no: null });
      }
      Stairs.view.confirm(
        `截止日期改過了，行事曆裡還是舊的時間（${when(p.calendarDeadline)}）。下載新的行事曆檔後，請到行事曆 App 刪掉舊的事件。`,
        download,
        { yes: "下載新的", no: "取消" });
    },

    // P7T10: F12 drawer; focus goes to the open project in the list, else the add input (SPEC §6)
    onOpenDrawer: () => {
      if (ui.drawer) return;
      ui.editing = null;
      ui.drawer = true;
      const visible = S.listProjects(state, ui.tab).some((p) => p.id === state.activeProjectId);
      ui.focusKey = visible ? `project:${state.activeProjectId}` : "add-project-input";
      render();
    },
    onCloseDrawer: () => {
      if (!ui.drawer) return;
      ui.drawer = false;
      ui.focusKey = "drawer-btn";
      render();
    },

    // P7T7: F10 tab switch; keyboard focus follows the selected tab
    onSetTab: (tab) => {
      if (tab !== "open" && tab !== "done") return;
      if (String(Stairs.view.getFocusKey()).startsWith("tab:")) ui.focusKey = `tab:${tab}`;
      ui.tab = tab;
      render();
    },

    // P3T3: F4 check; P3T9 adds the celebrate trigger (SPEC §7 last paragraph)
    onCheck: (stepId) => {
      const p = activeProject();
      if (!p) return render();
      const before = S.isProjectComplete(p);
      commit(S.checkStep(state, p.id, stepId));
      const after = S.isProjectComplete(activeProject());
      if (!before && after) {
        celebrateReturnKey = Stairs.view.getFocusKey();
        ui.celebrate = { projectName: p.name };
      }
      render();
    },

    // P3T4: F6 uncheck; confirm only when later done steps would also roll back
    onUncheck: (stepId) => {
      const p = activeProject();
      const i = p ? p.steps.findIndex((s) => s.id === stepId) : -1;
      if (i === -1 || !p.steps[i].done) return render();
      const alsoBack = S.countDone(p) - i - 1;
      if (alsoBack === 0) return dispatch(S.uncheckStep, p.id, stepId);
      // re-render first so the checkbox shows checked again while asking
      render();
      Stairs.view.confirm(
        `取消這一階，後面 ${alsoBack} 個已完成的步驟也會一起退回。確定嗎？`,
        () => dispatch(S.uncheckStep, p.id, stepId));
    },

    // P3T5: F7 rename
    onStartRename: (kind, id) => {
      ui.editing = { kind, id };
      ui.focusKey = "rename-input";
      render();
    },
    onRename: (kind, id, name) => {
      focusAfterRename(kind, id);
      ui.editing = null;
      if (kind === "project") dispatch(S.renameProject, id, name);
      else dispatch(S.renameStep, state.activeProjectId, id, name);
    },
    onCancelRename: () => {
      if (ui.editing) focusAfterRename(ui.editing.kind, ui.editing.id);
      ui.editing = null;
      render();
    },

    // P3T5: F7 delete; focus moves to a neighbour's 🗑️ so keyboard users stay in the list
    onDeleteStep: (stepId) => {
      const p = activeProject();
      const i = p ? p.steps.findIndex((s) => s.id === stepId) : -1;
      if (i === -1) return render();
      const neighbour = p.steps[i + 1] || p.steps[i - 1];
      if (neighbour) ui.focusKey = `delete-step:${neighbour.id}`;
      if (ui.editing && ui.editing.id === stepId) ui.editing = null;
      dispatch(S.deleteStep, p.id, stepId);
    },
    onDeleteProject: (projectId) => {
      const p = state.projects.find((x) => x.id === projectId);
      if (!p) return render();
      Stairs.view.confirm(
        `確定要刪除專案「${p.name}」嗎？裡面的 ${p.steps.length} 個步驟也會一起刪掉。`,
        () => {
          ui.editing = null;
          dispatch(S.deleteProject, projectId);
        });
    },

    // P3T9: F5 close
    onCloseCelebrate: () => {
      ui.celebrate = null;
      ui.focusKey = celebrateReturnKey;
      celebrateReturnKey = null;
      render();
    },
  };

  // P3T1: startup (ARCHITECTURE §4.1)
  const start = () => {
    state = Stairs.storage.load();
    // trial write: detects blocked storage and stores normalize() fixes
    if (!Stairs.storage.save(state)) ui.storageWarning = true;
    Stairs.view.init(handlers);
    Stairs.drag.init(handlers);
    render();
  };

  document.addEventListener("DOMContentLoaded", start);

  return {};
})();
