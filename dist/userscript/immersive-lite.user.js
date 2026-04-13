// ==UserScript==
// @name         Immersive Lite (Core)
// @namespace    https://github.com/Aioneas/immersive-lite
// @version      0.2.0
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

  const KEY = "immersive_lite_core_settings_v1";
  const DEFAULT = {
    provider: "openai", // openai | openrouter | deepseek | custom
    baseUrl: "https://api.openai.com",
    apiKey: "",
    model: "gpt-4o-mini",
    targetLang: (navigator.language || "zh-CN"),
    fallbackService: "none",
    extraHeaders: {}
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

  function normalizeByPreset(s) {
    const t = { ...s };
    if (t.provider === "openrouter") {
      if (!t.baseUrl) t.baseUrl = "https://openrouter.ai/api";
      if (!t.model) t.model = "openai/gpt-4o-mini";
      t.extraHeaders = {
        "HTTP-Referer": "https://github.com/Aioneas/immersive-lite",
        "X-Title": "Immersive Lite",
        ...(t.extraHeaders || {})
      };
    } else if (t.provider === "deepseek") {
      if (!t.baseUrl) t.baseUrl = "https://api.deepseek.com";
      if (!t.model) t.model = "deepseek-chat";
    } else if (t.provider === "openai") {
      if (!t.baseUrl) t.baseUrl = "https://api.openai.com";
      if (!t.model) t.model = "gpt-4o-mini";
    }
    return t;
  }

  function endpoint(baseUrl) {
    let b = (baseUrl || "").trim();
    if (!/^https?:\/\//i.test(b)) b = "https://" + b;
    b = b.replace(/\/$/, "");
    if (b.endsWith("/v1/chat/completions")) return b;
    if (b.endsWith("/v1")) return b + "/chat/completions";
    return b + "/v1/chat/completions";
  }

  function toast(msg, ms = 1800) {
    let el = document.getElementById("iml-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "iml-toast";
      el.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:2147483647;background:rgba(0,0,0,.78);color:#fff;padding:8px 12px;border-radius:10px;font:13px -apple-system;max-width:80vw;text-align:center;";
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
      if (!el.innerText) return false;
      const txt = el.innerText.trim();
      if (txt.length < 20 || txt.length > 1000) return false;
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

  function parseTranslations(content, expected) {
    try {
      const j = JSON.parse(content);
      const arr = j.translations || j.data || j;
      if (Array.isArray(arr)) return arr;
    } catch {}
    const m = String(content).match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const arr = JSON.parse(m[0]);
        if (Array.isArray(arr)) return arr;
      } catch {}
    }
    return new Array(expected).fill("");
  }

  async function translateBatch(texts) {
    const s = normalizeByPreset(state.settings);
    if (!s.baseUrl) throw new Error("请先设置 Base URL");
    if (!s.apiKey && s.provider !== "custom") throw new Error("请先设置 API Key");

    const url = endpoint(s.baseUrl);
    const headers = { "Content-Type": "application/json", ...(s.extraHeaders || {}) };
    if (s.apiKey) headers.Authorization = "Bearer " + s.apiKey;

    const payload = {
      model: s.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a translation engine." },
        {
          role: "user",
          content:
            "Translate the following text array to target language. Return JSON: {\\\"translations\\\":[...]} with same length.\\n" +
            "TARGET_LANGUAGE: " + s.targetLang + "\\n" +
            "INPUT_JSON: " + JSON.stringify(texts)
        }
      ]
    };

    let res = await postJSON(url, headers, JSON.stringify(payload));
    if (!res.ok && res.text.includes("response_format")) {
      const p2 = { ...payload };
      delete p2.response_format;
      res = await postJSON(url, headers, JSON.stringify(p2));
    }
    if (!res.ok) throw new Error("翻译请求失败: HTTP " + res.status);

    let content = "";
    try {
      const j = JSON.parse(res.text);
      content = j?.choices?.[0]?.message?.content || "";
    } catch {
      throw new Error("返回不是有效 JSON");
    }
    return parseTranslations(content, texts.length);
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
      const texts = nodes.map((n) => n.innerText.trim());
      const batchSize = 24;
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
        toast(`翻译中 ${done}/${texts.length}...`, 800);
      }
      state.translated = true;
      toast("翻译完成");
    } catch (e) {
      toast("翻译失败: " + (e?.message || e), 2600);
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
    const overlay = document.getElementById("iml-settings-overlay");
    if (overlay) {
      overlay.style.display = "block";
      return;
    }

    const s = state.settings;
    const root = document.createElement("div");
    root.id = "iml-settings-overlay";
    root.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:2147483647;";

    const panel = document.createElement("div");
    panel.style.cssText = "position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:16px 16px 0 0;padding:14px 14px 22px;max-height:84vh;overflow:auto;font:14px -apple-system;";
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <b>Immersive Lite Settings</b><button id="iml-close" style="border:none;background:#eee;border-radius:8px;padding:4px 8px">关闭</button>
      </div>
      <label>Provider</label>
      <select id="iml-provider" style="width:100%;margin:4px 0 8px;padding:8px"><option>openai</option><option>openrouter</option><option>deepseek</option><option>custom</option></select>
      <label>Base URL</label><input id="iml-base" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />
      <label>API Key</label><input id="iml-key" type="password" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />
      <label>Model</label><input id="iml-model" style="width:100%;margin:4px 0 8px;padding:8px;box-sizing:border-box" />
      <label>Target Language (e.g. zh-CN / en / ja)</label><input id="iml-lang" style="width:100%;margin:4px 0 12px;padding:8px;box-sizing:border-box" />
      <button id="iml-save" style="width:100%;padding:10px;border:none;border-radius:10px;background:#1677ff;color:#fff">保存</button>
    `;

    root.appendChild(panel);
    document.documentElement.appendChild(root);

    const provider = panel.querySelector("#iml-provider");
    const base = panel.querySelector("#iml-base");
    const key = panel.querySelector("#iml-key");
    const model = panel.querySelector("#iml-model");
    const lang = panel.querySelector("#iml-lang");

    provider.value = s.provider || "openai";
    base.value = s.baseUrl || "";
    key.value = s.apiKey || "";
    model.value = s.model || "";
    lang.value = s.targetLang || "zh-CN";

    provider.addEventListener("change", () => {
      const p = provider.value;
      if (p === "openai") { if (!base.value) base.value = "https://api.openai.com"; if (!model.value) model.value = "gpt-4o-mini"; }
      if (p === "openrouter") { if (!base.value) base.value = "https://openrouter.ai/api"; if (!model.value) model.value = "openai/gpt-4o-mini"; }
      if (p === "deepseek") { if (!base.value) base.value = "https://api.deepseek.com"; if (!model.value) model.value = "deepseek-chat"; }
    });

    panel.querySelector("#iml-close").addEventListener("click", () => root.style.display = "none");
    root.addEventListener("click", (e) => { if (e.target === root) root.style.display = "none"; });

    panel.querySelector("#iml-save").addEventListener("click", async () => {
      state.settings = normalizeByPreset({
        ...state.settings,
        provider: provider.value,
        baseUrl: base.value.trim(),
        apiKey: key.value.trim(),
        model: model.value.trim(),
        targetLang: lang.value.trim() || "zh-CN",
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
    root.style.cssText = "position:fixed;right:14px;bottom:22px;z-index:2147483646;display:flex;gap:6px;align-items:center;";

    const t = document.createElement("button");
    t.textContent = "译";
    t.style.cssText = "width:44px;height:44px;border:none;border-radius:22px;background:#1677ff;color:#fff;font-size:20px;box-shadow:0 4px 16px rgba(0,0,0,.24);";
    t.addEventListener("click", () => {
      if (state.translated) restorePage(); else translatePage();
    });

    const s = document.createElement("button");
    s.textContent = "⚙";
    s.style.cssText = "width:34px;height:34px;border:none;border-radius:17px;background:#f1f1f1;color:#555;font-size:16px;";
    s.addEventListener("click", openSettings);

    root.appendChild(t);
    root.appendChild(s);
    document.documentElement.appendChild(root);
  }

  state.settings = normalizeByPreset(await getValue(KEY, DEFAULT));
  mountUI();

  if (typeof GM_registerMenuCommand !== "undefined") {
    GM_registerMenuCommand("Immersive Lite: Translate/Restore", () => {
      if (state.translated) restorePage(); else translatePage();
    });
    GM_registerMenuCommand("Immersive Lite: Settings", openSettings);
  }
})();
