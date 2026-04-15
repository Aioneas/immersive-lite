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
    let isProcessing = false;
    let timer = null;

    const schedule = () => {
      if (!isProcessing && !timer && queue.length > 0) {
        timer = setTimeout(processQueue, opts.batchInterval);
      }
    };

    const processQueue = async () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (queue.length === 0 || isProcessing) return;
      isProcessing = true;

      let totalLen = 0;
      let endIndex = 0;
      for (const task of queue) {
        const len = task.payload.length || 0;
        if (endIndex >= opts.batchSize || (totalLen + len > opts.batchLength && endIndex > 0)) break;
        totalLen += len;
        endIndex++;
      }
      const tasks = queue.splice(0, endIndex);
      if (!tasks.length) { isProcessing = false; return; }

      try {
        const res = await taskFn(tasks.map((x) => x.payload));
        tasks.forEach((task, i) => task.resolve(String(res[i] || "")));
      } catch (e) {
        tasks.forEach((task) => task.reject(e));
      } finally {
        isProcessing = false;
        if (queue.length > 0) {
          if (queue.length >= opts.batchSize) setTimeout(processQueue, 0);
          else schedule();
        }
      }
    };

    return {
      addTask(payload) {
        return new Promise((resolve, reject) => {
          queue.push({ payload, resolve, reject });
          if (queue.length >= opts.batchSize) processQueue();
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

  function applyTranslation(node, orig, tr) {
    if (!state.originalHTML.has(node)) state.originalHTML.set(node, node.innerHTML);
    if (state.settings.displayMode === "translated") {
      node.innerHTML = `<span style="display:block">${esc(tr || "")}</span>`;
    } else {
      node.innerHTML = `<span style="display:block">${esc(orig || "")}</span><span style="display:block;opacity:.7;color:#555;font-size:.92em">${esc(tr || "")}</span>`;
    }
    node.setAttribute("data-iml-translated", "1");
  }

  async function translatePage(options) {
    const opts = options || {};
    if (state.translating || state.translated) return;
    if (!opts.autoTriggered) state.autoTranslateTriggered = false;
    state.translating = true;
    state.runId += 1;
    const runId = state.runId;
    setFabState(true);

    try {
      const s = norm(state.settings);
      const nodes = pickNodes();
      if (!nodes.length) { setStatus("没找到可翻译文本", true); return; }

      const h = window.innerHeight || 800;
      nodes.sort((a, b) => {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const aIn = ra.bottom > 0 && ra.top < h, bIn = rb.bottom > 0 && rb.top < h;
        if (aIn && !bIn) return -1;
        if (!aIn && bIn) return 1;
        return ra.top - rb.top;
      });

      if (state.batchQueue) state.batchQueue.destroy();
      state.batchQueue = createBatchQueue(translateMany, {
        batchInterval: s.batchInterval,
        batchSize: s.batchSize,
        batchLength: s.batchLength,
      });

      const total = nodes.length;
      let done = 0, failed = 0;
      let cursor = 0;
      setStatus(`翻译中 0/${total}`);

      async function worker() {
        while (true) {
          if (!state.translating || runId !== state.runId) return;
          const idx = cursor++;
          if (idx >= nodes.length) return;
          const node = nodes[idx];
          const orig = (node.innerText || "").trim();
          try {
            const tr = await translateText(orig);
            if (!state.translating || runId !== state.runId) return;
            if (node && node.isConnected) applyTranslation(node, orig, tr);
            done++;
            setStatus(`翻译中 ${done}/${total}`);
          } catch (e) {
            failed++;
            console.error("[immersive-lite] text err", e);
          }
        }
      }

      const workerCount = Math.min(s.concurrency, nodes.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      if (runId !== state.runId) return;
      state.translated = done > 0;
      setStatus(failed > 0 ? `完成 ${done}/${total}，${failed} 段失败` : "");
    } catch (e) {
      setStatus("翻译失败: " + (e?.message || e), true);
    } finally {
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
