# Immersive Lite

A lightweight patch of the official [Immersive Translate](https://immersivetranslate.com/) userscript.

**No login. No cloud. No tracking. No pricing prompts.**

Keeps only core bilingual web translation + custom translation services (OpenAI / OpenRouter / DeepSeek / any OpenAI-compatible API).

## Install (Userscript / iOS Safari)

1. Install [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) from App Store (iOS) or [Tampermonkey](https://www.tampermonkey.net/) (desktop)
2. Tap the link below to install:

   **[Install immersive-lite.user.js](https://raw.githubusercontent.com/Aioneas/immersive-lite/main/dist/userscript/immersive-lite.user.js)**

3. Open any web page → use the floating button to translate

## What's removed

- Account login / cloud sync
- Pricing / subscription / upgrade prompts
- Pro / Max membership gates
- Telemetry / analytics / performance reporting
- Feedback / customer service links
- Cloud config fetching

## What's kept

- Core bilingual web page translation
- All built-in translation services (Google, DeepL, Bing, Yandex, etc.)
- Custom OpenAI-compatible translation services
- Local settings panel
- Page rules / special rules
- Translation cache
- Dual-language display styles

## How it works

This is a **patched version** of the official `immersive-translate.user.js` (v1.28.2).

The patch script (`scripts/patch.mjs`):
- Replaces cloud/analytics endpoints with localhost (silently fails)
- Injects a fetch interceptor to block cloud requests
- Neutralizes login/upgrade modal functions
- Disables telemetry flags

## Rebuild from latest official

```bash
# Download latest official userscript
curl -L -o scripts/original.user.js https://download.immersivetranslate.com/immersive-translate.user.js
# Run patch
node scripts/patch.mjs
# Output: immersive-lite.user.js
cp immersive-lite.user.js dist/userscript/
```

## License

The original Immersive Translate userscript is proprietary.
This patch is for **personal use only** and is not redistributed as a standalone product.
The patch script itself is MIT licensed.
## Base and references

### Base code
- `old-immersive-translate` (MPL-2.0)
- upstream ancestor: `Traduzir-paginas-web / TWP` (MPL-2.0)

### Reference-only inspirations
The following projects are studied for architecture and ideas, but their code is **not copied** into this repository unless license compatibility and attribution are handled explicitly:
- `openai-translator/openai-translator` (AGPL-3.0) — provider UX and OpenAI-compatible ideas
- `pot-app/pot-desktop` (GPL-3.0) — multi-provider config design ideas
- `openai-translator/bob-plugin-openai-translator` (CC BY-NC-SA 4.0) — model/base-url option ideas only

### Compatible references
- `mozilla/firefox-translations` (MPL-2.0) — local-first/privacy-oriented product direction
- `sienori/simple-translate` (MPL-2.0) — compact options structure and minimal settings patterns

## Lite scope

### Keep
- web page translation
- bilingual display
- special page rules
- custom dictionary
- local cache
- import/export settings
- lightweight popup/options UI
- custom OpenAI-compatible translation service

### Remove / avoid
- account system
- login
- cloud sync
- pricing / pro / max / subscription
- donation entrypoints
- feedback / Telegram / release-note funnels
- telemetry / analytics
- reward/store/growth UI
- unrelated AI assistant features
- non-core SaaS dependencies

## Roadmap

### v0.1
- Remove non-core UI and links
- Add `openai_compatible` page translation service
- Add local config for base URL / API key / model
- Keep old content-script translation pipeline

### v0.1.1
- Harden `openai_compatible` response parsing
- Add provider presets and connection test
- Remove PDF legacy and donation/resource leftovers

### v0.2
- Simplify popup and options information architecture
- Reduce permissions and dead code
- Prepare Safari / Userscripts adaptation layer

### v0.2.1
- Add runtime adapter (`extension` / `userscript` / `web`)
- Add preview userscript entry and userscript build target
- Start reducing extension-only direct dependencies in shared libs

### v0.2.2
- Add userscript shim + minimal userscript controller
- Add GM storage fallback prototype
- Keep pushing `openai_compatible` toward standalone userscript usage

### v0.2.3
- Bundle translationService into userscript output
- Allow OpenAI-compatible requests to use runtime.request (GM)
- Support extra headers for third-party OpenAI-compatible gateways

### v0.3
- Userscript/Safari build target usable on-device
- More provider presets (DeepSeek-compatible / OpenRouter-compatible)
- GM storage + minimal local settings flow

## License

This repository contains MPL-2.0 based code and should remain compliant with MPL-2.0 for covered files.
