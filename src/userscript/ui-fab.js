  function setFabState(busy) {
    if (!state.fab) return;
    state.fab.textContent = busy ? "…" : "译";
    state.fab.style.opacity = busy ? ".34" : ".78";
  }

  function getFabSize() {
    return 50;
  }

  function getViewportSize() {
    const vw = window.innerWidth || document.documentElement.clientWidth || 390;
    const vh = window.innerHeight || document.documentElement.clientHeight || 844;
    return { vw, vh };
  }

  function getFabHalfHiddenLeft(edge) {
    const size = getFabSize();
    const { vw } = getViewportSize();
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
    const { vw } = getViewportSize();
    const leftGap = p.left;
    const rightGap = vw - p.left - size;
    if (leftGap <= 8) return "left";
    if (rightGap <= 8) return "right";
    return "free";
  }

  function clampFabPosition(left, top) {
    const size = getFabSize();
    const { vw, vh } = getViewportSize();
    const minLeft = 6;
    const minTop = 6 + (window.visualViewport ? Math.max(0, window.visualViewport.offsetTop || 0) : 0);
    const maxLeft = Math.max(minLeft, vw - size - 6);
    const maxTop = Math.max(minTop, vh - size - 6);
    return {
      left: Math.max(minLeft, Math.min(left, maxLeft)),
      top: Math.max(minTop, Math.min(top, maxTop)),
    };
  }

  function toFabStoredPos(pos) {
    const p = clampFabPosition(Number(pos.left || 0), Number(pos.top || 0));
    const size = getFabSize();
    const { vw, vh } = getViewportSize();
    const minTop = 6 + (window.visualViewport ? Math.max(0, window.visualViewport.offsetTop || 0) : 0);
    const xMax = Math.max(1, vw - size - 12);
    const yMax = Math.max(1, vh - size - minTop - 6);
    return {
      x: Number(((p.left - 6) / xMax).toFixed(4)),
      y: Number(((p.top - minTop) / yMax).toFixed(4)),
      edge: getFabEdgeState(p),
    };
  }

  function fromFabStoredPos(stored) {
    if (!stored || typeof stored !== "object") return null;
    if (typeof stored.left === "number" || typeof stored.top === "number") {
      return clampFabPosition(Number(stored.left || 0), Number(stored.top || 0));
    }
    const size = getFabSize();
    const { vw, vh } = getViewportSize();
    const minTop = 6 + (window.visualViewport ? Math.max(0, window.visualViewport.offsetTop || 0) : 0);
    const xMax = Math.max(1, vw - size - 12);
    const yMax = Math.max(1, vh - size - minTop - 6);
    return clampFabPosition(
      6 + xMax * Math.max(0, Math.min(1, Number(stored.x ?? 1))),
      minTop + yMax * Math.max(0, Math.min(1, Number(stored.y ?? 1))),
    );
  }

  function applyFabPosition(pos, options) {
    if (!state.fabHost || !pos) return;
    const opts = options || {};
    const p = clampFabPosition(Number(pos.left || 0), Number(pos.top || 0));
    const edge = getFabEdgeState(p);
    let left = p.left;
    if (!opts.reveal && edge === "left") left = getFabHalfHiddenLeft("left");
    if (!opts.reveal && edge === "right") left = getFabHalfHiddenLeft("right");

    state.fabHost.style.left = left + "px";
    state.fabHost.style.top = p.top + "px";
    state.fabHost.style.right = "auto";
    state.fabHost.style.bottom = "auto";
    state.fabHost.dataset.edgeState = edge;
  }

  async function saveFabPosition(pos) {
    state.fabPos = clampFabPosition(Number(pos.left || 0), Number(pos.top || 0));
    await gmSet(FAB_POS_KEY, toFabStoredPos(state.fabPos));
  }

  function normalizeFabPositionOnViewportChange() {
    if (!state.fabPos) return;
    const next = fromFabStoredPos(toFabStoredPos(state.fabPos));
    const changed = !!next && (next.left !== state.fabPos.left || next.top !== state.fabPos.top);
    if (!next) return;
    state.fabPos = next;
    dockFab();
    if (changed) gmSet(FAB_POS_KEY, toFabStoredPos(next));
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
      : "opacity .18s ease, transform .18s ease, background-color .18s ease";
    state.fab.style.backdropFilter = active ? "blur(6px)" : "blur(10px)";
    state.fab.style.webkitBackdropFilter = active ? "blur(6px)" : "blur(10px)";
    state.fab.style.boxShadow = active
      ? "0 3px 10px rgba(0,0,0,.10),0 1px 3px rgba(0,0,0,.08)"
      : "0 6px 16px rgba(0,0,0,.12),0 2px 6px rgba(0,0,0,.09)";
  }

  function mountUI() {
    if (window.self !== window.top) return;
    if (window.__IMMERSIVE_LITE_UI_MOUNTED__) return;
    if (document.getElementById("iml-ui-root")) return;
    window.__IMMERSIVE_LITE_UI_MOUNTED__ = true;

    const root = document.createElement("div");
    root.id = "iml-ui-root";
    root.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;left:0;top:0;";

    const host = document.createElement("div");
    host.id = "iml-fab-host";
    host.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;left:0;top:0;width:50px;height:50px;";

    const shadow = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    if (shadow !== host) {
      const style = document.createElement("style");
      style.textContent = `
        :host { all: initial; }
        *, *::before, *::after { box-sizing: border-box; }
        button {
          all: initial;
          position: relative;
          display: block;
          width: 50px;
          height: 50px;
          border: none;
          border-radius: 25px;
          background: rgba(88,96,110,.64);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: #fff;
          font: 700 20px/50px -apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;
          text-align: center;
          box-shadow: 0 6px 16px rgba(0,0,0,.12),0 2px 6px rgba(0,0,0,.09);
          touch-action: none;
          user-select: none;
          -webkit-user-select: none;
          pointer-events: auto;
          transition: opacity .18s ease, transform .18s ease, background-color .18s ease;
          will-change: opacity;
          cursor: pointer;
          transform: none;
          letter-spacing: 0;
          margin: 0;
          padding: 0;
          min-width: 0;
          min-height: 0;
        }
      `;
      shadow.appendChild(style);
    }

    const fab = document.createElement("button");
    fab.id = "iml-fab-main";
    fab.textContent = "译";
    if (shadow === host) {
      fab.style.cssText = "all:initial;position:relative;display:block;width:50px;height:50px;border:none;border-radius:25px;background:rgba(88,96,110,.64);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;font:700 20px/50px -apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;text-align:center;box-shadow:0 6px 16px rgba(0,0,0,.12),0 2px 6px rgba(0,0,0,.09);touch-action:none;user-select:none;-webkit-user-select:none;pointer-events:auto;transition:opacity .18s ease, transform .18s ease, background-color .18s ease;will-change:opacity;cursor:pointer;transform:none;letter-spacing:0;margin:0;padding:0;min-width:0;min-height:0;";
    }

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
      originLeft = state.fabPos ? state.fabPos.left : defaultPos.left;
      originTop = state.fabPos ? state.fabPos.top : defaultPos.top;
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
      const next = clampFabPosition(originLeft + dx, originTop + dy);
      state.fabPos = next;
      applyFabPosition(next, { reveal: true });
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
        await saveFabPosition(state.fabPos || defaultPos);
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

    shadow.appendChild(fab);
    root.appendChild(host);
    document.documentElement.appendChild(root);
    state.fabRoot = root;
    state.fabHost = host;
    state.fab = fab;
    state.fabPos = fromFabStoredPos(state.fabPos) || defaultPos;
    applyFabPosition(state.fabPos);
    dockFab();

    window.addEventListener("resize", normalizeFabPositionOnViewportChange, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", normalizeFabPositionOnViewportChange, { passive: true });
      window.visualViewport.addEventListener("scroll", normalizeFabPositionOnViewportChange, { passive: true });
    }
  }
