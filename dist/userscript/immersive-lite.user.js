// ==UserScript==
// @name         Immersive Lite (Core)
// @namespace    https://github.com/Aioneas/immersive-lite
// @version      0.8.7
// @description  Core-only bilingual page translation with custom OpenAI-compatible API (no login/cloud/pricing).
// @author       Aioneas
// @match        *://*/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM.registerMenuCommand
// @connect      *
// @downloadURL  https://raw.githubusercontent.com/Aioneas/immersive-lite/main/dist/userscript/immersive-lite.user.js
// @updateURL    https://raw.githubusercontent.com/Aioneas/immersive-lite/main/dist/userscript/immersive-lite.user.js
// @run-at       document-end
// ==/UserScript==

(async function () {
  "use strict";

  const KEY = "immersive_lite_v7";
  const CACHE_KEY = "immersive_lite_cache_v1";
  const FAB_POS_KEY = "immersive_lite_fab_pos_v1";
  const MODEL_PRESETS = {
    openai: [
      "gpt-5.4","gpt-5.3","gpt-5.2","gpt-5.1","gpt-5",
      "gpt-5.3-codex","gpt-5.3-codex-spark","gpt-5.2-codex",
      "gpt-5.1-codex-max","gpt-5.1-codex","gpt-5-codex",
      "gpt-5-codex-mini","gpt-5-mini","gpt-5-nano","custom"
    ],
    deepseek: ["deepseek-chat", "deepseek-reasoner", "custom"],
    custom: ["custom"],
  };

  const DEFAULT = {
    provider: "openai",
    apiUrl: "",
    baseUrl: "https://api.openai.com",
    apiInputRaw: "",
    apiKey: "",
    model: "gpt-5.4",
    targetLang: "zh-CN",
    displayMode: "bilingual",
    speedMode: "fast",
    batchInterval: 120,
    batchSize: 8,
    batchLength: 1200,
    concurrency: 12,
    useCache: true,
  };

  const state = {
    translating: false,
    translated: false,
    settings: { ...DEFAULT },
    originalHTML: new WeakMap(),
    fab: null,
    panel: null,
    statusEl: null,
    runId: 0,
    inflight: new Map(),
    batchQueue: null,
    cache: {},
    fabPos: null,
    fabDockTimer: 0,
  };

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function gmGet(k, d) {
    try {
      if (typeof GM !== "undefined" && GM.getValue) return await GM.getValue(k, d);
      if (typeof GM_getValue !== "undefined") return GM_getValue(k, d);
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : d;
    } catch { return d; }
  }
  async function gmSet(k, v) {
    try {
      if (typeof GM !== "undefined" && GM.setValue) return await GM.setValue(k, v);
      if (typeof GM_setValue !== "undefined") return GM_setValue(k, v);
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  }

  async function loadSettingsWithMigration() {
    const current = await gmGet(KEY, null);
    if (current && typeof current === "object") return norm({ ...DEFAULT, ...current });

    const legacyKeys = ["immersive_lite_v9", "immersive_lite_v8", "immersive_lite_v6", "immersive_lite_v3", "immersive_lite_core_settings_v3"];
    for (const legacyKey of legacyKeys) {
      const legacy = await gmGet(legacyKey, null);
      if (legacy && typeof legacy === "object") {
        const migrated = norm({ ...DEFAULT, ...legacy });
        await gmSet(KEY, migrated);
        return migrated;
      }
    }

    return norm(DEFAULT);
  }

  function ensureHttp(url) {
    const s = String(url || "").trim();
    if (!s) return "";
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
  }
  function normalizeApiInput(raw) {
    const input = String(raw || "").trim();
    const v = ensureHttp(input).replace(/\/$/, "");
    if (!v) return { apiUrl: "", baseUrl: "", apiInputRaw: input };
    if (/(\/v\d+)?\/chat\/completions$/i.test(v)) {
      return { apiUrl: v, baseUrl: "", apiInputRaw: input };
    }
    return { apiUrl: "", baseUrl: v, apiInputRaw: input };
  }

  function getApiInputValue(settings) {
    return String(settings.apiInputRaw || settings.apiUrl || settings.baseUrl || "").trim();
  }

  function buildApiUrl(s) {
    const full = ensureHttp(s.apiUrl || "");
    if (full) return full;
    let b = ensureHttp(s.baseUrl || "").replace(/\/$/, "");
    if (b.endsWith("/v1/chat/completions") || b.endsWith("/chat/completions")) return b;
    if (b.endsWith("/v1")) return b + "/chat/completions";
    return b + "/v1/chat/completions";
  }
  function norm(input) {
    const t = { ...input };
    if (t.provider === "deepseek") {
      if (!t.baseUrl) t.baseUrl = "https://api.deepseek.com";
      if (!t.model) t.model = "deepseek-chat";
    } else if (t.provider === "openai") {
      if (!t.baseUrl) t.baseUrl = "https://api.openai.com";
      if (!t.model) t.model = "gpt-5.4";
    }

    if (!t.apiInputRaw) {
      t.apiInputRaw = String(t.apiUrl || t.baseUrl || "").trim();
    }

    const speed = ["balanced", "fast", "aggressive"].includes(t.speedMode) ? t.speedMode : "fast";
    const PRESETS = {
      balanced: { batchInterval: 160, batchSize: 8, batchLength: 1300, concurrency: 10 },
      fast: { batchInterval: 120, batchSize: 8, batchLength: 1200, concurrency: 12 },
      aggressive: { batchInterval: 70, batchSize: 6, batchLength: 900, concurrency: 16 },
    };
    const preset = PRESETS[speed];

    t.speedMode = speed;
    if (!("batchInterval" in t) || t.batchInterval == null || t.batchInterval === "") t.batchInterval = preset.batchInterval;
    if (!("batchSize" in t) || t.batchSize == null || t.batchSize === "") t.batchSize = preset.batchSize;
    if (!("batchLength" in t) || t.batchLength == null || t.batchLength === "") t.batchLength = preset.batchLength;
    if (!("concurrency" in t) || t.concurrency == null || t.concurrency === "") t.concurrency = preset.concurrency;

    t.batchInterval = Math.min(500, Math.max(0, Number(t.batchInterval || preset.batchInterval)));
    t.batchSize = Math.min(20, Math.max(1, Number(t.batchSize || preset.batchSize)));
    t.batchLength = Math.min(4000, Math.max(200, Number(t.batchLength || preset.batchLength)));
    t.concurrency = Math.min(32, Math.max(1, Number(t.concurrency || preset.concurrency)));
    t.displayMode = t.displayMode === "translated" ? "translated" : "bilingual";
    t.useCache = t.useCache !== false;
    return t;
  }

  function setStatus(msg, err) {
    if (!state.statusEl) return;
    state.statusEl.textContent = msg || "";
    state.statusEl.style.color = err ? "#d32f2f" : "#6f7f97";
  }
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

  function hashText(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
  function makeCacheKey(text) {
    const s = norm(state.settings);
    return [s.provider, s.model, s.targetLang, buildApiUrl(s), hashText(text)].join("|");
  }
  function shouldSkipTranslationText(text) {
    return !hasTranslationValue(text);
  }
  function getCache(text) {
    if (!state.settings.useCache) return null;
    return state.cache[makeCacheKey(text)] || null;
  }
  async function putCache(text, translated) {
    if (!state.settings.useCache) return;
    state.cache[makeCacheKey(text)] = translated;
    const keys = Object.keys(state.cache);
    if (keys.length > 1200) {
      for (const k of keys.slice(0, keys.length - 1000)) delete state.cache[k];
    }
    await gmSet(CACHE_KEY, state.cache);
  }

  function isLikelyDateOrTime(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    if (/^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}(日)?$/.test(t)) return true;
    if (/^\d{1,2}[:：]\d{2}([:：]\d{2})?$/.test(t)) return true;
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(t)) return true;
    return false;
  }

  function isMostlyNumeric(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    if (t.length <= 30 && /^[\d\s.,:%$€£¥+\-–—()/年月日:：]+$/.test(t)) return true;
    return false;
  }

  function isLikelyIdentifier(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    if (/^@[A-Za-z0-9_]{1,32}$/.test(t)) return true;
    if (/^[A-Za-z0-9_]{1,20}$/.test(t)) return true;
    if (/^(ID|id)[:#\s-]*[A-Za-z0-9_-]{2,}$/.test(t)) return true;
    return false;
  }

  function hasTranslationValue(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return false;
    if (t.length < 3) return false;
    if (isLikelyDateOrTime(t)) return false;
    if (isMostlyNumeric(t)) return false;
    if (isLikelyIdentifier(t)) return false;
    if (/^[\p{P}\p{S}\s]+$/u.test(t)) return false;
    return true;
  }

  function pickNodes() {
    const sel = "p,li,h1,h2,h3,h4,h5,h6,blockquote,figcaption,summary,td,th,a,span,div,article,section,dd,dt,time";
    const all = Array.from(document.querySelectorAll(sel));
    return all.filter((el) => {
      if (!el || !el.isConnected) return false;
      if (el.closest("#iml-ui-root") || el.closest("#iml-settings-overlay")) return false;
      if (el.getAttribute("data-iml-translated") === "1") return false;
      const tag = el.tagName;
      if (["SCRIPT","STYLE","NOSCRIPT","TEXTAREA","INPUT","BUTTON","SELECT","OPTION","CODE","PRE","SVG"].includes(tag)) return false;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const txt = (el.innerText || "").trim();
      if (!hasTranslationValue(txt)) return false;
      if (txt.length > 2000) return false;
      if (el.childElementCount > 0) {
        const hasBlock = Array.from(el.children).some((c) => {
          const d = getComputedStyle(c).display;
          return d === "block" || d === "flex" || d === "grid";
        });
        if (hasBlock) return false;
      }
      return true;
    });
  }

  async function postJSON(url, headers, body) {
    if (typeof GM !== "undefined" && GM.xmlHttpRequest) {
      return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
          method: "POST",
          url,
          headers,
          data: body,
          onload: (r) => resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, text: r.responseText || "" }),
          onerror: reject,
        });
      });
    }
    if (typeof GM_xmlhttpRequest !== "undefined") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "POST",
          url,
          headers,
          data: body,
          onload: (r) => resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, text: r.responseText || "" }),
          onerror: reject,
        });
      });
    }
    const r = await fetch(url, { method: "POST", headers, body });
    return { ok: r.ok, status: r.status, text: await r.text() };
  }

  function parseResult(data, expected) {
    let c = data?.choices?.[0]?.message?.content;
    if (!c && typeof data?.choices?.[0]?.text === "string") c = data.choices[0].text;
    if (!c && Array.isArray(data?.translations)) return data.translations;
    if (typeof c === "string") {
      try {
        const j = JSON.parse(c);
        const a = j?.t || j?.translations || j?.data || j;
        if (Array.isArray(a)) return a;
      } catch {}
      const m = c.match(/\[[\s\S]*\]/);
      if (m) {
        try {
          const a = JSON.parse(m[0]);
          if (Array.isArray(a)) return a;
        } catch {}
      }
    }
    return new Array(expected).fill("");
  }

  async function translateMany(texts) {
    const s = norm(state.settings);
    const url = buildApiUrl(s);
    if (!url) throw new Error("请先设置 API 地址");
    if (!s.apiKey && s.provider !== "custom") throw new Error("请先设置 API Key");

    const headers = { "Content-Type": "application/json" };
    if (s.apiKey) headers.Authorization = "Bearer " + s.apiKey;

    const payload = {
      model: s.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a translation engine. Return only JSON. Do not explain." },
        { role: "user", content: `Translate to ${s.targetLang}. Return {\"t\":[...]} same length.\n` + JSON.stringify(texts) },
      ],
    };

    const retryOn = (st) => [408,429,500,502,503,504].includes(st);
    for (let attempt = 0; attempt <= 2; attempt++) {
      let res = await postJSON(url, headers, JSON.stringify(payload));
      if (!res.ok && String(res.text || "").includes("response_format")) {
        const p2 = { ...payload }; delete p2.response_format;
        res = await postJSON(url, headers, JSON.stringify(p2));
      }
      if (res.ok) {
        const data = JSON.parse(res.text);
        return parseResult(data, texts.length);
      }
      if (attempt < 2 && retryOn(res.status)) {
        await sleep(180 * (attempt + 1));
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    }
    throw new Error("max retries");
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

  async function translatePage() {
    if (state.translating || state.translated) return;
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

  function getProviderLabel(value) {
    if (value === "openai") return "OpenAI";
    if (value === "deepseek") return "DeepSeek";
    if (value === "custom") return "自定义接口";
    return value || "";
  }

  function buildModelOptions(prov, sel, inp, cur) {
    const list = MODEL_PRESETS[prov] || ["custom"];
    sel.innerHTML = list.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
    if (list.includes(cur)) { sel.value = cur; inp.style.display = "none"; inp.value = ""; }
    else { sel.value = "custom"; inp.style.display = "block"; inp.value = cur || ""; }
  }

  function openSettings() {
    const existed = document.getElementById("iml-settings-overlay");
    if (existed) { existed.style.display = "block"; return; }

    const s = state.settings;
    const root = document.createElement("div");
    root.id = "iml-settings-overlay";
    root.style.cssText = "position:fixed;inset:0;background:rgba(8,15,29,.46);backdrop-filter:blur(2px);z-index:2147483647;padding-top:env(safe-area-inset-top);";

    const panel = document.createElement("div");
    panel.style.cssText = "position:absolute;left:0;right:0;bottom:0;top:calc(env(safe-area-inset-top) + 8px);background:linear-gradient(180deg,#fff 0%,#f8fbff 100%);border-radius:18px 18px 0 0;padding:14px 14px calc(26px + env(safe-area-inset-bottom));overflow:auto;font:14px -apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;box-shadow:0 -12px 30px rgba(0,0,0,.16);";
    panel.innerHTML = `
      <div style="display:flex;justify-content:flex-start;align-items:center;margin-bottom:10px;">
        <div>
          <div style="font-size:16px;font-weight:700;color:#10213a;">Immersive Lite</div>
          <div style="font-size:12px;color:#6f7f97;margin-top:2px;">稳定核心 + 批队列缓存 + 简化速度模式 v0.7</div>
        </div>
      </div>
      <div style="display:grid;gap:10px;">
        <div>
          <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">翻译服务</label>
          <select id="iml-provider" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;">
            <option value="openai">OpenAI</option><option value="deepseek">DeepSeek</option><option value="custom">自定义接口</option>
          </select>
        </div>
        <div>
          <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">接口地址</label>
          <input id="iml-apiinput" placeholder="支持完整地址，或只填基础域名" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
        </div>
        <div>
          <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">API 密钥</label>
          <input id="iml-key" type="password" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
        </div>
        <div>
          <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">模型</label>
          <select id="iml-model-select" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;"></select>
          <input id="iml-model-custom" placeholder="自定义模型名" style="display:none;width:100%;margin-top:6px;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
        </div>
        <div style="display:flex;gap:8px;">
          <div style="flex:1;">
            <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">目标语言</label>
            <input id="iml-lang" placeholder="zh-CN" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
          </div>
          <div style="flex:1;">
            <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">显示模式</label>
            <select id="iml-display" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;">
              <option value="bilingual">双语对照</option><option value="translated">仅译文</option>
            </select>
          </div>
        </div>
        <div>
          <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">速度模式</label>
          <select id="iml-speed" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;">
            <option value="balanced">稳定</option>
            <option value="fast">推荐</option>
            <option value="aggressive">极速</option>
          </select>
        </div>
        <div style="font-size:12px;color:#6f7f97;line-height:1.5;padding:10px 12px;background:#f4f8ff;border-radius:10px;">
          稳定：更稳、更省；推荐：默认，适合大多数页面；极速：更快看到结果。悬浮球支持拖动、记忆位置与靠边半隐藏。
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;">
        <button id="iml-save" style="padding:11px;border:none;border-radius:11px;background:linear-gradient(135deg,#1677ff,#4f9bff);color:#fff;font-weight:600;">保存</button>
        <button id="iml-retranslate" style="padding:11px;border:none;border-radius:11px;background:#eef3fb;color:#334b73;">重新翻译</button>
        <button id="iml-restore" style="padding:11px;border:none;border-radius:11px;background:#eef3fb;color:#334b73;">恢复原文</button>
        <button id="iml-close2" style="padding:11px;border:none;border-radius:11px;background:#eef3fb;color:#334b73;">关闭</button>
      </div>
      <div id="iml-status" style="color:#6f7f97;font-size:12px;margin-top:10px;line-height:1.5;"></div>
    `;
    root.appendChild(panel);
    document.documentElement.appendChild(root);

    const $ = (id) => panel.querySelector("#" + id);
    const provider=$("iml-provider"), apiinput=$("iml-apiinput"), key=$("iml-key");
    const modelSelect=$("iml-model-select"), modelCustom=$("iml-model-custom");
    const lang=$("iml-lang"), display=$("iml-display"), speed=$("iml-speed");
    const status=$("iml-status");

    state.statusEl = status; state.panel = root;
    provider.value=s.provider||"openai"; apiinput.value=getApiInputValue(s);
    key.value=s.apiKey||""; lang.value=s.targetLang||"zh-CN"; display.value=s.displayMode||"bilingual"; speed.value=s.speedMode||"fast";
    buildModelOptions(provider.value, modelSelect, modelCustom, s.model||"");

    provider.addEventListener("change", () => {
      if (!apiinput.value.trim()) {
        if (provider.value === "openai") apiinput.value = "https://api.openai.com";
        if (provider.value === "deepseek") apiinput.value = "https://api.deepseek.com";
      }
      buildModelOptions(provider.value, modelSelect, modelCustom, "");
    });
    modelSelect.addEventListener("change", () => { modelCustom.style.display = modelSelect.value === "custom" ? "block" : "none"; });

    function closePanel() { root.style.display = "none"; }
    $("iml-close2").addEventListener("click", closePanel);
    root.addEventListener("click", (e) => { if (e.target === root) closePanel(); });

    $("iml-save").addEventListener("click", async () => {
      const model = modelSelect.value === "custom" ? modelCustom.value.trim() : modelSelect.value;
      if (!model) { setStatus("模型不能为空", true); return; }
      const apiParsed = normalizeApiInput(apiinput.value.trim());
      state.settings = norm({
        ...state.settings,
        provider: provider.value,
        apiUrl: apiParsed.apiUrl,
        baseUrl: apiParsed.baseUrl,
        apiInputRaw: apiParsed.apiInputRaw,
        apiKey: key.value.trim(),
        model,
        targetLang: lang.value.trim() || "zh-CN",
        displayMode: display.value,
        speedMode: speed.value,
      });
      await gmSet(KEY, state.settings);
      setStatus("设置已保存");
    });
    $("iml-restore").addEventListener("click", () => restorePage());
    $("iml-retranslate").addEventListener("click", async () => { restorePage(); await translatePage(); });
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

  state.settings = await loadSettingsWithMigration();
  state.cache = (await gmGet(CACHE_KEY, {})) || {};
  state.fabPos = await gmGet(FAB_POS_KEY, null);
  mountUI();

  if (typeof GM_registerMenuCommand !== "undefined") {
    GM_registerMenuCommand("Immersive Lite: 整页翻译", translatePage);
    GM_registerMenuCommand("Immersive Lite: 打开设置", openSettings);
    GM_registerMenuCommand("Immersive Lite: 恢复原文", restorePage);
  }
})();
