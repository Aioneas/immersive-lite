// ==UserScript==
// @name         Immersive Lite (Core)
// @namespace    https://github.com/Aioneas/immersive-lite
// @version      0.5.0
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

  const KEY = "immersive_lite_core_settings_v3";
  const MODEL_PRESETS = {
    openai: [
      "gpt-5.4",
      "gpt-5.3",
      "gpt-5.2",
      "gpt-5.1",
      "gpt-5",
      "gpt-5.3-codex",
      "gpt-5.3-codex-spark",
      "gpt-5.2-codex",
      "gpt-5.1-codex-max",
      "gpt-5.1-codex",
      "gpt-5-codex",
      "gpt-5-codex-mini",
      "gpt-5-mini",
      "gpt-5-nano",
      "custom"
    ],
    deepseek: ["deepseek-chat", "deepseek-reasoner", "custom"],
    custom: ["custom"],
  };

  const DEFAULT = {
    provider: "openai",
    apiUrl: "",
    baseUrl: "https://api.openai.com",
    apiKey: "",
    model: "gpt-5.4",
    targetLang: "zh-CN",
    displayMode: "bilingual", // bilingual | translated
    batchSize: 120,
    maxRetries: 2,
    concurrency: 24,
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
    lastStatusAt: 0,
    liveTimer: 0,
    finishTimer: 0,
    liveBound: false,
    liveObserver: null,
    lastScrollY: 0,
    scrollDir: 1,
    pending: [],
    pendingSet: new Set(),
    activeWorkers: 0,
    workerTarget: 0,
    doneCount: 0,
    totalCount: 0,
    failedBatches: 0,
    lastActivityAt: 0,
    kickWorkers: null,
    nodeKeyMap: new WeakMap(),
    nodeSeq: 0,
    onScroll: null,
    onResize: null,
  };

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function getValue(key, def) {
    try {
      if (typeof GM !== "undefined" && GM.getValue) return await GM.getValue(key, def);
      if (typeof GM_getValue !== "undefined") return GM_getValue(key, def);
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : def;
    } catch {
      return def;
    }
  }

  async function setValue(key, val) {
    try {
      if (typeof GM !== "undefined" && GM.setValue) return await GM.setValue(key, val);
      if (typeof GM_setValue !== "undefined") return GM_setValue(key, val);
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }

  function ensureHttp(url) {
    const s = String(url || "").trim();
    if (!s) return "";
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
  }

  function normalizeByPreset(input) {
    const t = { ...input };

    if (t.provider === "deepseek") {
      if (!t.baseUrl) t.baseUrl = "https://api.deepseek.com";
      if (!t.model) t.model = "deepseek-chat";
    } else if (t.provider === "openai") {
      if (!t.baseUrl) t.baseUrl = "https://api.openai.com";
      if (!t.model) t.model = "gpt-5.4";
    }

    t.batchSize = Math.min(200, Math.max(1, Number(t.batchSize || 120)));
    t.maxRetries = Math.min(4, Math.max(0, Number(t.maxRetries || 2)));
    t.concurrency = Math.min(32, Math.max(1, Number(t.concurrency || 24)));
    t.displayMode = t.displayMode === "translated" ? "translated" : "bilingual";
    return t;
  }

  function buildApiUrl(settings) {
    const full = ensureHttp(settings.apiUrl || "");
    if (full) return full;
    let b = ensureHttp(settings.baseUrl || "").replace(/\/$/, "");
    if (b.endsWith("/v1/chat/completions") || b.endsWith("/chat/completions")) return b;
    if (b.endsWith("/v1")) return b + "/chat/completions";
    return b + "/v1/chat/completions";
  }

  function setStatus(msg, error = false) {
    if (!state.statusEl) return;
    state.statusEl.textContent = msg || "";
    state.statusEl.style.color = error ? "#d32f2f" : "#666";
  }

  function setFabBusy(busy) {
    if (!state.fab) return;
    state.fab.textContent = busy ? "…" : "译";
    state.fab.style.opacity = busy ? ".7" : "1";
  }

  function pickNodes() {
    const selectors = "p,li,h1,h2,h3,h4,h5,h6,blockquote,figcaption,summary,td,th,a,span,div";
    const all = Array.from(document.querySelectorAll(selectors));
    return all.filter((el) => {
      if (!el || !el.isConnected) return false;
      if (el.closest("#iml-ui-root") || el.closest("#iml-settings-overlay")) return false;
      const tag = el.tagName;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "BUTTON", "SELECT", "OPTION", "CODE", "PRE"].includes(tag)) return false;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const txt = (el.innerText || "").trim();
      if (txt.length < 10 || txt.length > 1600) return false;
      if (el.childElementCount > 0) {
        const hasBlockChild = Array.from(el.children).some((c) => {
          const d = getComputedStyle(c).display;
          return d === "block" || d === "flex" || d === "grid";
        });
        if (hasBlockChild) return false;
      }
      return true;
    });
  }

  function splitByViewport(nodes) {
    const h = window.innerHeight || document.documentElement.clientHeight || 800;
    const viewport = [];
    const nonViewport = [];
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      const inView = rect.bottom > 0 && rect.top < h;
      if (inView) viewport.push(node);
      else nonViewport.push(node);
    }
    nonViewport.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const ay = Math.abs(ra.top) + Math.abs(ra.height * 0.2);
      const by = Math.abs(rb.top) + Math.abs(rb.height * 0.2);
      return ay - by;
    });
    return { viewport, nonViewport };
  }

  function buildGroups(nodes, batchSize) {
    const groups = [];
    for (let i = 0; i < nodes.length; i += batchSize) {
      const subNodes = nodes.slice(i, i + batchSize);
      groups.push({
        subNodes,
        subTexts: subNodes.map((n) => (n.innerText || "").trim()),
      });
    }
    return groups;
  }

  function shouldStatusUpdate() {
    const now = Date.now();
    if (now - state.lastStatusAt < 450) return false;
    state.lastStatusAt = now;
    return true;
  }

  async function postJSON(url, headers, body) {
    if (typeof GM !== "undefined" && GM.xmlHttpRequest) {
      return await new Promise((resolve, reject) => {
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
      return await new Promise((resolve, reject) => {
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

  function parseTranslationsFromModel(data, expected) {
    let content = data?.choices?.[0]?.message?.content;
    if (!content && typeof data?.choices?.[0]?.text === "string") content = data.choices[0].text;
    if (!content && Array.isArray(data?.translations)) return data.translations;

    if (typeof content === "string") {
      try {
        const j = JSON.parse(content);
        const arr = j?.translations || j?.data || j;
        if (Array.isArray(arr)) return arr;
      } catch {}
      const m = content.match(/\[[\s\S]*\]/);
      if (m) {
        try {
          const arr = JSON.parse(m[0]);
          if (Array.isArray(arr)) return arr;
        } catch {}
      }
    }

    return new Array(expected).fill("");
  }

  async function translateBatch(texts) {
    const s = normalizeByPreset(state.settings);
    const url = buildApiUrl(s);
    if (!url) throw new Error("请先设置 API 地址");
    if (!s.apiKey && s.provider !== "custom") throw new Error("请先设置 API Key");

    const headers = { "Content-Type": "application/json" };
    if (s.apiKey) headers.Authorization = "Bearer " + s.apiKey;
    if (s.provider === "custom") {
      headers["HTTP-Referer"] = "https://github.com/Aioneas/immersive-lite";
      headers["X-Title"] = "Immersive Lite";
    }

    const payload = {
      model: s.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a translation engine. Translate naturally and accurately." },
        {
          role: "user",
          content:
            "Translate the following text array to target language. Return JSON: {\\\"translations\\\":[...]} with same length.\\n" +
            "TARGET_LANGUAGE: " + s.targetLang + "\\n" +
            "INPUT_JSON: " + JSON.stringify(texts),
        },
      ],
    };

    const shouldRetry = (status) => [408, 409, 425, 429, 500, 502, 503, 504].includes(status);

    let lastErr = null;
    for (let attempt = 0; attempt <= s.maxRetries; attempt++) {
      let res = await postJSON(url, headers, JSON.stringify(payload));

      if (!res.ok && String(res.text || "").includes("response_format")) {
        const p2 = { ...payload };
        delete p2.response_format;
        res = await postJSON(url, headers, JSON.stringify(p2));
      }

      if (res.ok) {
        let data;
        try {
          data = JSON.parse(res.text);
        } catch {
          throw new Error("返回不是有效 JSON");
        }
        return parseTranslationsFromModel(data, texts.length);
      }

      lastErr = new Error(`HTTP ${res.status} ${String(res.text || "").slice(0, 160)}`);
      if (attempt < s.maxRetries && shouldRetry(res.status)) {
        await sleep(260 * (attempt + 1));
        continue;
      }
      throw lastErr;
    }
    throw lastErr || new Error("未知错误");
  }

  function applyTranslation(node, orig, tr) {
    if (!state.originalHTML.has(node)) state.originalHTML.set(node, node.innerHTML);
    if (state.settings.displayMode === "translated") {
      node.innerHTML = `<span style=\"display:block;opacity:.95\">${esc(tr || "")}</span>`;
    } else {
      node.innerHTML = `<span style=\"display:block;opacity:.95\">${esc(orig || "")}</span><span style=\"display:block;opacity:.72;color:#555;font-size:.92em\">${esc(tr || "")}</span>`;
    }
    node.setAttribute("data-iml-translated", "1");
  }

  function makeNodeKey(node) {
    if (!node || !node.isConnected) return "";
    let key = state.nodeKeyMap.get(node);
    if (!key) {
      state.nodeSeq += 1;
      key = `${node.tagName}-${state.nodeSeq}`;
      state.nodeKeyMap.set(node, key);
    }
    return key;
  }

  function queueNode(node, toFront = false) {
    const key = makeNodeKey(node);
    if (!key) return false;
    if (state.pendingSet.has(key)) return false;
    if (node.getAttribute("data-iml-translated") === "1") return false;
    state.pendingSet.add(key);
    if (toFront) state.pending.unshift({ key, node });
    else state.pending.push({ key, node });
    return true;
  }

  function drainCandidateNodes(prioritizeViewport = false) {
    if (prioritizeViewport) {
      return queueViewportFirst();
    }

    const nodes = pickNodes();
    if (!nodes.length) return 0;

    let added = 0;
    for (const n of nodes) if (queueNode(n, false)) added += 1;
    state.totalCount += added;
    return added;
  }

  function popQueueBatch(batchSize) {
    const picked = [];
    while (picked.length < batchSize && state.pending.length > 0) {
      const item = state.pending.shift();
      if (!item || !item.node || !item.node.isConnected) continue;
      const txt = (item.node.innerText || "").trim();
      if (!txt) continue;
      if (item.node.getAttribute("data-iml-translated") === "1") continue;
      state.pendingSet.delete(item.key);
      picked.push({ node: item.node, text: txt });
    }
    return picked;
  }

  function refreshScrollDirection() {
    const y = window.scrollY || window.pageYOffset || 0;
    const delta = y - state.lastScrollY;
    if (Math.abs(delta) > 2) state.scrollDir = delta > 0 ? 1 : -1;
    state.lastScrollY = y;
  }

  function queueViewportFirst() {
    const nodes = pickNodes();
    if (!nodes.length) return 0;
    const h = window.innerHeight || document.documentElement.clientHeight || 800;
    const leadTop = state.scrollDir >= 0 ? -Math.round(h * 0.1) : -Math.round(h * 0.7);
    const leadBottom = state.scrollDir >= 0 ? Math.round(h * 1.35) : Math.round(h * 1.05);

    const lead = [];
    const rest = [];
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      if (r.bottom > leadTop && r.top < leadBottom) lead.push(n);
      else rest.push(n);
    }

    lead.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return state.scrollDir >= 0 ? ra.top - rb.top : rb.top - ra.top;
    });

    let added = 0;
    for (const n of lead) if (queueNode(n, true)) added += 1;
    for (const n of rest) if (queueNode(n, false)) added += 1;
    state.totalCount += added;
    return added;
  }

  function updateLiveStatus() {
    if (!shouldStatusUpdate()) return;
    const done = state.doneCount;
    const total = Math.max(state.totalCount, done);
    if (state.activeWorkers > 0 || state.pending.length > 0) {
      setStatus(`流式翻译中 ${done}/${total}`);
    } else if (state.failedBatches > 0) {
      setStatus(`已完成 ${done}/${total}，${state.failedBatches} 批失败`, true);
    } else {
      setStatus("");
    }
  }

  function bindLiveFeed(runId) {
    if (state.liveBound) return;
    state.liveBound = true;

    state.onScroll = () => {
      if (!state.translating || runId !== state.runId) return;
      refreshScrollDirection();
      const added = queueViewportFirst();
      if (added > 0) {
        state.lastActivityAt = Date.now();
        if (typeof state.kickWorkers === "function") state.kickWorkers();
      }
      updateLiveStatus();
      if (state.liveTimer) return;
      state.liveTimer = setTimeout(() => {
        state.liveTimer = 0;
        if (!state.translating || runId !== state.runId) return;
        const n = queueViewportFirst();
        if (n > 0) {
          state.lastActivityAt = Date.now();
          if (typeof state.kickWorkers === "function") state.kickWorkers();
        }
      }, 120);
    };

    state.onResize = () => {
      if (!state.translating || runId !== state.runId) return;
      const n = queueViewportFirst();
      if (n > 0) {
        state.lastActivityAt = Date.now();
        if (typeof state.kickWorkers === "function") state.kickWorkers();
      }
    };

    window.addEventListener("scroll", state.onScroll, { passive: true });
    window.addEventListener("resize", state.onResize);

    if (typeof MutationObserver !== "undefined") {
      state.liveObserver = new MutationObserver(() => {
        if (!state.translating || runId !== state.runId) return;
        const n = queueViewportFirst();
        if (n > 0) {
          state.lastActivityAt = Date.now();
          if (typeof state.kickWorkers === "function") state.kickWorkers();
        }
      });
      state.liveObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  function unbindLiveFeed() {
    if (!state.liveBound) return;
    state.liveBound = false;
    if (state.onScroll) window.removeEventListener("scroll", state.onScroll);
    if (state.onResize) window.removeEventListener("resize", state.onResize);
    state.onScroll = null;
    state.onResize = null;
    if (state.liveObserver) {
      state.liveObserver.disconnect();
      state.liveObserver = null;
    }
    if (state.liveTimer) {
      clearTimeout(state.liveTimer);
      state.liveTimer = 0;
    }
    if (state.finishTimer) {
      clearTimeout(state.finishTimer);
      state.finishTimer = 0;
    }
  }

  async function translatePage() {
    if (state.translating || state.translated) return;
    state.translating = true;
    state.runId += 1;
    state.lastStatusAt = 0;
    const runId = state.runId;
    setFabBusy(true);
    setStatus("翻译中...");

    state.pending = [];
    state.pendingSet = new Set();
    state.nodeKeyMap = new WeakMap();
    state.nodeSeq = 0;
    state.activeWorkers = 0;
    state.workerTarget = 0;
    state.doneCount = 0;
    state.totalCount = 0;
    state.failedBatches = 0;
    state.lastActivityAt = Date.now();
    state.kickWorkers = null;
    state.lastScrollY = window.scrollY || window.pageYOffset || 0;
    state.scrollDir = 1;

    const batchSize = Math.max(1, Number(state.settings.batchSize || 120));
    const maxConcurrency = Math.max(1, Number(state.settings.concurrency || 24));

    function ensureWorkers() {
      while (state.activeWorkers < state.workerTarget && state.translating && runId === state.runId) {
        worker();
      }
    }

    state.kickWorkers = ensureWorkers;

    function finalizeIfIdle() {
      if (!state.translating || runId !== state.runId) return;
      const idleFor = Date.now() - state.lastActivityAt;
      const noWork = state.pending.length === 0 && state.activeWorkers === 0;

      if (!noWork || idleFor < 850) {
        if (state.finishTimer) clearTimeout(state.finishTimer);
        state.finishTimer = setTimeout(finalizeIfIdle, 220);
        return;
      }

      state.translated = state.doneCount > 0;
      state.translating = false;
      state.workerTarget = 0;
      state.kickWorkers = null;
      setFabBusy(false);
      updateLiveStatus();
      if (state.finishTimer) {
        clearTimeout(state.finishTimer);
        state.finishTimer = 0;
      }
      unbindLiveFeed();
    }

    async function worker() {
      state.activeWorkers += 1;
      try {
        while (state.translating && runId === state.runId) {
          if (state.pending.length === 0) {
            const added = queueViewportFirst();
            if (added > 0) state.lastActivityAt = Date.now();
            if (added === 0) {
              await sleep(60);
              if (state.pending.length === 0) break;
            }
          }

          const batchItems = popQueueBatch(batchSize);
          if (!batchItems.length) {
            await sleep(30);
            continue;
          }

          try {
            const translated = await translateBatch(batchItems.map((i) => i.text));
            if (!state.translating || runId !== state.runId) return;
            for (let i = 0; i < batchItems.length; i++) {
              const it = batchItems[i];
              if (!it.node || !it.node.isConnected) continue;
              applyTranslation(it.node, it.text || "", translated[i] || "");
              state.doneCount += 1;
            }
            state.lastActivityAt = Date.now();
            updateLiveStatus();
          } catch (e) {
            state.failedBatches += 1;
            state.lastActivityAt = Date.now();
            console.error("[immersive-lite] batch failed", e);
            updateLiveStatus();
          }

          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        }
      } finally {
        state.activeWorkers -= 1;
        ensureWorkers();
        finalizeIfIdle();
      }
    }

    try {
      const added = drainCandidateNodes(true);
      if (!added) {
        setStatus("没找到可翻译文本", true);
        state.translating = false;
        setFabBusy(false);
        return;
      }

      bindLiveFeed(runId);
      updateLiveStatus();

      state.workerTarget = Math.min(maxConcurrency, Math.max(4, Math.ceil(maxConcurrency * 0.75)));
      ensureWorkers();
      finalizeIfIdle();
    } catch (e) {
      setStatus("翻译失败: " + (e?.message || e), true);
      console.error("[immersive-lite] translate failed", e);
      state.translating = false;
      state.workerTarget = 0;
      state.kickWorkers = null;
      setFabBusy(false);
      unbindLiveFeed();
    }
  }

  function restorePage() {
    state.runId += 1;
    state.translating = false;
    unbindLiveFeed();
    state.pending = [];
    state.pendingSet = new Set();
    state.nodeKeyMap = new WeakMap();
    state.nodeSeq = 0;
    state.activeWorkers = 0;
    state.workerTarget = 0;
    state.doneCount = 0;
    state.totalCount = 0;
    state.failedBatches = 0;
    state.kickWorkers = null;

    const nodes = Array.from(document.querySelectorAll("[data-iml-translated='1']"));
    for (const n of nodes) {
      const html = state.originalHTML.get(n);
      if (typeof html === "string") n.innerHTML = html;
      n.removeAttribute("data-iml-translated");
    }
    state.translated = false;
    setFabBusy(false);
    setStatus("已恢复原文");
  }

  function buildModelOptions(provider, selectEl, customInput, currentModel) {
    const list = MODEL_PRESETS[provider] || ["custom"];
    selectEl.innerHTML = list.map((m) => `<option value=\"${esc(m)}\">${esc(m)}</option>`).join("");

    if (list.includes(currentModel)) {
      selectEl.value = currentModel;
      customInput.style.display = "none";
      customInput.value = "";
    } else {
      selectEl.value = "custom";
      customInput.style.display = "block";
      customInput.value = currentModel || "";
    }
  }

  function openSettings() {
    const existed = document.getElementById("iml-settings-overlay");
    if (existed) {
      existed.style.display = "block";
      return;
    }

    const s = state.settings;
    const root = document.createElement("div");
    root.id = "iml-settings-overlay";
    root.style.cssText = "position:fixed;inset:0;background:rgba(8,15,29,.46);backdrop-filter:blur(2px);z-index:2147483647;";

    const panel = document.createElement("div");
    panel.style.cssText = "position:absolute;left:0;right:0;bottom:0;background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%);border-radius:18px 18px 0 0;padding:14px 14px 26px;max-height:88vh;overflow:auto;font:14px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;box-shadow:0 -12px 30px rgba(0,0,0,.16);";
    panel.innerHTML = `
      <div style="display:flex;justify-content:flex-start;align-items:center;margin-bottom:10px;">
        <div>
          <div style="font-size:16px;font-weight:700;color:#10213a;">Immersive Lite</div>
          <div style="font-size:12px;color:#6f7f97;margin-top:2px;">轻量流式网页翻译</div>
        </div>
      </div>

      <div style="display:grid;gap:10px;">
        <div>
          <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">Provider</label>
          <select id="iml-provider" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;">
            <option value="openai">openai</option>
            <option value="deepseek">deepseek</option>
            <option value="custom">custom</option>
          </select>
        </div>

        <div>
          <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">API 完整地址（优先）</label>
          <input id="iml-apiurl" placeholder="https://xxx/v1/chat/completions" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
        </div>

        <div>
          <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">Base URL（自动拼接）</label>
          <input id="iml-base" placeholder="https://api.openai.com" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
        </div>

        <div>
          <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">API Key</label>
          <input id="iml-key" type="password" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
        </div>

        <div>
          <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">Model</label>
          <select id="iml-model-select" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;"></select>
          <input id="iml-model-custom" placeholder="自定义模型名" style="display:none;width:100%;margin-top:6px;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
        </div>

        <div style="display:flex;gap:8px;">
          <div style="flex:1;">
            <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">目标语言</label>
            <input id="iml-lang" placeholder="zh-CN / en / ja" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
          </div>
          <div style="flex:1;">
            <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">显示模式</label>
            <select id="iml-display" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;">
              <option value="bilingual">双语对照</option>
              <option value="translated">仅译文</option>
            </select>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <div>
            <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">批次默认</label>
            <input id="iml-batch" type="number" min="1" max="200" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
          </div>
          <div>
            <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">并发</label>
            <input id="iml-concurrency" type="number" min="1" max="32" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
          </div>
          <div>
            <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">重试次数</label>
            <input id="iml-retries" type="number" min="0" max="4" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
          </div>
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

    const provider = panel.querySelector("#iml-provider");
    const apiurl = panel.querySelector("#iml-apiurl");
    const base = panel.querySelector("#iml-base");
    const key = panel.querySelector("#iml-key");
    const modelSelect = panel.querySelector("#iml-model-select");
    const modelCustom = panel.querySelector("#iml-model-custom");
    const lang = panel.querySelector("#iml-lang");
    const display = panel.querySelector("#iml-display");
    const batch = panel.querySelector("#iml-batch");
    const concurrency = panel.querySelector("#iml-concurrency");
    const retries = panel.querySelector("#iml-retries");
    const status = panel.querySelector("#iml-status");

    state.statusEl = status;
    state.panel = root;

    provider.value = s.provider || "openai";
    apiurl.value = s.apiUrl || "";
    base.value = s.baseUrl || "";
    key.value = s.apiKey || "";
    lang.value = s.targetLang || "zh-CN";
    display.value = s.displayMode || "bilingual";
    batch.value = String(s.batchSize || 120);
    concurrency.value = String(s.concurrency || 24);
    retries.value = String(s.maxRetries || 2);
    buildModelOptions(provider.value, modelSelect, modelCustom, s.model || "");

    provider.addEventListener("change", () => {
      if (provider.value === "openai" && !base.value) base.value = "https://api.openai.com";
      if (provider.value === "deepseek" && !base.value) base.value = "https://api.deepseek.com";
      buildModelOptions(provider.value, modelSelect, modelCustom, "");
    });

    modelSelect.addEventListener("change", () => {
      modelCustom.style.display = modelSelect.value === "custom" ? "block" : "none";
    });

    function closePanel() {
      root.style.display = "none";
    }

    panel.querySelector("#iml-close2").addEventListener("click", closePanel);

    root.addEventListener("click", (e) => {
      if (e.target === root) closePanel();
    });

    panel.querySelector("#iml-save").addEventListener("click", async () => {
      const model = modelSelect.value === "custom" ? modelCustom.value.trim() : modelSelect.value;
      if (!model) {
        setStatus("模型不能为空", true);
        return;
      }

      state.settings = normalizeByPreset({
        ...state.settings,
        provider: provider.value,
        apiUrl: apiurl.value.trim(),
        baseUrl: base.value.trim(),
        apiKey: key.value.trim(),
        model,
        targetLang: lang.value.trim() || "zh-CN",
        displayMode: display.value,
        batchSize: Number(batch.value || 120),
        concurrency: Number(concurrency.value || 24),
        maxRetries: Number(retries.value || 2),
      });

      await setValue(KEY, state.settings);
      setStatus("设置已保存");
    });

    panel.querySelector("#iml-restore").addEventListener("click", () => {
      restorePage();
      setStatus("已恢复原文");
    });

    panel.querySelector("#iml-retranslate").addEventListener("click", async () => {
      restorePage();
      await translatePage();
    });
  }

  function mountUI() {
    if (document.getElementById("iml-ui-root")) return;

    const root = document.createElement("div");
    root.id = "iml-ui-root";
    root.style.cssText = "position:fixed;right:14px;bottom:22px;z-index:2147483646;";

    const fab = document.createElement("button");
    fab.id = "iml-fab-main";
    fab.textContent = "译";
    fab.style.cssText = "width:50px;height:50px;border:none;border-radius:25px;background:linear-gradient(135deg,#1677ff 0%,#4b9eff 100%);color:#fff;font-size:20px;font-weight:700;box-shadow:0 10px 24px rgba(22,119,255,.35),0 4px 10px rgba(0,0,0,.18);backdrop-filter:blur(4px);";

    fab.addEventListener("click", async (e) => {
      e.stopPropagation();
      await translatePage();
    });

    fab.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      openSettings();
    });

    root.appendChild(fab);
    document.documentElement.appendChild(root);
    state.fab = fab;
  }

  state.settings = normalizeByPreset(await getValue(KEY, DEFAULT));
  mountUI();

  if (typeof GM_registerMenuCommand !== "undefined") {
    GM_registerMenuCommand("Immersive Lite: 整页翻译", translatePage);
    GM_registerMenuCommand("Immersive Lite: 打开设置", openSettings);
    GM_registerMenuCommand("Immersive Lite: 恢复原文", restorePage);
  }
})();
