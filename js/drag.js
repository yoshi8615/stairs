var Stairs = window.Stairs || {};

// P1T1: drag (view layer) namespace
Stairs.drag = (() => {
  let handlers = null;
  let press = null; // pointer is down on a row but no drag yet (P7T3)
  let drag = null; // active drag session

  // P7T3: how a press turns into a drag (SPEC v1.6 F2, ARCHITECTURE A11)
  const MOUSE_SLOP = 5;
  const TOUCH_SLOP = 10;
  const HOLD_MS = 400;
  // pressing on these keeps their own behaviour and never starts a drag
  const NO_DRAG = "input, button, label, a, textarea, select";

  // P3T8: drop slot = insertion point before rows[slot] (0..n), clamped to the not-done block (A4)
  const update = (clientY) => {
    const { rows, doneCount, line } = drag;
    let slot = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) {
        slot = i;
        break;
      }
    }
    slot = Math.max(slot, doneCount);
    drag.slot = slot;

    // line sits in the gap above rows[slot], or below the last row
    const gap = 3;
    const lastRow = rows[rows.length - 1];
    const top = slot < rows.length ? rows[slot].offsetTop - gap : lastRow.offsetTop + lastRow.offsetHeight + gap;
    line.style.top = `${top}px`;
  };

  const stopListening = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  };

  const cancelPress = () => {
    if (!press) return;
    clearTimeout(press.timer);
    press.row.classList.remove("pressing");
    press = null;
    stopListening();
  };

  // P7T3: the press became a drag; P3T8 session setup
  const begin = (clientY) => {
    const { row, pointerId, mouse } = press;
    clearTimeout(press.timer);
    row.classList.remove("pressing");
    press = null;
    if (!row.isConnected) return stopListening(); // a re-render replaced the row meanwhile

    const list = row.parentElement;
    const rows = Array.from(list.querySelectorAll("[data-step-row]"));
    const line = document.createElement("div");
    line.className = "drop-line";
    list.append(line);

    drag = {
      row,
      line,
      rows,
      stepId: row.dataset.stepId,
      from: rows.indexOf(row),
      doneCount: rows.filter((r) => r.dataset.done === "true").length,
      slot: 0,
    };
    // touch gets a "picked up" look so the user knows the hold worked
    row.classList.add("dragging");
    if (!mouse) row.classList.add("lifted");
    document.body.classList.add("is-dragging");
    try {
      row.setPointerCapture(pointerId);
    } catch (e) {
      // pointer already gone; the window listeners still end the drag
    }
    update(clientY);
  };

  const finish = (commit) => {
    const { row, line, from, slot, stepId } = drag;
    stopListening();
    row.classList.remove("dragging", "lifted");
    document.body.classList.remove("is-dragging");
    line.remove();
    drag = null;

    // slot counts the dragged row itself; convert to moveStep's "index after the move"
    const toIndex = slot > from ? slot - 1 : slot;
    if (commit && toIndex !== from) handlers.onMove(stepId, toIndex);
  };

  const onMove = (e) => {
    if (drag) return update(e.clientY);
    if (!press || e.pointerId !== press.pointerId) return;
    const dist = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (press.mouse) {
      if (dist > MOUSE_SLOP) begin(e.clientY);
    } else if (dist > TOUCH_SLOP) {
      cancelPress(); // finger moved before the hold finished: this is a scroll
    }
  };
  const onUp = () => (drag ? finish(true) : cancelPress());
  const onCancel = () => (drag ? finish(false) : cancelPress());

  // P7T3: pointerdown anywhere on a not-done row (no handle) arms a drag
  const onDown = (e) => {
    if (drag || press) return;
    const mouse = e.pointerType === "mouse";
    if (mouse && e.button !== 0) return;
    const row = e.target.closest("[data-step-row]");
    if (!row || row.dataset.done === "true" || e.target.closest(NO_DRAG)) return;

    press = { row, pointerId: e.pointerId, x: e.clientX, y: e.clientY, mouse, timer: 0 };
    if (!mouse) {
      row.classList.add("pressing");
      press.timer = setTimeout(() => {
        if (press) begin(press.y);
      }, HOLD_MS);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  // P7T3: rows allow vertical panning (touch-action: pan-y) so a plain swipe scrolls. Once a
  // drag is live this listener cancels touchmove to stop that scroll; it is registered up front
  // because some browsers only honour non-passive listeners present at touchstart.
  const onTouchMove = (e) => {
    if (drag) e.preventDefault();
  };

  // P7T3: long-press must not open the browser's text / link menu
  const onContextMenu = (e) => {
    if (press || drag) e.preventDefault();
  };

  // P3T8: one delegated listener on the persistent app root
  const init = (handlerObj) => {
    handlers = handlerObj;
    const root = document.getElementById("app");
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("contextmenu", onContextMenu);
  };

  return { init };
})();
