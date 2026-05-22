# Architecture

Immersive Lite is primarily maintained as a local-first userscript for iOS Safari Userscripts / Tampermonkey.

## Product boundary

The main product line is:

```text
src/userscript/* -> dist/userscript/immersive-lite.user.js
```

The repository also contains browser-extension files for Firefox MV2 and Chrome MV3 compatibility builds. Treat those files as compatibility or historical extension code unless a change explicitly targets the extension build.

## Userscript module order

`scripts/build.mjs` bundles the userscript modules in this order:

1. `src/userscript/immersive-lite.user.js`
2. `src/userscript/core.js`
3. `src/userscript/cache.js`
4. `src/userscript/dom-picker.js`
5. `src/userscript/provider-adapters.js`
6. `src/userscript/translator.js`
7. `src/userscript/settings.js`
8. `src/userscript/ui-fab.js`
9. `src/userscript/bootstrap.js`

The first file opens the async userscript wrapper. `bootstrap.js` closes it.

## Runtime flow

```text
bootstrap
  -> load settings/cache/fab position
  -> mount floating action button
  -> optionally auto-translate English pages

translatePage
  -> pick translatable DOM nodes
  -> split nodes by viewport priority: foreground / near / far
  -> render cache hits first
  -> translate pending text through batch queues
  -> render translated chunks progressively
```

## Module responsibilities

| Module | Responsibility |
|---|---|
| `core.js` | Defaults, settings migration, shared state, GM storage helpers, API URL normalization, adaptive queue tuning |
| `cache.js` | Scoped local cache, LRU-style pruning, cache statistics, clear-current-scope / clear-all operations |
| `dom-picker.js` | Low-value text filtering, language sampling, English auto-detect, viewport priority |
| `provider-adapters.js` | OpenAI-compatible request/response handling, response-format fallback, retry and adaptive split |
| `translator.js` | Page translation orchestration, batch queue, phased workers, render queue, restore original HTML |
| `settings.js` | Mobile-friendly settings panel and persistence |
| `ui-fab.js` | Floating action button, drag, dock/half-hide, click and double-click gestures |
| `bootstrap.js` | Startup wiring and userscript menu commands |

## Cache boundary

Cache keys are scoped by:

- provider
- model
- target language
- normalized endpoint URL
- source text hash

This prevents translations from different models, providers, languages, or endpoints from being reused incorrectly.

## Extension compatibility boundary

`src/manifest.json`, `src/chrome_manifest.json`, `src/background/`, `src/contentScript/`, `src/options/`, and related files are kept for browser-extension builds. Do not assume a userscript change needs to update those files unless the extension build is intentionally supported for that change.
