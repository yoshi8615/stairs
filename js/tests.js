var Stairs = window.Stairs || {};

// P1T1: mini test runner (assert + result list)
Stairs.tests = (() => {
  const cases = [];

  const test = (name, fn) => {
    cases.push({ name, fn });
  };

  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg || "assert 失敗");
  };

  // Deep compare via JSON; enough for plain state objects
  const assertEqual = (actual, expected, msg) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error(`${msg || "不相等"}\n  實際：${a}\n  預期：${e}`);
    }
  };

  const run = () => {
    const summary = document.getElementById("summary");
    const list = document.getElementById("results");
    let passed = 0;

    for (const c of cases) {
      const li = document.createElement("li");
      try {
        c.fn();
        passed++;
        li.className = "pass";
        li.textContent = `✓ ${c.name}`;
      } catch (err) {
        li.className = "fail";
        li.textContent = `✗ ${c.name}`;
        const detail = document.createElement("div");
        detail.className = "detail";
        detail.textContent = err && err.message ? err.message : String(err);
        li.appendChild(detail);
      }
      list.appendChild(li);
    }

    summary.textContent = `通過 ${passed} / ${cases.length}`;
    summary.className = passed === cases.length ? "pass" : "fail";
  };

  return { test, assert, assertEqual, run };
})();

// Wrapped so test helpers do not leak into the global scope
(() => {
  const S = Stairs.state;
  const { test, assert, assertEqual } = Stairs.tests;

  // P1T2: fixtures; pattern "✓✓□" -> steps with fixed ids `${id}_s1`, `${id}_s2`, ...
  const proj = (id, pattern) => ({
    id,
    name: id,
    createdAt: 0,
    steps: Array.from(pattern).map((c, i) => ({ id: `${id}_s${i + 1}`, title: `步驟${i + 1}`, done: c === "✓" })),
  });
  const stateOf = (...projects) => ({
    version: 1,
    activeProjectId: projects.length ? projects[0].id : null,
    projects,
  });
  const pattern = (project) => project.steps.map((s) => (s.done ? "✓" : "□")).join("");
  const findProject = (state, id) => state.projects.find((p) => p.id === id);
  const ID_RE = (prefix) => new RegExp(`^${prefix}[0-9a-z]+_[0-9a-z]+$`);

  // P1T2: invariant check (SPEC §3.2), written independently of state.js
  const checkInvariant = (state) => {
    assert(state.version === 1, "version 應為 1");
    for (const p of state.projects) {
      const first = p.steps.findIndex((s) => !s.done);
      if (first !== -1) {
        assert(p.steps.slice(first).every((s) => !s.done), `專案 ${p.id} 違反不變式：${pattern(p)}`);
      }
    }
    if (state.projects.length) {
      assert(state.projects.some((p) => p.id === state.activeProjectId), "activeProjectId 必須指向存在的專案");
    } else {
      assert(state.activeProjectId === null, "沒有專案時 activeProjectId 應為 null");
    }
  };

  // P1T2: run an operation, verify the input was not modified and the output keeps the invariant
  const apply = (state, fn) => {
    const before = JSON.stringify(state);
    const next = fn(state);
    assert(JSON.stringify(state) === before, "傳進去的 state 被改到了");
    checkInvariant(next);
    return next;
  };

  // P1T2: emptyState and queries
  test("P1T2 emptyState 格式正確，每次都是新物件", () => {
    assertEqual(S.emptyState(), { version: 1, activeProjectId: null, projects: [] });
    assert(S.emptyState() !== S.emptyState(), "兩次呼叫應回傳不同物件");
    checkInvariant(S.emptyState());
  });

  test("P1T2 isProjectComplete：0 步驟是 false", () => {
    assert(S.isProjectComplete(proj("p", "")) === false);
  });

  test("P1T2 isProjectComplete：全部完成 true、有未完成 false", () => {
    assert(S.isProjectComplete(proj("p", "✓✓✓")) === true);
    assert(S.isProjectComplete(proj("p", "✓✓□")) === false);
  });

  test("P1T2 getCurrentStepIndex：全部未完成是 0、全部完成是 -1", () => {
    assert(S.getCurrentStepIndex(proj("p", "□□□")) === 0);
    assert(S.getCurrentStepIndex(proj("p", "✓✓✓")) === -1);
    assert(S.getCurrentStepIndex(proj("p", "✓□□")) === 1);
    assert(S.getCurrentStepIndex(proj("p", "")) === -1);
  });

  test("P1T2 countDone", () => {
    assert(S.countDone(proj("p", "")) === 0);
    assert(S.countDone(proj("p", "✓✓□")) === 2);
  });

  // P1T3: project operations
  test("P1T3 createProject：放最後、變 active、id 格式、名稱去空白", () => {
    const s0 = stateOf(proj("p1", "✓"));
    const s1 = apply(s0, (s) => S.createProject(s, "  寫論文  "));
    assert(s1 !== s0);
    assert(s1.projects.length === 2);
    const p = s1.projects[1];
    assert(ID_RE("p_").test(p.id), `id 格式不對：${p.id}`);
    assert(p.name === "寫論文", `名稱應去空白：「${p.name}」`);
    assert(typeof p.createdAt === "number");
    assertEqual(p.steps, []);
    assert(s1.activeProjectId === p.id);
  });

  test("P1T3 createProject：兩個專案 id 不同", () => {
    const s = apply(S.emptyState(), (x) => S.createProject(S.createProject(x, "A"), "B"));
    assert(s.projects[0].id !== s.projects[1].id);
  });

  test("P1T3 createProject：空白名稱回傳同一個 state", () => {
    const s0 = stateOf(proj("p1", ""));
    assert(apply(s0, (s) => S.createProject(s, "   ")) === s0);
    assert(apply(s0, (s) => S.createProject(s, "")) === s0);
    assert(apply(s0, (s) => S.createProject(s, null)) === s0);
  });

  test("P1T3 createProject：超過 100 字截斷（emoji 不切半）", () => {
    const s1 = apply(S.emptyState(), (s) => S.createProject(s, "a".repeat(150)));
    assert(s1.projects[0].name === "a".repeat(100));
    const s2 = apply(S.emptyState(), (s) => S.createProject(s, "😀".repeat(101)));
    assert(Array.from(s2.projects[0].name).length === 100);
    assert(s2.projects[0].name === "😀".repeat(100));
  });

  test("P1T3 renameProject：改名成功、不影響步驟", () => {
    const s0 = stateOf(proj("p1", "✓□"));
    const s1 = apply(s0, (s) => S.renameProject(s, "p1", " 新名字 "));
    assert(s1.projects[0].name === "新名字");
    assert(pattern(s1.projects[0]) === "✓□");
  });

  test("P1T3 renameProject：空白名稱、找不到 id 回傳同一個 state", () => {
    const s0 = stateOf(proj("p1", ""));
    assert(apply(s0, (s) => S.renameProject(s, "p1", "  ")) === s0);
    assert(apply(s0, (s) => S.renameProject(s, "nope", "X")) === s0);
  });

  test("P1T3 deleteProject：刪中間的 active → 切到下一個", () => {
    const s0 = { ...stateOf(proj("a", ""), proj("b", ""), proj("c", "")), activeProjectId: "b" };
    const s1 = apply(s0, (s) => S.deleteProject(s, "b"));
    assertEqual(s1.projects.map((p) => p.id), ["a", "c"]);
    assert(s1.activeProjectId === "c");
  });

  test("P1T3 deleteProject：刪最後一個 active → 切到上一個", () => {
    const s0 = { ...stateOf(proj("a", ""), proj("b", ""), proj("c", "")), activeProjectId: "c" };
    const s1 = apply(s0, (s) => S.deleteProject(s, "c"));
    assert(s1.activeProjectId === "b");
  });

  test("P1T3 deleteProject：刪唯一一個 → null", () => {
    const s1 = apply(stateOf(proj("a", "✓")), (s) => S.deleteProject(s, "a"));
    assert(s1.projects.length === 0);
    assert(s1.activeProjectId === null);
  });

  test("P1T3 deleteProject：刪非 active 的專案 → active 不變；找不到 id → 同一個 state", () => {
    const s0 = stateOf(proj("a", ""), proj("b", ""));
    const s1 = apply(s0, (s) => S.deleteProject(s, "b"));
    assert(s1.activeProjectId === "a");
    assert(apply(s0, (s) => S.deleteProject(s, "nope")) === s0);
  });

  test("P1T3 setActiveProject：切換成功；找不到 id 回傳同一個 state", () => {
    const s0 = stateOf(proj("a", ""), proj("b", ""));
    const s1 = apply(s0, (s) => S.setActiveProject(s, "b"));
    assert(s1.activeProjectId === "b");
    assert(apply(s0, (s) => S.setActiveProject(s, "nope")) === s0);
  });

  // P1T4: step add / rename / delete
  test("P1T4 addStep：加在最後、未完成、id 格式", () => {
    const s1 = apply(stateOf(proj("p", "✓□")), (s) => S.addStep(s, "p", " 新步驟 "));
    const steps = s1.projects[0].steps;
    assert(steps.length === 3);
    const last = steps[2];
    assert(ID_RE("s_").test(last.id), `id 格式不對：${last.id}`);
    assert(last.title === "新步驟");
    assert(last.done === false);
  });

  test("P1T4 addStep：全部完成的專案加新步驟 → 新步驟變成目前這一階", () => {
    const s1 = apply(stateOf(proj("p", "✓✓")), (s) => S.addStep(s, "p", "再一步"));
    const p = s1.projects[0];
    assert(S.getCurrentStepIndex(p) === 2);
    assert(S.isProjectComplete(p) === false);
  });

  test("P1T4 addStep：空白標題、找不到專案 → 同一個 state；超過 200 字截斷", () => {
    const s0 = stateOf(proj("p", ""));
    assert(apply(s0, (s) => S.addStep(s, "p", "  ")) === s0);
    assert(apply(s0, (s) => S.addStep(s, "nope", "X")) === s0);
    const s1 = apply(s0, (s) => S.addStep(s, "p", "b".repeat(250)));
    assert(s1.projects[0].steps[0].title === "b".repeat(200));
  });

  test("P1T4 renameStep：改名不影響 done", () => {
    const s1 = apply(stateOf(proj("p", "✓□")), (s) => S.renameStep(s, "p", "p_s1", "改過"));
    const step = s1.projects[0].steps[0];
    assert(step.title === "改過");
    assert(step.done === true);
    assert(pattern(s1.projects[0]) === "✓□");
  });

  test("P1T4 renameStep：空白、找不到步驟 → 同一個 state", () => {
    const s0 = stateOf(proj("p", "✓□"));
    assert(apply(s0, (s) => S.renameStep(s, "p", "p_s1", " ")) === s0);
    assert(apply(s0, (s) => S.renameStep(s, "p", "nope", "X")) === s0);
  });

  test("P1T4 deleteStep：刪掉目前這一階 → 下一個未完成的變成目前這一階", () => {
    const s1 = apply(stateOf(proj("p", "✓□□")), (s) => S.deleteStep(s, "p", "p_s2"));
    const p = s1.projects[0];
    assert(pattern(p) === "✓□");
    assert(p.steps[S.getCurrentStepIndex(p)].id === "p_s3");
  });

  test("P1T4 deleteStep：刪掉已完成的第一階，不變式仍成立；找不到 → 同一個 state", () => {
    const s0 = stateOf(proj("p", "✓✓□"));
    const s1 = apply(s0, (s) => S.deleteStep(s, "p", "p_s1"));
    assert(pattern(s1.projects[0]) === "✓□");
    assert(apply(s0, (s) => S.deleteStep(s, "p", "nope")) === s0);
  });

  // P1T5: check / uncheck / move
  test("P1T5 checkStep：勾目前這一階 → 下一階變成目前這一階", () => {
    const s1 = apply(stateOf(proj("p", "✓□□")), (s) => S.checkStep(s, "p", "p_s2"));
    const p = s1.projects[0];
    assert(pattern(p) === "✓✓□");
    assert(S.getCurrentStepIndex(p) === 2);
  });

  test("P1T5 checkStep：勾鎖住的或已完成的步驟 → 同一個 state", () => {
    const s0 = stateOf(proj("p", "✓□□"));
    assert(apply(s0, (s) => S.checkStep(s, "p", "p_s3")) === s0);
    assert(apply(s0, (s) => S.checkStep(s, "p", "p_s1")) === s0);
    assert(apply(s0, (s) => S.checkStep(s, "nope", "p_s2")) === s0);
  });

  test("P1T5 checkStep：勾最後一階 → isProjectComplete 從 false 變 true", () => {
    const s0 = stateOf(proj("p", "✓✓□"));
    const s1 = apply(s0, (s) => S.checkStep(s, "p", "p_s3"));
    assert(S.isProjectComplete(s0.projects[0]) === false);
    assert(S.isProjectComplete(s1.projects[0]) === true);
  });

  test("P1T5 uncheckStep：✓ ✓ ✓ □ 取消第 2 階 → ✓ □ □ □", () => {
    const s1 = apply(stateOf(proj("p", "✓✓✓□")), (s) => S.uncheckStep(s, "p", "p_s2"));
    assert(pattern(s1.projects[0]) === "✓□□□");
    assert(S.getCurrentStepIndex(s1.projects[0]) === 1);
  });

  test("P1T5 uncheckStep：取消最後一個已完成的只退回它自己；未完成的 → 同一個 state", () => {
    const s0 = stateOf(proj("p", "✓✓□"));
    const s1 = apply(s0, (s) => S.uncheckStep(s, "p", "p_s2"));
    assert(pattern(s1.projects[0]) === "✓□□");
    assert(apply(s0, (s) => S.uncheckStep(s, "p", "p_s3")) === s0);
    assert(apply(s0, (s) => S.uncheckStep(s, "p", "nope")) === s0);
  });

  test("P1T5 moveStep：在未完成區內移動", () => {
    const s0 = stateOf(proj("p", "✓□□□"));
    const s1 = apply(s0, (s) => S.moveStep(s, "p", "p_s2", 3));
    assertEqual(s1.projects[0].steps.map((x) => x.id), ["p_s1", "p_s3", "p_s4", "p_s2"]);
    const s2 = apply(s0, (s) => S.moveStep(s, "p", "p_s4", 1));
    assertEqual(s2.projects[0].steps.map((x) => x.id), ["p_s1", "p_s4", "p_s2", "p_s3"]);
    // the step now first in the not-done block is the new current step
    assert(s2.projects[0].steps[S.getCurrentStepIndex(s2.projects[0])].id === "p_s4");
  });

  test("P1T5 moveStep：移已完成的步驟 → 同一個 state", () => {
    const s0 = stateOf(proj("p", "✓✓□□"));
    assert(apply(s0, (s) => S.moveStep(s, "p", "p_s1", 3)) === s0);
  });

  test("P1T5 moveStep：toIndex 落在已完成區 → 同一個 state", () => {
    const s0 = stateOf(proj("p", "✓✓□□"));
    assert(apply(s0, (s) => S.moveStep(s, "p", "p_s3", 0)) === s0);
    assert(apply(s0, (s) => S.moveStep(s, "p", "p_s4", 1)) === s0);
  });

  test("P1T5 moveStep：toIndex 超出範圍或不是整數 → 同一個 state", () => {
    const s0 = stateOf(proj("p", "✓□□"));
    for (const bad of [-1, 3, 99, 1.5, NaN, "2", null]) {
      assert(apply(s0, (s) => S.moveStep(s, "p", "p_s2", bad)) === s0, `toIndex=${bad} 應不變`);
    }
    assert(apply(s0, (s) => S.moveStep(s, "nope", "p_s2", 2)) === s0);
    assert(apply(s0, (s) => S.moveStep(s, "p", "nope", 2)) === s0);
  });

  // P1T6: normalize
  const normalizeOk = (raw) => {
    const before = JSON.stringify(raw);
    const next = S.normalize(raw);
    assert(JSON.stringify(raw) === before, "normalize 改到了傳進去的資料");
    checkInvariant(next);
    return next;
  };
  const rawStep = (id, done, title = id) => ({ id, title, done });
  const rawProject = (id, steps, extra = {}) => ({ id, name: id, createdAt: 1, steps, ...extra });

  test("P1T6 normalize：最外層壞掉 → 空資料", () => {
    const bads = [
      null,
      undefined,
      42,
      "hello",
      [],
      {},
      { version: 1 },
      { version: 1, activeProjectId: null, projects: "x" },
      { version: 2, activeProjectId: null, projects: [] },
      { version: "1", activeProjectId: null, projects: [] },
    ];
    for (const raw of bads) {
      assertEqual(normalizeOk(raw), S.emptyState(), `輸入 ${JSON.stringify(raw)} 應變成空資料`);
    }
  });

  test("P1T6 normalize：合法資料原樣保留", () => {
    const raw = {
      version: 1,
      activeProjectId: "b",
      projects: [rawProject("a", [rawStep("s1", true), rawStep("s2", false)]), rawProject("b", [])],
    };
    assertEqual(normalizeOk(raw), raw);
  });

  test("P1T6 normalize：✓ □ ✓ → ✓ □ □", () => {
    const raw = {
      version: 1,
      activeProjectId: "a",
      projects: [rawProject("a", [rawStep("s1", true), rawStep("s2", false), rawStep("s3", true)])],
    };
    assert(pattern(normalizeOk(raw).projects[0]) === "✓□□");
  });

  test("P1T6 normalize：activeProjectId 指向不存在 → 第一個專案；沒專案 → null", () => {
    const raw = { version: 1, activeProjectId: "ghost", projects: [rawProject("a", []), rawProject("b", [])] };
    assert(normalizeOk(raw).activeProjectId === "a");
    assert(normalizeOk({ ...raw, activeProjectId: null }).activeProjectId === "a");
    assert(normalizeOk({ version: 1, activeProjectId: "ghost", projects: [] }).activeProjectId === null);
  });

  test("P1T6 normalize：某個步驟的 done 是字串 → 只丟掉那個步驟", () => {
    const raw = {
      version: 1,
      activeProjectId: "a",
      projects: [
        rawProject("a", [rawStep("s1", true), { id: "s2", title: "壞", done: "true" }, rawStep("s3", false)]),
        rawProject("b", [rawStep("t1", false)]),
      ],
    };
    const s = normalizeOk(raw);
    assertEqual(s.projects.map((p) => p.id), ["a", "b"]);
    assertEqual(s.projects[0].steps.map((x) => x.id), ["s1", "s3"]);
    assertEqual(s.projects[1].steps.map((x) => x.id), ["t1"]);
  });

  test("P1T6 normalize：其他壞掉的步驟也只丟那一筆", () => {
    const raw = {
      version: 1,
      activeProjectId: "a",
      projects: [
        rawProject("a", [
          rawStep("ok", false),
          "not an object",
          null,
          { id: 5, title: "id 不是字串", done: false },
          { id: "s3", title: "   ", done: false },
          { id: "s4", title: 7, done: false },
        ]),
      ],
    };
    assertEqual(normalizeOk(raw).projects[0].steps.map((x) => x.id), ["ok"]);
  });

  test("P1T6 normalize：某個專案名是空白 → 只丟掉那個專案", () => {
    const raw = {
      version: 1,
      activeProjectId: "bad",
      projects: [rawProject("a", []), rawProject("bad", [], { name: "   " }), rawProject("c", [])],
    };
    const s = normalizeOk(raw);
    assertEqual(s.projects.map((p) => p.id), ["a", "c"]);
    assert(s.activeProjectId === "a");
  });

  test("P1T6 normalize：其他壞掉的專案也只丟那一筆", () => {
    const raw = {
      version: 1,
      activeProjectId: "ok",
      projects: [
        rawProject("ok", []),
        null,
        [],
        rawProject("noSteps", "x"),
        rawProject("badTime", [], { createdAt: "1" }),
        { name: "沒有 id", createdAt: 1, steps: [] },
      ],
    };
    assertEqual(normalizeOk(raw).projects.map((p) => p.id), ["ok"]);
  });

  test("P1T6 normalize：名稱超過長度 → 截斷，不丟掉", () => {
    const raw = {
      version: 1,
      activeProjectId: "a",
      projects: [rawProject("a", [rawStep("s1", false, "t".repeat(250))], { name: "n".repeat(150) })],
    };
    const s = normalizeOk(raw);
    assert(s.projects.length === 1);
    assert(s.projects[0].name === "n".repeat(100));
    assert(s.projects[0].steps.length === 1);
    assert(s.projects[0].steps[0].title === "t".repeat(200));
  });
})();

// P1T1: run all registered tests (test cases are added above this line in later steps)
Stairs.tests.run();
