// ==UserScript==
// @name         Immersive Lite (Core)
// @namespace    https://github.com/Aioneas/immersive-lite
// @version      0.2.1
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

  const KEY = "immersive_lite_core_settings_v2";
  const DEFAULT = {
    provider: "openai", // openai | openrouter | deepseek | custom
    apiUrl: "", // full endpoint URL, highest priority
    baseUrl: "https://api.openai.com",
    apiKey: "",
    model: "gpt-4o-mini",
    targetLang: navigator.language || "zh-CN",
    fallbackService: "none",
    customHeadersText: "",
    batchSize: 8,
    maxRetries: 2,
  };

  const state = {
    translating: false,
    translated: false,
    settings: { ...DEFAULT },
    originalHTML: new WeakMap(),
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

  function normalizeByPreset(s) {
    const t = { ...s };

    if (t.provider === "openrouter") {
      if (!t.baseUrl) t.baseUrl = "https://openrouter.ai/api";
      if (!t.model) t.model = "openai/gpt-4o-mini";
    } else if (t.provider === "deepseek") {
      if (!t.baseUrl) t.baseUrl = "https://api.deepseek.com";
      if (!t.model) t.model = "deepseek-chat";
    } else if (t.provider === "openai") {
      if (!t.baseUrl) t.baseUrl = "https://api.openai.com";
      if (!t.model) t.model = "gpt-4o-mini";
    }

    t.batchSize = Math.min(20, Math.max(1, Number(t.batchSize || 8)));
    t.maxRetries = Math.min(5, Math.max(0, Number(t.maxRetries || 2)));
    return t;
  }

  function buildApiUrl(settings) {
    // 1) full custom endpoint first
    const full = ensureHttp(settings.apiUrl || "");
    if (full) return full;

    // 2) build from baseUrl
    let b = ensureHttp(settings.baseUrl || "");
    b = b.replace(/\/$/, "");
    if (b.endsWith("/v1/chat/completions")) return b;
    if (b.endsWith("/chat/completions")) return b;
    if (b.endsWith("/v1")) return b + "/chat/completions";
    return b + "/v1/chat/completions";
  }

  function toast(msg, ms = 2000) {
    let el = document.getElementById("iml-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "iml-toast";
      el.style.cssText = "position:fixed;left:50%;bottom:100px;transform:translateX(-50%);z-index:2147483647;background:rgba(0,0,0,.78);color:#fff;padding:8px 12px;border-radius:10px;font:13px -apple-system;max-width:82vw;text-align:center;";
      document.documentElement.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.style.display = "none"), ms);
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
      if (txt.length < 18 || txt.length > 1200) return false;
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
    // 1) standard chat completion
    let content = data?.choices?.[0]?.message?.content;

    // 2) text completion-like
    if (!content && typeof data?.choices?.[0]?.text === "string") {
      content = data.choices[0].text;
    }

    // 3) direct object
    if (!content && Array.isArray(data?.translations)) {
      return data.translations;
    }

    // 4) parse content
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

    if (s.provider === "openrouter") {
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

      // fallback when response_format unsupported
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

      lastErr = new Error(`HTTP ${res.status} ${String(res.text || "").slice(0, 120)}`);
      if (attempt < s.maxRetries && shouldRetry(res.status)) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw lastErr;
    }
    throw lastErr || new Error("未知错误");
  }

  async function translatePage() {
    if (state.translating) return;
    state.translating = true;
    try {
      const nodes = pickNodes();
      if (!nodes.length) {
        toast("没找到可翻译文本");
        return;
      }

      const texts = nodes.map((n) => (n.innerText || "").trim());
      const batchSize = Math.max(1, Number(state.settings.batchSize || 8));
      let done = 0;

      for (let i = 0; i < texts.length; i += batchSize) {
        const subTexts = texts.slice(i, i + batchSize);
        const subNodes = nodes.slice(i, i + batchSize);
        const translated = await translateBatch(subTexts);

        for (let j = 0; j < subNodes.length; j++) {
          const node = subNodes[j];
          const orig = subTexts[j] || "";
          const tr = translated[j] || "";
          if (!state.originalHTML.has(node)) state.originalHTML.set(node, node.innerHTML);
          node.innerHTML = `<span style=\"display:block;opacity:.95\">${esc(orig)}</span><span style=\"display:block;opacity:.72;color:#555;font-size:.92em\">${esc(tr)}</span>`;
          node.setAttribute("data-iml-translated", "1");
          done += 1;
        }
        toast(`翻译中 ${done}/${texts.length}` , 700);
      }

      state.translated = true;
      toast("翻译完成");
    } catch (e) {
      toast("翻译失败: " + (e?.message || e), 3200);
    } finally {
      state.translating = false;
    }
  }

  function restorePage() {
    const nodes = Array.from(document.querySelectorAll("[data-iml-translated='1']"));
    for (const n of nodes) {
      const html = state.originalHTML.get(n);
      if (typeof html === "string") n.innerHTML = html;
      n.removeAttribute("data-iml-translated");
    }
    state.translated = false;
    toast("已恢复原文");
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
    panel.style.cssText = "position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:16px 16px 0 0;padding:14px 14px 24px;max-height:85vh;overflow:auto;font:14px -apple-system;";
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <b>Immersive Lite 设置</b>
        <button id="iml-close" style="border:none;background:#eee;border-radius:8px;padding:4px 8px">关闭</button>
      </div>

      <label>Provider</label>
      <select id="iml-provider" style="width:100%;margin:4px 0 8px;padding:8px">
        <option value="openai">openai</option>
        <option value="openrouter">openrouter</option>
        <option value="deepseek">deepseek</option>
        <option value="custom">custom</option>
      </select>

      <label>API 完整地址（可选，优先）</label>
      <input id="iml-apiurl" placeholder="https://xxx/v1/chat/completions" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />

      <label>Base URL（自动拼接）</label>
      <input id="iml-base" placeholder="https://api.openai.com" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />

      <label>API Key</label>
      <input id="iml-key" type="password" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />

      <label>Model</label>
      <input id="iml-model" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />

      <label>目标语言 (如 zh-CN / en / ja)</label>
      <input id="iml-lang" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />

      <div style="display:flex;gap:8px;">
        <div style="flex:1;">
          <label>每批段落数</label>
          <input id="iml-batch" type="number" min="1" max="20" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />
        </div>
        <div style="flex:1;">
          <label>重试次数</label>
          <input id="iml-retries" type="number" min="0" max="5" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />
        </div>
      </div>

      <label>自定义请求头 JSON（可选）</label>
      <textarea id="iml-headers" rows="3" placeholder='{"X-Title":"My App"}' style="width:100%;margin:4px 0 12px;padding:8px;box-sizing:border-box"></textarea>

      <button id="iml-save" style="width:100%;padding:10px;border:none;border-radius:10px;background:#1677ff;color:#fff">保存</button>
      <div style="color:#666;font-size:12px;margin-top:8px;line-height:1.4;">
        提示：如果你填了“API 完整地址”，会优先用它，不再拼接 /v1/chat/completions。
      </div>
    `;

    root.appendChild(panel);
    document.documentElement.appendChild(root);

    const provider = panel.querySelector("#iml-provider");
    const apiurl = panel.querySelector("#iml-apiurl");
    const base = panel.querySelector("#iml-base");
    const key = panel.querySelector("#iml-key");
    const model = panel.querySelector("#iml-model");
    const lang = panel.querySelector("#iml-lang");
    const batch = panel.querySelector("#iml-batch");
    const retries = panel.querySelector("#iml-retries");
    const headers = panel.querySelector("#iml-headers");

    provider.value = s.provider || "openai";
    apiurl.value = s.apiUrl || "";
    base.value = s.baseUrl || "";
    key.value = s.apiKey || "";
    model.value = s.model || "";
    lang.value = s.targetLang || "zh-CN";
    batch.value = String(s.batchSize || 8);
    retries.value = String(s.maxRetries || 2);
    headers.value = s.customHeadersText || "";

    provider.addEventListener("change", () => {
      const p = provider.value;
      if (p === "openai") {
        if (!base.value) base.value = "https://api.openai.com";
        if (!model.value) model.value = "gpt-4o-mini";
      }
      if (p === "openrouter") {
        if (!base.value) base.value = "https://openrouter.ai/api";
        if (!model.value) model.value = "openai/gpt-4o-mini";
      }
      if (p === "deepseek") {
        if (!base.value) base.value = "https://api.deepseek.com";
        if (!model.value) model.value = "deepseek-chat";
      }
    });

    panel.querySelector("#iml-close").addEventListener("click", () => (root.style.display = "none"));
    root.addEventListener("click", (e) => {
      if (e.target === root) root.style.display = "none";
    });

    panel.querySelector("#iml-save").addEventListener("click", async () => {
      const testHeaders = parseHeadersFromText(headers.value.trim());
      if (testHeaders === null) {
        toast("自定义请求头 JSON 格式错误");
        return;
      }

      state.settings = normalizeByPreset({
        ...state.settings,
        provider: provider.value,
        apiUrl: apiurl.value.trim(),
        baseUrl: base.value.trim(),
        apiKey: key.value.trim(),
        model: model.value.trim(),
        targetLang: lang.value.trim() || "zh-CN",
        batchSize: Number(batch.value || 8),
        maxRetries: Number(retries.value || 2),
        customHeadersText: headers.value.trim(),
      });

      await setValue(KEY, state.settings);
      toast("设置已保存");
      root.style.display = "none";
    });
  }

  function mountUI() {
    if (document.getElementById("iml-ui-root")) return;

    const root = document.createElement("div");
    root.id = "iml-ui-root";
    root.style.cssText = "position:fixed;right:14px;bottom:22px;z-index:2147483646;";

    const menu = document.createElement("div");
    menu.id = "iml-quick-menu";
    menu.style.cssText = "display:none;position:absolute;right:0;bottom:52px;background:#fff;border-radius:12px;box-shadow:0 6px 22px rgba(0,0,0,.22);padding:6px;min-width:94px;";

    const mTranslate = document.createElement("button");
    mTranslate.textContent = state.translated ? "恢复" : "翻译";
    mTranslate.style.cssText = "display:block;width:100%;border:none;background:#f5f5f5;border-radius:8px;padding:8px 10px;margin-bottom:6px;font-size:13px;";
    mTranslate.addEventListener("click", () => {
      menu.style.display = "none";
      if (state.translated) {
        restorePage();
      } else {
        translatePage().then(() => {
          mTranslate.textContent = state.translated ? "恢复" : "翻译";
        });
      }
    });

    const mSettings = document.createElement("button");
    mSettings.textContent = "设置";
    mSettings.style.cssText = "display:block;width:100%;border:none;background:#f5f5f5;border-radius:8px;padding:8px 10px;font-size:13px;";
    mSettings.addEventListener("click", () => {
      menu.style.display = "none";
      openSettings();
    });

    menu.appendChild(mTranslate);
    menu.appendChild(mSettings);

    const fab = document.createElement("button");
    fab.id = "iml-fab-main";
    fab.textContent = "译";
    fab.style.cssText = "width:44px;height:44px;border:none;border-radius:22px;background:#1677ff;color:#fff;font-size:20px;box-shadow:0 4px 16px rgba(0,0,0,.24);";
    fab.addEventListener("click", (e) => {
      e.stopPropagation();
      mTranslate.textContent = state.translated ? "恢复" : "翻译";
      menu.style.display = menu.style.display === "none" ? "block" : "none";
    });

    document.addEventListener("click", () => {
      if (menu.style.display === "block") menu.style.display = "none";
    });

    root.appendChild(menu);
    root.appendChild(fab);
    document.documentElement.appendChild(root);
  }

  state.settings = normalizeByPreset(await getValue(KEY, DEFAULT));
  mountUI();

  if (typeof GM_registerMenuCommand !== "undefined") {
    GM_registerMenuCommand("Immersive Lite: 翻译/恢复", async () => {
      if (state.translated) restorePage();
      else await translatePage();
    });
    GM_registerMenuCommand("Immersive Lite: 打开设置", openSettings);
  }
})();
