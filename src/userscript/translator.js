  async function maybeAutoTranslateOnLoad() {
    if (state.autoTranslateTriggered || state.translating || state.translated) return false;

    const s = norm(state.settings);
    if (!s.autoTranslateEnglish) return false;

    const targetLang = s.targetLang || "";
    if (!targetLang || isSameLanguage(targetLang, "en")) return false;

    const sample = pickPageLanguageSample();
    if (sample.length < 200) return false;

    const pageLang = detectPagePrimaryLanguage(sample);
    if (pageLang !== "en") return false;
    if (isSameLanguage(pageLang, targetLang)) return false;

    const nodes = pickNodes();
    if (nodes.length < 3) return false;

    state.autoTranslateTriggered = true;
    setStatus("检测到英文页面，已自动翻译");
    await translatePage({ autoTriggered: true });
    return true;
  }

  async function translateText(text) {
    if (shouldSkipTranslationText(text)) return text;

    const cached = getCache(text);
    if (cached) return cached;

    const key = makeCacheKey(text);
    if (state.inflight.has(key)) return await state.inflight.get(key);

    const p = (async () => {
      if (state.batchQueue) {
        const res = await state.batchQueue.addTask(text);
        await putCache(text, res || "");
        return res || "";
      }
      const arr = await translateMany([text]);
      const tr = String(arr[0] || "");
      await putCache(text, tr);
      return tr;
    })();

    state.inflight.set(key, p);
    try {
      return await p;
    } finally {
      state.inflight.delete(key);
    }
  }

  function createBatchQueue(taskFn, opts) {
    const queue = [];
    let activeCount = 0;
    let timer = null;

    const config = {
      batchInterval: Math.max(0, Number(opts?.batchInterval || 0)),
      batchSize: Math.max(1, Number(opts?.batchSize || 1)),
      batchLength: Math.max(1, Number(opts?.batchLength || 1)),
      immediateFirstRun: opts?.immediateFirstRun === true,
      parallelRequests: Math.max(1, Number(opts?.parallelRequests || 1)),
    };
    let firstDispatchPending = config.immediateFirstRun;

    const pickTasks = () => {
      let totalLen = 0;
      let endIndex = 0;
      for (const task of queue) {
        const len = task.payload.length || 0;
        if (endIndex >= config.batchSize || (totalLen + len > config.batchLength && endIndex > 0)) break;
        totalLen += len;
        endIndex++;
      }
      return queue.splice(0, endIndex);
    };

    const schedule = () => {
      if (timer || queue.length === 0 || activeCount >= config.parallelRequests) return;
      if (firstDispatchPending) {
        firstDispatchPending = false;
        timer = setTimeout(drainQueue, 0);
        return;
      }
      timer = setTimeout(drainQueue, config.batchInterval);
    };

    const processOneBatch = async () => {
      if (queue.length === 0 || activeCount >= config.parallelRequests) return;
      const tasks = pickTasks();
      if (!tasks.length) return;
      activeCount++;
      try {
        const res = await taskFn(tasks.map((x) => x.payload));
        tasks.forEach((task, i) => task.resolve(String(res[i] || "")));
      } catch (e) {
        tasks.forEach((task) => task.reject(e));
      } finally {
        activeCount--;
        if (queue.length > 0) schedule();
        if (queue.length > 0 && activeCount < config.parallelRequests) setTimeout(drainQueue, 0);
      }
    };

    const drainQueue = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (queue.length === 0) return;
      while (activeCount < config.parallelRequests && queue.length > 0) {
        void processOneBatch();
      }
      if (queue.length > 0) schedule();
    };

    return {
      addTask(payload) {
        return new Promise((resolve, reject) => {
          queue.push({ payload, resolve, reject });
          if (queue.length >= config.batchSize) drainQueue();
          else schedule();
        });
      },
      destroy() {
        if (timer) clearTimeout(timer);
        while (queue.length) {
          const t = queue.shift();
          t.reject(new Error("queue destroyed"));
        }
      },
    };
  }

  function renderTranslatedContent(node, orig, tr) {
    if (!state.originalHTML.has(node)) state.originalHTML.set(node, node.innerHTML);
    if (state.settings.displayMode === "translated") {
      node.innerHTML = `<span style="display:block">${esc(tr || "")}</span>`;
    } else {
      node.innerHTML = `<span style="display:block">${esc(orig || "")}</span><span style="display:block;opacity:.7;color:#555;font-size:.92em">${esc(tr || "")}</span>`;
    }
    node.setAttribute("data-iml-translated", "1");
  }

  function flushRenderQueueChunk() {
    state.renderScheduled = false;
    const runId = state.runId;
    let remaining = 8;
    while (remaining > 0 && state.renderQueue.length > 0) {
      const item = state.renderQueue.shift();
      if (!item || item.runId !== runId) continue;
      if (!item.node || !item.node.isConnected) continue;
      renderTranslatedContent(item.node, item.orig, item.tr);
      if (typeof item.afterRender === "function") item.afterRender();
      remaining--;
    }
    if (state.renderQueue.length > 0) scheduleRenderQueue();
  }

  function scheduleRenderQueue() {
    if (state.renderScheduled) return;
    state.renderScheduled = true;
    const cb = flushRenderQueueChunk;
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(cb);
    else setTimeout(cb, 16);
  }

  function enqueueTranslationRender(item) {
    state.renderQueue.push(item);
    scheduleRenderQueue();
  }

  function clearRenderQueue() {
    state.renderQueue.length = 0;
    state.renderScheduled = false;
  }

  function splitNodesByCache(nodes) {
    const cached = [];
    const pending = [];
    for (const node of nodes) {
      const orig = (node.innerText || "").trim();
      if (!orig || shouldSkipTranslationText(orig)) continue;
      const tr = getCache(orig);
      if (typeof tr === "string" && tr) cached.push({ node, orig, tr });
      else pending.push(node);
    }
    return { cached, pending };
  }

  function splitTranslationBuckets(nodes) {
    const foreground = [];
    const near = [];
    const far = [];
    for (const node of nodes) {
      const p = getNearViewportPriority(node);
      if (p.phase === 0) foreground.push(node);
      else if (p.phase === 1) near.push(node);
      else far.push(node);
    }
    const sorter = (a, b) => {
      const pa = getNearViewportPriority(a), pb = getNearViewportPriority(b);
      if (pa.phase !== pb.phase) return pa.phase - pb.phase;
      return pa.distance - pb.distance;
    };
    foreground.sort(sorter);
    near.sort(sorter);
    far.sort(sorter);
    return { foreground, near, far };
  }


  function createPhaseQueueConfig(base, phase) {
    const s = base || norm(state.settings);
    if (phase === "foreground") {
      return tuneQueueConfig({
        batchInterval: 0,
        batchSize: Math.min(4, Math.max(1, s.batchSize)),
        batchLength: Math.min(600, Math.max(240, s.batchLength)),
        immediateFirstRun: true,
        concurrency: s.concurrency,
        parallelRequests: 1,
      }, "foreground");
    }
    if (phase === "near") {
      const cfg = tuneQueueConfig({
        batchInterval: Math.max(20, Math.min(80, s.batchInterval)),
        batchSize: Math.min(6, Math.max(2, s.batchSize)),
        batchLength: Math.min(900, Math.max(300, s.batchLength)),
        immediateFirstRun: false,
        concurrency: s.concurrency,
        parallelRequests: Math.min(2, s.concurrency),
      }, "near");
      if (state.adaptiveProfile === "slow") cfg.batchLength = Math.min(cfg.batchLength || 900, 720);
      return cfg;
    }
    const cfg = tuneQueueConfig({
      batchInterval: s.batchInterval,
      batchSize: s.batchSize,
      batchLength: s.batchLength,
      immediateFirstRun: false,
      concurrency: s.concurrency,
      parallelRequests: Math.min(3, s.concurrency),
    }, "far");
    if (state.adaptiveProfile === "slow") cfg.batchLength = Math.min(cfg.batchLength || 1200, 760);
    return cfg;
  }

  function getPhaseWorkerCount(settings, phaseName, nodeCount) {
    const s = norm(settings || state.settings);
    if (phaseName === "foreground") return Math.min(4, s.concurrency, nodeCount);
    return Math.min(s.concurrency, nodeCount);
  }

  function waitForRenderQueueDrained(runId) {
    return new Promise((resolve) => {
      let guard = 0;
      const check = () => {
        if (runId !== state.runId) return resolve();
        if (!state.renderQueue.some((item) => item && item.runId === runId)) return resolve();
        guard++;
        if (guard > 600) return resolve();
        setTimeout(check, 16);
      };
      check();
    });
  }

  async function runTranslationPhase(nodes, runId, totalState, phaseName) {
    if (!nodes.length) return;
    const s = norm(state.settings);
    const phaseConfig = createPhaseQueueConfig(s, phaseName);
    if (state.batchQueue) state.batchQueue.destroy();
    state.batchQueue = createBatchQueue(translateMany, phaseConfig);

    let cursor = 0;
    const workerCount = getPhaseWorkerCount({ ...s, concurrency: phaseConfig.concurrency || s.concurrency }, phaseName, nodes.length);

    async function worker() {
      while (true) {
        if (!state.translating || runId !== state.runId) return;
        const idx = cursor++;
        if (idx >= nodes.length) return;
        const node = nodes[idx];
        const orig = (node.innerText || "").trim();
        try {
          const startedAt = Date.now();
          const tr = await translateText(orig);
          recordAdaptiveSample({ ms: Date.now() - startedAt, count: 1, chars: orig.length, ok: true });
          if (!state.translating || runId !== state.runId) return;
          enqueueTranslationRender({
            runId,
            node,
            orig,
            tr,
            afterRender() {
              totalState.done++;
              state.lastProgressAt = Date.now();
              setStatus(`翻译中 ${totalState.done}/${totalState.total}`);
            },
          });
        } catch (e) {
          recordAdaptiveSample({ ms: 2800, count: 1, chars: orig.length, ok: false });
          totalState.failed++;
          console.error("[immersive-lite] text err", phaseName, e);
        }
      }
    }

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    await waitForRenderQueueDrained(runId);
  }

  async function handleTranslateRequest(options) {
    if (state.translating) return;
    if (state.translated) {
      restorePage();
      await translatePage({ ...(options || {}), forceRetranslate: true });
      return;
    }
    await translatePage(options || {});
  }

  async function translatePage(options) {
    const opts = options || {};
    if (state.translating) return;
    if (state.translated && !opts.forceRetranslate) return;
    if (!opts.autoTriggered) state.autoTranslateTriggered = false;
    state.translating = true;
    state.runId += 1;
    const runId = state.runId;
    clearRenderQueue();
    setFabState(true);

    try {
      const nodes = pickNodes();
      if (!nodes.length) { setStatus("没找到可翻译文本", true); return; }

      const { foreground, near, far } = splitTranslationBuckets(nodes);
      const totalState = { total: nodes.length, done: 0, failed: 0 };
      state.lastProgressAt = Date.now();
      startProgressHeartbeat(runId, totalState);
      setStatus(`翻译中 0/${totalState.total}（${state.adaptiveProfile || getAdaptiveProfileName()}）`);

      const cachedForeground = splitNodesByCache(foreground);
      const cachedNear = splitNodesByCache(near);
      const cachedFar = splitNodesByCache(far);
      const cachedEntries = cachedForeground.cached.concat(cachedNear.cached.slice(0, 8));
      for (const item of cachedEntries) {
        enqueueTranslationRender({
          runId,
          node: item.node,
          orig: item.orig,
          tr: item.tr,
          afterRender() {
            totalState.done++;
            setStatus(`翻译中 ${totalState.done}/${totalState.total}`);
          },
        });
      }
      await waitForRenderQueueDrained(runId);
      if (!state.translating || runId !== state.runId) return;

      await runTranslationPhase(cachedForeground.pending, runId, totalState, "foreground");
      if (!state.translating || runId !== state.runId) return;
      await runTranslationPhase(cachedNear.pending, runId, totalState, "near");
      if (!state.translating || runId !== state.runId) return;
      await runTranslationPhase(cachedFar.pending, runId, totalState, "far");
      if (runId !== state.runId) return;

      state.translated = totalState.done > 0;
      setStatus(totalState.failed > 0 ? `完成 ${totalState.done}/${totalState.total}，${totalState.failed} 段失败` : "");
    } catch (e) {
      setStatus("翻译失败: " + (e?.message || e), true);
    } finally {
      stopProgressHeartbeat();
      if (state.batchQueue) { state.batchQueue.destroy(); state.batchQueue = null; }
      if (runId === state.runId) {
        state.translating = false;
        setFabState(false);
      }
    }
  }

  function restorePage() {
    state.runId += 1;
    state.translating = false;
    state.autoTranslateTriggered = false;
    stopProgressHeartbeat();
    clearRenderQueue();
    if (state.batchQueue) { state.batchQueue.destroy(); state.batchQueue = null; }
    const nodes = Array.from(document.querySelectorAll("[data-iml-translated='1']"));
    for (const n of nodes) {
      const html = state.originalHTML.get(n);
      if (typeof html === "string") n.innerHTML = html;
      n.removeAttribute("data-iml-translated");
    }
    state.translated = false;
    setFabState(false);
    setStatus("已恢复原文");
  }
