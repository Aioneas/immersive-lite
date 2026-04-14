// ==UserScript==
// @name         Immersive Lite (Core)
// @namespace    https://github.com/Aioneas/immersive-lite
// @version      0.4.0
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
    customHeadersText: "",
    batchSize: 40,
    maxRetries: 1,
    concurrency: 8,
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

  function parseHeadersFromText(text) {
    if (!text || !String(text).trim()) return {};
    try {
      const obj = JSON.parse(text);
      return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
    } catch {
      return null;
    }
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

    t.batchSize = Math.min(120, Math.max(1, Number(t.batchSize || 40)));
    t.maxRetries = Math.min(3, Math.max(0, Number(t.maxRetries || 1)));
    t.concurrency = Math.min(12, Math.max(1, Number(t.concurrency || 8)));
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

    const parsedHeaders = parseHeadersFromText(s.customHeadersText || "");
    if (parsedHeaders === null) throw new Error("自定义请求头 JSON 格式错误");
    Object.assign(headers, parsedHeaders);

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
        await sleep(380 * (attempt + 1));
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

  async function translatePage() {
    if (state.translating || state.translated) return;
    state.translating = true;
    state.runId += 1;
    state.lastStatusAt = 0;
    const runId = state.runId;
    setFabBusy(true);
    setStatus("翻译中...");

    try {
      const nodes = pickNodes();
      if (!nodes.length) {
        setStatus("没找到可翻译文本", true);
        return;
      }

      const batchSize = Math.max(1, Number(state.settings.batchSize || 40));
      const maxConcurrencySetting = Math.max(1, Number(state.settings.concurrency || 8));
      const { viewport, nonViewport } = splitByViewport(nodes);

      const urgentGroups = buildGroups(viewport, batchSize);
      const backgroundGroups = buildGroups(nonViewport, batchSize);

      const total = nodes.length;
      let done = 0;
      let failedBatches = 0;

      const updateProgress = (phase) => {
        if (!shouldStatusUpdate()) return;
        if (phase === "viewport") {
          setStatus(`可见区域优先翻译中 ${done}/${total}`);
        } else {
          setStatus(`后台补全中 ${done}/${total}`);
        }
      };

      async function runQueue(groups, phase) {
        if (!groups.length) return;
        const cursor = { i: 0 };
        const workerCount = Math.min(maxConcurrencySetting, groups.length);

        async function worker() {
          while (true) {
            if (!state.translating || runId !== state.runId) return;
            const idx = cursor.i++;
            if (idx >= groups.length) return;

            const g = groups[idx];
            try {
              const translated = await translateBatch(g.subTexts);
              if (!state.translating || runId !== state.runId) return;
              for (let j = 0; j < g.subNodes.length; j++) {
                const node = g.subNodes[j];
                if (!node || !node.isConnected) continue;
                applyTranslation(node, g.subTexts[j] || "", translated[j] || "");
                done += 1;
              }
              updateProgress(phase);
            } catch (e) {
              failedBatches += 1;
              console.error("[immersive-lite] batch failed", e);
            }
          }
        }

        await Promise.all(Array.from({ length: workerCount }, () => worker()));
      }

      await runQueue(urgentGroups, "viewport");
      if (!state.translating || runId !== state.runId) return;

      if (backgroundGroups.length > 0) {
        if (viewport.length > 0) setStatus("可见区域已完成，后台继续补全...");
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        await runQueue(backgroundGroups, "background");
      }

      if (!state.translating || runId !== state.runId) return;

      state.translated = done > 0;
      if (failedBatches > 0) {
        setStatus(`已完成 ${done}/${total}，${failedBatches} 批失败`, true);
      } else {
        setStatus(state.translated ? "" : "无可翻译内容");
      }
    } catch (e) {
      setStatus("翻译失败: " + (e?.message || e), true);
      console.error("[immersive-lite] translate failed", e);
    } finally {
      if (runId === state.runId) {
        state.translating = false;
        setFabBusy(false);
      }
    }
  }

  function restorePage() {
    state.runId += 1;
    state.translating = false;
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
    root.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:2147483647;";

    const panel = document.createElement("div");
    panel.style.cssText = "position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:16px 16px 0 0;padding:14px 14px 24px;max-height:86vh;overflow:auto;font:14px -apple-system;";
    panel.innerHTML = `
      <div style="display:flex;justify-content:flex-start;align-items:center;margin-bottom:8px">
        <b>Immersive Lite 设置</b>
      </div>

      <label>Provider</label>
      <select id="iml-provider" style="width:100%;margin:4px 0 8px;padding:8px">
        <option value="openai">openai</option>
        <option value="deepseek">deepseek</option>
        <option value="custom">custom</option>
      </select>

      <label>API 完整地址（优先）</label>
      <input id="iml-apiurl" placeholder="https://xxx/v1/chat/completions" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />

      <label>Base URL（自动拼接）</label>
      <input id="iml-base" placeholder="https://api.openai.com" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />

      <label>API Key</label>
      <input id="iml-key" type="password" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />

      <label>Model</label>
      <select id="iml-model-select" style="width:100%;margin:4px 0 8px;padding:8px"></select>
      <input id="iml-model-custom" placeholder="自定义模型名" style="display:none;width:100%;margin:-2px 0 8px;padding:8px;box-sizing:border-box" />

      <label>目标语言 (如 zh-CN / en / ja)</label>
      <input id="iml-lang" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />

      <label>显示模式</label>
      <select id="iml-display" style="width:100%;margin:4px 0 8px;padding:8px">
        <option value="bilingual">双语对照</option>
        <option value="translated">仅译文</option>
      </select>

      <div style="display:flex;gap:8px;">
        <div style="flex:1;">
          <label>批次默认</label>
          <input id="iml-batch" type="number" min="1" max="120" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />
        </div>
        <div style="flex:1;">
          <label>并发</label>
          <input id="iml-concurrency" type="number" min="1" max="12" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />
        </div>
      </div>

      <label>重试次数</label>
      <input id="iml-retries" type="number" min="0" max="3" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />

      <label>自定义请求头 JSON（可选）</label>
      <textarea id="iml-headers" rows="3" placeholder='{"X-Title":"My App"}' style="width:100%;margin:4px 0 12px;padding:8px;box-sizing:border-box"></textarea>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button id="iml-save" style="padding:10px;border:none;border-radius:10px;background:#1677ff;color:#fff">保存</button>
        <button id="iml-restore" style="padding:10px;border:none;border-radius:10px;background:#f3f3f3">恢复原文</button>
        <button id="iml-retranslate" style="padding:10px;border:none;border-radius:10px;background:#f3f3f3">重新翻译</button>
        <button id="iml-close2" style="padding:10px;border:none;border-radius:10px;background:#f3f3f3">关闭</button>
      </div>

      <div id="iml-status" style="color:#666;font-size:12px;margin-top:10px;line-height:1.4;"></div>
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
    const headers = panel.querySelector("#iml-headers");
    const status = panel.querySelector("#iml-status");

    state.statusEl = status;
    state.panel = root;

    provider.value = s.provider || "openai";
    apiurl.value = s.apiUrl || "";
    base.value = s.baseUrl || "";
    key.value = s.apiKey || "";
    lang.value = s.targetLang || "zh-CN";
    display.value = s.displayMode || "bilingual";
    batch.value = String(s.batchSize || 40);
    concurrency.value = String(s.concurrency || 8);
    retries.value = String(s.maxRetries || 1);
    headers.value = s.customHeadersText || "";
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
      const testHeaders = parseHeadersFromText(headers.value.trim());
      if (testHeaders === null) {
        setStatus("自定义请求头 JSON 格式错误", true);
        return;
      }

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
        batchSize: Number(batch.value || 40),
        concurrency: Number(concurrency.value || 8),
        maxRetries: Number(retries.value || 1),
        customHeadersText: headers.value.trim(),
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
    fab.style.cssText = "width:46px;height:46px;border:none;border-radius:23px;background:#1677ff;color:#fff;font-size:20px;box-shadow:0 4px 16px rgba(0,0,0,.24);";

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
