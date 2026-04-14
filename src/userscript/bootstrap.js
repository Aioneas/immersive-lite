  if (window.self !== window.top) return;

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
