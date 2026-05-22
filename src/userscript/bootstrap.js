  if (window.self !== window.top) return;

  function scheduleAutoTranslateInit() {
    if (state.autoTranslateInitTimer) {
      clearTimeout(state.autoTranslateInitTimer);
      state.autoTranslateInitTimer = 0;
    }
    state.autoTranslateInitTimer = setTimeout(async () => {
      state.autoTranslateInitTimer = 0;
      try {
        await maybeAutoTranslateOnLoad();
      } catch (e) {
        console.error("[immersive-lite] auto translate init failed", e);
      }
    }, 900);
  }

  function registerMenuCommandCompat(label, handler) {
    try {
      if (typeof GM !== "undefined" && typeof GM.registerMenuCommand === "function") {
        GM.registerMenuCommand(label, handler);
        return;
      }
      if (typeof GM_registerMenuCommand !== "undefined") {
        GM_registerMenuCommand(label, handler);
      }
    } catch (e) {
      console.warn("[immersive-lite] menu command registration failed", label, e);
    }
  }

  state.settings = await loadSettingsWithMigration();
  state.cache = normalizeCacheStore((await gmGet(CACHE_KEY, {})) || {});
  state.fabPos = await gmGet(FAB_POS_KEY, null);
  mountUI();
  scheduleAutoTranslateInit();

  registerMenuCommandCompat("Immersive Lite: 整页翻译", translatePage);
  registerMenuCommandCompat("Immersive Lite: 打开设置", openSettings);
  registerMenuCommandCompat("Immersive Lite: 恢复原文", restorePage);
})();