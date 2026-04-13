.Phony: start
start:
	web-ext run -s ./src -f firefoxdeveloperedition -p dev-edition-default

.Phony: build
build:
	npm run build
.Phony: watch
watch:
	watchexec -e js,json,html npm run chrome


.Phony: icon
icon:
	deno run -A ./scripts/generate-icons.js
