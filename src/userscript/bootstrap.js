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

  state.settings = await loadSettingsWithMigration();
  state.cache = normalizeCacheStore((await gmGet(CACHE_KEY, {})) || {});
  state.providerCaps = (await gmGet(PROVIDER_CAPS_KEY, {})) || {};
  state.fabPos = await gmGet(FAB_POS_KEY, null);
  mountUI();
  scheduleAutoTranslateInit();

  if (typeof GM_registerMenuCommand !== "undefined") {
    GM_registerMenuCommand("Immersive Lite: 整页翻译", translatePage);
    GM_registerMenuCommand("Immersive Lite: 打开设置", openSettings);
    GM_registerMenuCommand("Immersive Lite: 恢复原文", restorePage);
  }
})();
