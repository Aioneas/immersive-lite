# Immersive Lite 重构方案

## 目标

以 `old-immersive-translate` 为开源核心底座，重构出一个：
- 本地优先
- 轻量化
- 无登录/无云端/无付费入口
- 保留网页双语翻译核心
- 支持自定义翻译服务（第一阶段为 OpenAI-compatible）

## 代码策略

### 直接基座
- `old-immersive-translate`（MPL-2.0）作为当前主代码基线

### 对照参考
- `Traduzir-paginas-web / TWP`（MPL-2.0）
- `mozilla/firefox-translations`（MPL-2.0）
- `simple-translate`（MPL-2.0）

### 仅思路参考，不直接拷贝实现
- `openai-translator/openai-translator`（AGPL-3.0）
- `pot-app/pot-desktop`（GPL-3.0）
- `bob-plugin-openai-translator`（CC BY-NC-SA 4.0）

## 当前已完成

### 1. 去除非核心 UI
- 移除设置页 donation / feedback / release / telegram / patreon 入口
- 移除桌面弹窗 donate / 外部跳转入口
- 移除移动弹窗 donate 入口
- 保留更少但实用的 popup/options 结构

### 2. 接入新版最有价值特性：自定义翻译服务
- 新增 `openai_compatible` 作为页面翻译服务
- 本地配置项：
  - `baseUrl`
  - `apiKey`
  - `model`
  - `systemPrompt`
- 设置页新增轻量配置面板
- 页面翻译链路已接入 `/v1/chat/completions`
- 服务切换链路已支持：`google -> yandex -> openai_compatible -> google`

### 3. Safari / Userscripts 第一阶段前置适配
- 新增 `src/lib/runtime.js` 作为 runtime adapter
- 支持识别 `extension / userscript / web`
- 抽象消息、资源 URL、网络请求
- 新增 `src/userscript/immersive-lite.user.js` preview 入口
- 构建脚本已可生成 `dist/userscript/immersive-lite.user.js`

## 后续计划

### v0.2.2
- 让翻译请求逐步改用 runtime.request
- 让 `openai_compatible` 在 userscript 模式下独立可用
- 增加 GM storage fallback

### v0.1.1
- 补充更安全的 OpenAI-compatible 响应解析
- 增加 provider presets（OpenAI / OpenRouter / DeepSeek-compatible）
- 清理残留无用图标与文案

### v0.2
- 进一步裁掉 PDF / donation / 非核心移动逻辑
- 减少 manifest 权限
- 压缩 options UI 信息架构

### v0.3
- Safari / Userscripts 适配层
- 将 background/content 的消息模型改造成更容易 userscript 化的模式

## 推送策略

这是一个新仓库重构项目，不 fork 官方仓库。
建议仓库名：`Aioneas/immersive-lite`
