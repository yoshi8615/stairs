// `var` (not const) so every file can re-declare the shared global safely
var Stairs = window.Stairs || {};

// P1T1: data logic layer namespace
Stairs.state = (() => {
  // P1T2: name limits and id generation (SPEC §3.1)
  const PROJECT_NAME_MAX = 100;
  const STEP_TITLE_MAX = 200;

  const newId = (prefix) =>
    prefix + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

  // P1T2: empty state
  const emptyState = () => ({ version: 1, activeProjectId: null, projects: [] });

  // P1T2: read-only queries
  const getCurrentStepIndex = (project) => project.steps.findIndex((s) => !s.done);

  const countDone = (project) => project.steps.filter((s) => s.done).length;

  const isProjectComplete = (project) =>
    project.steps.length > 0 && project.steps.every((s) => s.done);

  // P1T3: name cleanup shared by projects and steps; null means "reject"
  // Truncates by code point so an emoji is never cut in half
  const cleanName = (name, max) => {
    if (typeof name !== "string") return null;
    const trimmed = name.trim();
    if (trimmed === "") return null;
    const chars = Array.from(trimmed);
    return chars.length > max ? chars.slice(0, max).join("") : trimmed;
  };

  // P1T3: replace one project; returns the same state when fn returns the same project
  const updateProject = (state, projectId, fn) => {
    const i = state.projects.findIndex((p) => p.id === projectId);
    if (i === -1) return state;
    const old = state.projects[i];
    const next = fn(old);
    if (next === old) return state;
    const projects = state.projects.slice();
    projects[i] = next;
    return { ...state, projects };
  };

  // P1T3: project operations (SPEC F1, F7)
  const createProject = (state, name) => {
    const clean = cleanName(name, PROJECT_NAME_MAX);
    if (clean === null) return state;
    const project = { id: newId("p_"), name: clean, createdAt: Date.now(), steps: [] };
    return { ...state, activeProjectId: project.id, projects: [...state.projects, project] };
  };

  const renameProject = (state, projectId, name) => {
    const clean = cleanName(name, PROJECT_NAME_MAX);
    if (clean === null) return state;
    return updateProject(state, projectId, (p) => (p.name === clean ? p : { ...p, name: clean }));
  };

  const deleteProject = (state, projectId) => {
    const i = state.projects.findIndex((p) => p.id === projectId);
    if (i === -1) return state;
    const projects = state.projects.filter((_, j) => j !== i);
    let activeProjectId = state.activeProjectId;
    if (activeProjectId === projectId) {
      // F7: after removal, projects[i] is the old "next"; else fall back to previous
      const fallback = projects[i] || projects[i - 1] || null;
      activeProjectId = fallback ? fallback.id : null;
    }
    return { ...state, activeProjectId, projects };
  };

  const setActiveProject = (state, projectId) => {
    if (state.activeProjectId === projectId) return state;
    if (!state.projects.some((p) => p.id === projectId)) return state;
    return { ...state, activeProjectId: projectId };
  };

  // P1T4: step add / rename / delete (SPEC F2, F7)
  const addStep = (state, projectId, title) => {
    const clean = cleanName(title, STEP_TITLE_MAX);
    if (clean === null) return state;
    return updateProject(state, projectId, (p) => ({
      ...p,
      steps: [...p.steps, { id: newId("s_"), title: clean, done: false }],
    }));
  };

  const renameStep = (state, projectId, stepId, title) => {
    const clean = cleanName(title, STEP_TITLE_MAX);
    if (clean === null) return state;
    return updateProject(state, projectId, (p) => {
      const i = p.steps.findIndex((s) => s.id === stepId);
      if (i === -1 || p.steps[i].title === clean) return p;
      const steps = p.steps.slice();
      steps[i] = { ...steps[i], title: clean };
      return { ...p, steps };
    });
  };

  const deleteStep = (state, projectId, stepId) =>
    updateProject(state, projectId, (p) => {
      if (!p.steps.some((s) => s.id === stepId)) return p;
      return { ...p, steps: p.steps.filter((s) => s.id !== stepId) };
    });

  // P1T5: check / uncheck / move (SPEC F2, F4, F6)
  const checkStep = (state, projectId, stepId) =>
    updateProject(state, projectId, (p) => {
      const i = getCurrentStepIndex(p);
      if (i === -1 || p.steps[i].id !== stepId) return p;
      const steps = p.steps.slice();
      steps[i] = { ...steps[i], done: true };
      return { ...p, steps };
    });

  const uncheckStep = (state, projectId, stepId) =>
    updateProject(state, projectId, (p) => {
      const i = p.steps.findIndex((s) => s.id === stepId);
      if (i === -1 || !p.steps[i].done) return p;
      // F6: step i and every step after it become not done
      const steps = p.steps.map((s, j) => (j >= i && s.done ? { ...s, done: false } : s));
      return { ...p, steps };
    });

  const moveStep = (state, projectId, stepId, toIndex) =>
    updateProject(state, projectId, (p) => {
      const from = p.steps.findIndex((s) => s.id === stepId);
      if (from === -1 || p.steps[from].done) return p;
      // Legal targets are the not-done block only: [countDone, length - 1]
      if (!Number.isInteger(toIndex) || toIndex < countDone(p) || toIndex >= p.steps.length) return p;
      if (toIndex === from) return p;
      const steps = p.steps.slice();
      const [moved] = steps.splice(from, 1);
      steps.splice(toIndex, 0, moved);
      return { ...p, steps };
    });

  // P1T6: normalize any raw value into a legal state (SPEC §3.3 "讀取時", A2)
  const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

  const normalizeStep = (raw) => {
    if (!isObject(raw) || typeof raw.id !== "string" || typeof raw.done !== "boolean") return null;
    const title = cleanName(raw.title, STEP_TITLE_MAX);
    if (title === null) return null;
    return { id: raw.id, title, done: raw.done };
  };

  const normalizeProject = (raw) => {
    if (!isObject(raw) || typeof raw.id !== "string") return null;
    if (typeof raw.createdAt !== "number" || !Array.isArray(raw.steps)) return null;
    const name = cleanName(raw.name, PROJECT_NAME_MAX);
    if (name === null) return null;

    const steps = [];
    raw.steps.forEach((s, j) => {
      const step = normalizeStep(s);
      if (step) steps.push(step);
      else console.warn(`[Stairs] 丟掉壞掉的步驟（專案 ${raw.id} 第 ${j + 1} 筆）`, s);
    });

    // Invariant repair: everything after the first not-done step becomes not done
    const cut = steps.findIndex((s) => !s.done);
    const fixed = cut === -1 ? steps : steps.map((s, k) => (k > cut && s.done ? { ...s, done: false } : s));

    return { id: raw.id, name, createdAt: raw.createdAt, steps: fixed };
  };

  const normalize = (raw) => {
    if (!isObject(raw) || raw.version !== 1 || !Array.isArray(raw.projects)) {
      console.warn("[Stairs] 資料最外層格式不對，改用空資料", raw);
      return emptyState();
    }

    const projects = [];
    raw.projects.forEach((p, j) => {
      const project = normalizeProject(p);
      if (project) projects.push(project);
      else console.warn(`[Stairs] 丟掉壞掉的專案（第 ${j + 1} 筆）`, p);
    });

    const activeExists = projects.some((p) => p.id === raw.activeProjectId);
    const activeProjectId = activeExists ? raw.activeProjectId : projects.length ? projects[0].id : null;

    return { version: 1, activeProjectId, projects };
  };

  return {
    emptyState,
    getCurrentStepIndex,
    countDone,
    isProjectComplete,
    createProject,
    renameProject,
    deleteProject,
    setActiveProject,
    addStep,
    renameStep,
    deleteStep,
    checkStep,
    uncheckStep,
    moveStep,
    normalize,
  };
})();
