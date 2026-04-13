# Source and reference notes

## Direct code base
- Source: `old-immersive-translate`
- License: MPL-2.0
- Use: code base for initial reconstruction

## Upstream ancestor reference
- Source: `FilipePS/Traduzir-paginas-web`
- License: MPL-2.0
- Use: historical comparison, bug tracing, design lineage

## Compatible reference projects
- `mozilla/firefox-translations` (MPL-2.0): product direction reference only for local-first/privacy-first positioning
- `sienori/simple-translate` (MPL-2.0): minimal settings UX reference

## Incompatible / restricted references
These are inspected for ideas only. No direct code copy unless separately reviewed and relicensed appropriately.
- `openai-translator/openai-translator` — AGPL-3.0
- `pot-app/pot-desktop` — GPL-3.0
- `openai-translator/bob-plugin-openai-translator` — CC BY-NC-SA 4.0

## New feature policy
For provider support, this repository implements its own small adapters from public API docs and general protocol knowledge, rather than importing code from incompatible projects.
