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

  // P7T1: deadline is local wall-clock "YYYY-MM-DDTHH:MM" (SPEC v1.6 §3.1, A10).
  // The calendar check runs in UTC so a DST gap in the viewer's zone never rejects a real date.
  const DEADLINE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
  const isValidDeadline = (s) => {
    const m = typeof s === "string" ? DEADLINE_RE.exec(s) : null;
    if (!m) return false;
    const [y, mo, d, hh, mm] = m.slice(1).map(Number);
    const t = new Date(Date.UTC(y, mo - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && hh <= 23 && mm <= 59;
  };

  // P7T1: invariant 2 (SPEC v1.6 §3.2) — completedAt is a number exactly when the project is complete
  const syncCompletedAt = (old, next) => {
    const was = isProjectComplete(old);
    const now = isProjectComplete(next);
    if (now && !was) return { ...next, completedAt: Date.now() };
    if (!now && next.completedAt !== null) return { ...next, completedAt: null };
    return next;
  };

  // P1T3: replace one project; returns the same state when fn returns the same project
  // P7T1: every project change passes syncCompletedAt here, so the rule lives in one place
  const updateProject = (state, projectId, fn) => {
    const i = state.projects.findIndex((p) => p.id === projectId);
    if (i === -1) return state;
    const old = state.projects[i];
    let next = fn(old);
    if (next === old) return state;
    next = syncCompletedAt(old, next);
    const projects = state.projects.slice();
    projects[i] = next;
    return { ...state, projects };
  };

  // P1T3: project operations (SPEC F1, F7)
  // P7T1: deadline is optional; an invalid one rejects the whole create (SPEC v1.6 §7)
  const createProject = (state, name, deadline = null) => {
    const clean = cleanName(name, PROJECT_NAME_MAX);
    if (clean === null) return state;
    if (deadline !== null && !isValidDeadline(deadline)) return state;
    const project = { id: newId("p_"), name: clean, createdAt: Date.now(), deadline, completedAt: null, steps: [] };
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

  // P7T1: F8 set or clear (null) the deadline
  const setDeadline = (state, projectId, deadline) => {
    if (deadline !== null && !isValidDeadline(deadline)) return state;
    return updateProject(state, projectId, (p) => (p.deadline === deadline ? p : { ...p, deadline }));
  };

  // P7T1: F9 / F10 tab contents. Array sort is stable, so ties keep creation order.
  // Fixed-width deadline strings compare correctly as plain strings.
  const listProjects = (state, tab) => {
    const done = tab === "done";
    const items = state.projects.filter((p) => isProjectComplete(p) === done);
    if (done) return items.sort((a, b) => b.completedAt - a.completedAt);
    return items.sort((a, b) => {
      if (a.deadline === b.deadline) return 0;
      if (a.deadline === null) return 1;
      if (b.deadline === null) return -1;
      return a.deadline < b.deadline ? -1 : 1;
    });
  };

  // P7T9: F11 calendar file (RFC 5545, ARCHITECTURE A16)
  const icsText = (s) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

  // content lines are at most 75 octets; continuation lines start with one space.
  // Counts UTF-8 bytes per code point so a Chinese character is never split.
  const utf8Len = (ch) => {
    const cp = ch.codePointAt(0);
    return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  };
  const foldLine = (line) => {
    const parts = [];
    let cur = "";
    let bytes = 0;
    for (const ch of line) {
      const n = utf8Len(ch);
      const limit = parts.length === 0 ? 75 : 74; // the leading space takes one octet
      if (bytes + n > limit) {
        parts.push(cur);
        cur = "";
        bytes = 0;
      }
      cur += ch;
      bytes += n;
    }
    parts.push(cur);
    return parts.join("\r\n ");
  };

  const toIcs = (project) => {
    if (!project || !isValidDeadline(project.deadline)) return null;
    // floating local time, same as the stored deadline (A10)
    const start = project.deadline.replace(/[-:]/g, "") + "00";
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const name = icsText(project.name);
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Stairs//Stairs//ZH-TW",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${project.id}@stairs`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `SUMMARY:截止：${name}`,
      "DESCRIPTION:來自 Stairs",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT24H",
      `DESCRIPTION:「${name}」明天這個時候截止`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ];
    return lines.map(foldLine).join("\r\n") + "\r\n";
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

    // P7T1: the two v1.6 fields are repaired, never a reason to drop the project
    let deadline = null;
    if (isValidDeadline(raw.deadline)) deadline = raw.deadline;
    else if (raw.deadline !== undefined && raw.deadline !== null) {
      console.warn(`[Stairs] 專案 ${raw.id} 的截止日期格式不對，改成沒有截止日期`, raw.deadline);
    }
    const complete = fixed.length > 0 && fixed.every((s) => s.done);
    const completedAt = !complete ? null
      : Number.isFinite(raw.completedAt) ? raw.completedAt
      : Date.now(); // A13: data older than v1.6 gets the load time

    return { id: raw.id, name, createdAt: raw.createdAt, deadline, completedAt, steps: fixed };
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
    setDeadline,
    listProjects,
    isValidDeadline,
    toIcs,
    normalize,
  };
})();
