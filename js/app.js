var Stairs = window.Stairs || {};

// P1T1: wiring layer namespace
Stairs.app = (() => {
  const S = Stairs.state;

  // P3T1: the single state, plus in-memory ui state (never saved)
  let state = null;
  const ui = { editing: null, celebrate: null, storageWarning: false, focusKey: null };
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
    // P3T2: F1
    onCreateProject: (name) => {
      ui.editing = null;
      dispatch(S.createProject, name);
    },
    onSelectProject: (projectId) => {
      ui.editing = null;
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

    // P3T7: ↑↓; focus follows the same arrow, or the other one if this one just became disabled
    onMoveBy: (stepId, delta) => {
      const p = activeProject();
      const from = p ? p.steps.findIndex((s) => s.id === stepId) : -1;
      if (from === -1) return render();
      const to = from + delta;
      const next = S.moveStep(state, p.id, stepId, to);
      if (next !== state) {
        const atEdge = delta < 0 ? to === S.countDone(p) : to === p.steps.length - 1;
        const up = delta < 0 ? !atEdge : atEdge;
        ui.focusKey = `${up ? "step-up" : "step-down"}:${stepId}`;
      }
      commit(next);
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
