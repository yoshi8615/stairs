var Stairs = window.Stairs || {};

// P1T1: drag (view layer) namespace
Stairs.drag = (() => {
  let handlers = null;
  let drag = null; // active drag session

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

  const finish = (commit) => {
    const { handle, row, line, from, slot, stepId } = drag;
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    handle.removeEventListener("pointercancel", onCancel);
    row.classList.remove("dragging");
    document.body.classList.remove("is-dragging");
    line.remove();
    drag = null;

    // slot counts the dragged row itself; convert to moveStep's "index after the move"
    const toIndex = slot > from ? slot - 1 : slot;
    if (commit && toIndex !== from) handlers.onMove(stepId, toIndex);
  };

  const onMove = (e) => update(e.clientY);
  const onUp = () => finish(true);
  const onCancel = () => finish(false);

  // P3T8: pointerdown on a ⋮⋮ handle starts a drag (mouse, touch, pen)
  const onDown = (e) => {
    const handle = e.target.closest("[data-drag-handle]");
    if (!handle || drag || e.button !== 0) return;
    e.preventDefault();

    const row = handle.closest("[data-step-row]");
    const list = row.parentElement;
    const rows = Array.from(list.querySelectorAll("[data-step-row]"));
    const line = document.createElement("div");
    line.className = "drop-line";
    list.append(line);

    drag = {
      handle,
      row,
      line,
      rows,
      stepId: row.dataset.stepId,
      from: rows.indexOf(row),
      doneCount: rows.filter((r) => r.dataset.done === "true").length,
      slot: 0,
    };
    row.classList.add("dragging");
    document.body.classList.add("is-dragging");
    handle.setPointerCapture(e.pointerId);
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onCancel);
    update(e.clientY);
  };

  // P3T8: one delegated listener on the persistent app root
  const init = (handlerObj) => {
    handlers = handlerObj;
    document.getElementById("app").addEventListener("pointerdown", onDown);
  };

  return { init };
})();
