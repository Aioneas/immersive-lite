# Immersive Lite

A lightweight, local-first bilingual web translation extension rebuilt from the historical open-source core of Immersive Translate.

## Goals

- Keep only the core web-page bilingual translation experience
- Keep local configuration and page rules
- Add lightweight custom translation service support (OpenAI-compatible first)
- Remove login, cloud sync, membership, pricing, telemetry, feedback funnels, donation prompts, and non-core growth UI
- Prefer simple architecture over feature bloat

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

### v0.3
- Userscript/Safari build target usable on-device
- More provider presets (DeepSeek-compatible / OpenRouter-compatible)
- GM storage + minimal local settings flow

## License

This repository contains MPL-2.0 based code and should remain compliant with MPL-2.0 for covered files.
