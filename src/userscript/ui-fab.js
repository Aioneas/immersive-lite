  function setFabState(busy) {
    if (!state.fab) return;
    state.fab.textContent = busy ? "…" : "译";
    state.fab.style.opacity = busy ? ".34" : ".78";
  }

  function getFabSize() {
    return 50;
  }

  function getFabHalfHiddenLeft(edge) {
    const size = getFabSize();
    const vw = window.innerWidth || document.documentElement.clientWidth || 390;
    if (edge === "left") return -Math.round(size * 0.4);
    if (edge === "right") return vw - Math.round(size * 0.6);
    return 0;
  }

  function getFabDefaultPosition() {
    return clampFabPosition((window.innerWidth || 390) - 64, (window.innerHeight || 844) - 94);
  }

  function getFabEdgeState(pos) {
    const p = clampFabPosition(Number(pos.left || 0), Number(pos.top || 0));
    const size = getFabSize();
    const vw = window.innerWidth || document.documentElement.clientWidth || 390;
    const leftGap = p.left;
    const rightGap = vw - p.left - size;
    if (leftGap <= 8) return "left";
    if (rightGap <= 8) return "right";
    return "free";
  }

  function clampFabPosition(left, top) {
    const size = getFabSize();
    const vw = window.innerWidth || document.documentElement.clientWidth || 390;
    const vh = window.innerHeight || document.documentElement.clientHeight || 844;
    const minLeft = 6;
    const minTop = 6 + (window.visualViewport ? Math.max(0, window.visualViewport.offsetTop || 0) : 0);
    const maxLeft = Math.max(minLeft, vw - size - 6);
    const maxTop = Math.max(minTop, vh - size - 6);
    return {
      left: Math.max(minLeft, Math.min(left, maxLeft)),
      top: Math.max(minTop, Math.min(top, maxTop)),
    };
  }

  function applyFabPosition(pos, options) {
    if (!state.fab || !pos) return;
    const opts = options || {};
    const p = clampFabPosition(Number(pos.left || 0), Number(pos.top || 0));
    const edge = getFabEdgeState(p);
    let left = p.left;
    if (!opts.reveal && edge === "left") left = getFabHalfHiddenLeft("left");
    if (!opts.reveal && edge === "right") left = getFabHalfHiddenLeft("right");

    state.fab.style.left = left + "px";
    state.fab.style.top = p.top + "px";
    state.fab.style.right = "auto";
    state.fab.style.bottom = "auto";
    state.fab.dataset.edgeState = edge;
  }

  async function saveFabPosition(pos) {
    state.fabPos = clampFabPosition(Number(pos.left || 0), Number(pos.top || 0));
    await gmSet(FAB_POS_KEY, state.fabPos);
  }

  function normalizeFabPositionOnViewportChange() {
    if (!state.fabPos) return;
    const next = clampFabPosition(state.fabPos.left, state.fabPos.top);
    const changed = next.left !== state.fabPos.left || next.top !== state.fabPos.top;
    state.fabPos = next;
    dockFab();
    if (changed) gmSet(FAB_POS_KEY, next);
  }

  function revealFab() {
    if (!state.fab || !state.fabPos) return;
    applyFabPosition(state.fabPos, { reveal: true });
    state.fab.style.opacity = state.translating ? ".42" : ".94";
  }

  function dockFab() {
    if (!state.fab || !state.fabPos) return;
    applyFabPosition(state.fabPos, { reveal: false });
    state.fab.style.opacity = state.translating ? ".26" : ".66";
  }

  function scheduleFabDock(delay) {
    if (!state.fab) return;
    if (state.fabDockTimer) {
      clearTimeout(state.fabDockTimer);
      state.fabDockTimer = 0;
    }
    state.fabDockTimer = setTimeout(() => {
      state.fabDockTimer = 0;
      dockFab();
    }, delay || 1200);
  }

  function setFabDraggingVisual(active) {
    if (!state.fab) return;
    state.fab.style.transition = active
      ? "opacity .12s ease"
      : "opacity .18s ease, transform .18s ease, background-color .18s ease, left .18s ease";
    state.fab.style.backdropFilter = active ? "blur(6px)" : "blur(10px)";
    state.fab.style.webkitBackdropFilter = active ? "blur(6px)" : "blur(10px)";
    state.fab.style.boxShadow = active
      ? "0 3px 10px rgba(0,0,0,.10),0 1px 3px rgba(0,0,0,.08)"
      : "0 6px 16px rgba(0,0,0,.12),0 2px 6px rgba(0,0,0,.09)";
  }

  function mountUI() {
    if (document.getElementById("iml-ui-root")) return;
    const root = document.createElement("div");
    root.id = "iml-ui-root";
    root.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;";

    const fab = document.createElement("button");
    fab.id = "iml-fab-main";
    fab.textContent = "译";
    fab.style.cssText = "position:fixed;width:50px;height:50px;border:none;border-radius:25px;background:rgba(88,96,110,.64);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;font-size:20px;font-weight:700;box-shadow:0 6px 16px rgba(0,0,0,.12),0 2px 6px rgba(0,0,0,.09);touch-action:none;user-select:none;-webkit-user-select:none;pointer-events:auto;transition:opacity .18s ease, transform .18s ease, background-color .18s ease, left .18s ease;will-change:left,top,opacity;";

    let clickTimer = null;
    let suppressClickUntil = 0;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let moved = false;
    let dragging = false;

    const defaultPos = getFabDefaultPosition();

    const onPointerDown = (e) => {
      if (e.button != null && e.button !== 0) return;
      if (state.fabDockTimer) {
        clearTimeout(state.fabDockTimer);
        state.fabDockTimer = 0;
      }
      pointerId = e.pointerId;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      revealFab();
      setFabDraggingVisual(true);
      const rect = fab.getBoundingClientRect();
      originLeft = rect.left;
      originTop = rect.top;
      if (fab.setPointerCapture) {
        try { fab.setPointerCapture(pointerId); } catch {}
      }
      e.stopPropagation();
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      if (pointerId !== null && e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) moved = true;
      if (!moved) return;
      e.preventDefault();
      applyFabPosition({ left: originLeft + dx, top: originTop + dy });
    };

    const onPointerUp = async (e) => {
      if (!dragging) return;
      if (pointerId !== null && e.pointerId !== pointerId) return;
      const wasMoved = moved;
      dragging = false;
      setFabDraggingVisual(false);
      if (fab.releasePointerCapture && pointerId !== null) {
        try { fab.releasePointerCapture(pointerId); } catch {}
      }
      pointerId = null;

      if (wasMoved) {
        const rect = fab.getBoundingClientRect();
        await saveFabPosition({ left: rect.left, top: rect.top });
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        suppressClickUntil = Date.now() + 350;
        moved = false;
        dockFab();
        e.preventDefault();
        return;
      }

      moved = false;
    };

    fab.addEventListener("pointerdown", onPointerDown);
    fab.addEventListener("pointermove", onPointerMove);
    fab.addEventListener("pointerup", onPointerUp);
    fab.addEventListener("pointercancel", onPointerUp);

    fab.addEventListener("click", (e) => {
      if (dragging || moved || Date.now() < suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.stopPropagation();
      revealFab();
      scheduleFabDock(1800);
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; openSettings(); return; }
      clickTimer = setTimeout(async () => { clickTimer = null; await translatePage(); }, 280);
    });

    root.appendChild(fab);
    document.documentElement.appendChild(root);
    state.fab = fab;
    applyFabPosition(state.fabPos || defaultPos);
    dockFab();

    window.addEventListener("resize", normalizeFabPositionOnViewportChange, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", normalizeFabPositionOnViewportChange, { passive: true });
      window.visualViewport.addEventListener("scroll", normalizeFabPositionOnViewportChange, { passive: true });
    }
  }
