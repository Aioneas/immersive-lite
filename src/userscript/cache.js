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
