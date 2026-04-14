# Immersive Lite

面向 **iOS Safari Userscripts / Tampermonkey** 的沉浸式翻译精简版。

目标：
- 只保留核心网页翻译
- 只保留本地设置 + 自定义 OpenAI-compatible API
- 去掉云同步、账号登录、价格/付费、客服/反馈、统计追踪等非核心功能
- 适配 iOS Safari Userscripts 的真实使用场景

## 安装

- Userscripts / Tampermonkey 安装地址：
  [immersive-lite.user.js](https://raw.githubusercontent.com/Aioneas/immersive-lite/main/dist/userscript/immersive-lite.user.js)

## 当前 userscript 交互

- 单击悬浮球 **“译”**：整页翻译
- 双击悬浮球：打开设置
- 设置面板内提供：
  - Provider：`openai / deepseek / custom`
  - API 完整地址优先
  - Base URL 自动拼接 `/v1/chat/completions`
  - Model 下拉选择 + custom
  - 目标语言
  - 显示模式：`双语对照 / 仅译文`
  - 速度模式：`稳定 / 推荐 / 极速`
  - 恢复原文 / 重新翻译

## 当前性能策略（v0.8）

本仓库当前 userscript 不再走“一整页大请求”的慢路径，而是采用 **双阶段策略**：

### 1. 前台快速响应
- 优先抓取当前视口附近的前段内容
- 先把用户眼前最可能立即阅读的部分快速翻出来
- 使用短时间窗批队列，把零碎任务合并成更合理的小批请求

### 2. 后台安静补全
- 当前段翻出后，不打断阅读
- 利用用户阅读前面内容的时间，在后台继续补后面的页面内容
- 这样既保留“首屏快响应”，又避免整页都要先等完

## 缓存策略（v0.8）

参考 KISS Translator 思路并针对 userscript 场景做简化：

- 只缓存 **成功翻译结果**
- key 基于：`provider + model + targetLang + apiUrl + textHash`
- 命中缓存时直接返回，不重复消耗请求
- 使用轻量 **LRU / 最近访问时间** 裁剪旧缓存
- 自动限量，避免本地存储膨胀
- 延迟写盘，避免每条命中都频繁写存储拖慢页面

## 为什么仍然不会和 Google/DeepL 一样快

因为当前 userscript 走的是 **OpenAI-compatible LLM** 路线，而不是 Google / DeepL 这种专用机器翻译接口。

LLM 的特点是：
- 每次都要做推理
- 输出 JSON
- token 生成成本比专用翻译 API 高

所以这个项目的优化方向是：
- 尽量降低首屏等待
- 尽量减少重复请求
- 尽量把用户感知做快

而不是和专用机器翻译接口拼绝对延迟。

## 仓库方向

### 保留
- 网页翻译
- 双语对照 / 仅译文
- 本地设置
- 本地缓存
- OpenAI-compatible / DeepSeek / custom
- iOS Safari Userscripts 可用性

### 明确不做
- 账号系统
- 云同步
- 定价/升级/订阅入口
- 统计追踪
- 反馈/客服/增长入口
- 任何非本地优先的 SaaS 化功能

## 参考思路

- `old-immersive-translate`：视口优先、按长度切分、老牌网页翻译交互思路
- `KISS Translator`：批队列、缓存、按 API 能力调度的思路

当前实现是结合以上思路，针对 **Userscripts / iOS Safari** 环境重新收敛出的更轻量版本。

## License

本仓库当前目标是维护一个本地优先、精简、可持续迭代的 userscript 版本；涉及上游来源的文件需继续遵守对应许可证要求。