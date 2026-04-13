"use strict";

(function () {
  const PRESETS = {
    openai:    { baseUrl: "https://api.openai.com",  model: "gpt-4o-mini" },
    openrouter:{ baseUrl: "https://openrouter.ai/api", model: "openai/gpt-4o-mini" },
    deepseek:  { baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
    custom:    { baseUrl: "", model: "" },
  };

  /* ── settings panel ── */
  function createSettingsPanel() {
    if (document.getElementById("iml-settings-panel")) return;
    const overlay = document.createElement("div");
    overlay.id = "iml-settings-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.45);display:none;";
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeSettings(); });

    const panel = document.createElement("div");
    panel.id = "iml-settings-panel";
    panel.style.cssText = [
      "position:fixed","bottom:0","left:0","right:0","z-index:2147483647",
      "max-height:85vh","overflow-y:auto",
      "background:#fff","color:#222","border-radius:16px 16px 0 0",
      "box-shadow:0 -4px 24px rgba(0,0,0,.2)","padding:20px 16px 28px",
      "font-family:-apple-system,BlinkMacSystemFont,sans-serif","font-size:14px",
      "display:none",
    ].join(";");

    const cfg = twpConfig.get("openaiCompatible") || {};

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <b style="font-size:17px;">Immersive Lite Settings</b>
        <span id="iml-close" style="font-size:22px;cursor:pointer;padding:4px 8px;">✕</span>
      </div>
      <label style="font-size:12px;color:#888;">Provider Preset</label>
      <select id="iml-preset" style="width:100%;padding:8px;margin:4px 0 10px;border:1px solid #ccc;border-radius:8px;font-size:14px;">
        <option value="openai">OpenAI</option>
        <option value="openrouter">OpenRouter</option>
        <option value="deepseek">DeepSeek</option>
        <option value="custom">Custom</option>
      </select>
      <label style="font-size:12px;color:#888;">Base URL</label>
      <input id="iml-baseurl" style="width:100%;padding:8px;margin:4px 0 10px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;" />
      <label style="font-size:12px;color:#888;">API Key</label>
      <input id="iml-apikey" type="password" style="width:100%;padding:8px;margin:4px 0 10px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;" />
      <label style="font-size:12px;color:#888;">Model</label>
      <input id="iml-model" style="width:100%;padding:8px;margin:4px 0 10px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;" />
      <label style="font-size:12px;color:#888;">Fallback</label>
      <select id="iml-fallback" style="width:100%;padding:8px;margin:4px 0 10px;border:1px solid #ccc;border-radius:8px;font-size:14px;">
        <option value="google">Google</option>
        <option value="yandex">Yandex</option>
        <option value="none">None</option>
      </select>
      <label style="font-size:12px;color:#888;">Target Language</label>
      <select id="iml-target-lang" style="width:100%;padding:8px;margin:4px 0 14px;border:1px solid #ccc;border-radius:8px;font-size:14px;"></select>
      <button id="iml-save" style="width:100%;padding:12px;border:none;border-radius:10px;background:#1677ff;color:#fff;font-size:15px;font-weight:600;cursor:pointer;">Save</button>
      <p id="iml-status" style="text-align:center;color:#888;font-size:12px;margin-top:8px;"></p>
    `;

    overlay.appendChild(panel);
    document.documentElement.appendChild(overlay);

    /* fill values */
    const presetEl = panel.querySelector("#iml-preset");
    const baseurlEl = panel.querySelector("#iml-baseurl");
    const apikeyEl = panel.querySelector("#iml-apikey");
    const modelEl = panel.querySelector("#iml-model");
    const fallbackEl = panel.querySelector("#iml-fallback");
    const targetLangEl = panel.querySelector("#iml-target-lang");

    presetEl.value = cfg.providerPreset || "openai";
    baseurlEl.value = cfg.baseUrl || "https://api.openai.com";
    apikeyEl.value = cfg.apiKey || "";
    modelEl.value = cfg.model || "gpt-4o-mini";
    fallbackEl.value = cfg.fallbackService || "google";

    /* fill target language */
    const langs = twpLang.getLanguageList();
    const currentTarget = twpConfig.get("targetLanguage") || navigator.language || "zh-CN";
    const langEntries = Object.entries(langs).sort((a,b) => a[1].localeCompare(b[1]));
    for (const [code, name] of langEntries) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = name;
      if (code === currentTarget) opt.selected = true;
      targetLangEl.appendChild(opt);
    }

    presetEl.addEventListener("change", () => {
      const p = PRESETS[presetEl.value] || {};
      if (p.baseUrl) baseurlEl.value = p.baseUrl;
      if (p.model) modelEl.value = p.model;
    });

    panel.querySelector("#iml-close").addEventListener("click", closeSettings);

    panel.querySelector("#iml-save").addEventListener("click", () => {
      const pv = presetEl.value;
      twpConfig.set("openaiCompatible", {
        ...(twpConfig.get("openaiCompatible") || {}),
        providerPreset: pv,
        baseUrl: baseurlEl.value.trim() || (PRESETS[pv] || {}).baseUrl || "",
        apiKey: apikeyEl.value.trim(),
        model: modelEl.value.trim() || (PRESETS[pv] || {}).model || "gpt-4o-mini",
        fallbackService: fallbackEl.value,
      });
      twpConfig.set("pageTranslatorService", "openai_compatible");
      if (targetLangEl.value) {
        twpConfig.set("targetLanguage", targetLangEl.value);
      }
      const statusEl = panel.querySelector("#iml-status");
      statusEl.textContent = "Saved ✓";
      statusEl.style.color = "#2e7d32";
      setTimeout(() => closeSettings(), 600);
    });
  }

  function openSettings() {
    createSettingsPanel();
    const overlay = document.getElementById("iml-settings-overlay");
    const panel = document.getElementById("iml-settings-panel");
    if (overlay) overlay.style.display = "block";
    if (panel) panel.style.display = "block";
  }

  function closeSettings() {
    const overlay = document.getElementById("iml-settings-overlay");
    const panel = document.getElementById("iml-settings-panel");
    if (overlay) overlay.style.display = "none";
    if (panel) panel.style.display = "none";
  }

  /* ── floating button ── */
  function toggleTranslate() {
    if (typeof pageTranslator !== "undefined" && pageTranslator.translatePage) {
      pageTranslator.translatePage();
    } else {
      chrome.runtime.sendMessage({ action: "toggle-translation" }, () => {});
    }
  }

  function createFloatingButton() {
    if (document.getElementById("iml-fab")) return;
    const fab = document.createElement("div");
    fab.id = "iml-fab";
    fab.style.cssText = [
      "position:fixed","right:14px","bottom:22px","z-index:2147483646",
      "display:flex","gap:6px","align-items:center",
    ].join(";");

    const btnTranslate = document.createElement("button");
    btnTranslate.id = "iml-btn-translate";
    btnTranslate.textContent = "译";
    btnTranslate.style.cssText = [
      "width:44px","height:44px","border:none","border-radius:22px",
      "background:#1677ff","color:#fff","font-size:20px",
      "box-shadow:0 4px 16px rgba(0,0,0,.25)","cursor:pointer","opacity:.92",
    ].join(";");
    btnTranslate.addEventListener("click", (e) => { e.preventDefault(); toggleTranslate(); });

    const btnSettings = document.createElement("button");
    btnSettings.id = "iml-btn-settings";
    btnSettings.textContent = "⚙";
    btnSettings.style.cssText = [
      "width:34px","height:34px","border:none","border-radius:17px",
      "background:#f0f0f0","color:#555","font-size:16px",
      "box-shadow:0 2px 8px rgba(0,0,0,.15)","cursor:pointer","opacity:.92",
    ].join(";");
    btnSettings.addEventListener("click", (e) => { e.preventDefault(); openSettings(); });

    fab.appendChild(btnTranslate);
    fab.appendChild(btnSettings);
    document.documentElement.appendChild(fab);
  }

  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== "undefined") {
      GM_registerMenuCommand("Immersive Lite: Translate", toggleTranslate);
      GM_registerMenuCommand("Immersive Lite: Settings", openSettings);
    }
  }

  globalThis.__IMMERSIVE_LITE_OPEN_SETTINGS__ = openSettings;

  twpConfig.onReady(function () {
    if (!twpConfig.get("pageTranslatorService") || twpConfig.get("pageTranslatorService") === "google") {
      twpConfig.set("pageTranslatorService", "openai_compatible");
    }
    registerMenuCommands();
    createFloatingButton();
  });
})();
