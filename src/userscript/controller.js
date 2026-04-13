"use strict";

(function () {
  function configureOpenAICompatible() {
    const current = twpConfig.get("openaiCompatible") || {};
    const preset = prompt("Provider preset (openai/openrouter/deepseek/custom)", current.providerPreset || "openai");
    if (preset == null) return;
    const baseUrl = prompt("Base URL", current.baseUrl || "https://api.openai.com");
    if (baseUrl == null) return;
    const apiKey = prompt("API Key", current.apiKey || "");
    if (apiKey == null) return;
    const model = prompt("Model", current.model || "gpt-4o-mini");
    if (model == null) return;
    const fallbackService = prompt("Fallback service (google/yandex/none)", current.fallbackService || "google");
    if (fallbackService == null) return;

    twpConfig.set("openaiCompatible", {
      ...current,
      providerPreset: preset.trim() || "custom",
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      fallbackService: fallbackService.trim() || "google",
    });
    twpConfig.set("pageTranslatorService", "openai_compatible");
    alert("Immersive Lite userscript settings saved.");
  }

  function toggleTranslate() {
    chrome.runtime.sendMessage({ action: "toggle-translation" }, () => {});
  }

  function createFloatingButton() {
    if (document.getElementById("immersive-lite-userscript-btn")) return;
    const btn = document.createElement("button");
    btn.id = "immersive-lite-userscript-btn";
    btn.textContent = "译";
    btn.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:24px",
      "z-index:2147483647",
      "width:44px",
      "height:44px",
      "border:none",
      "border-radius:22px",
      "background:#1677ff",
      "color:#fff",
      "font-size:20px",
      "box-shadow:0 4px 16px rgba(0,0,0,.25)",
      "cursor:pointer",
      "opacity:.9",
    ].join(";");
    btn.title = "Tap to translate, double tap to configure";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleTranslate();
    });
    btn.addEventListener("dblclick", (e) => {
      e.preventDefault();
      configureOpenAICompatible();
    });
    document.documentElement.appendChild(btn);
  }

  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== "undefined") {
      GM_registerMenuCommand("Immersive Lite: Toggle translate", toggleTranslate);
      GM_registerMenuCommand("Immersive Lite: Configure OpenAI-compatible", configureOpenAICompatible);
    }
  }

  globalThis.__IMMERSIVE_LITE_OPEN_SETTINGS__ = configureOpenAICompatible;

  twpConfig.onReady(function () {
    if (!twpConfig.get("pageTranslatorService") || twpConfig.get("pageTranslatorService") === "google") {
      twpConfig.set("pageTranslatorService", "openai_compatible");
    }
    registerMenuCommands();
    createFloatingButton();
  });
})();
