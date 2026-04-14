# Immersive Lite

面向 **iOS Safari Userscripts / Tampermonkey** 的沉浸式翻译精简版。

目标：
- 只保留核心网页翻译
- 只保留本地设置 + 自定义 OpenAI-compatible API
- 去掉云同步、账号登录、价格/付费、客服/反馈、统计追踪等非核心功能
- 面向真实阅读场景，优先保证 **稳定、可用、低打扰**

## 安装

- Userscripts / Tampermonkey 安装地址：
  [immersive-lite.user.js](https://raw.githubusercontent.com/Aioneas/immersive-lite/main/dist/userscript/immersive-lite.user.js)

## 当前交互

- 单击悬浮球 **“译”**：整页翻译
- 双击悬浮球：打开设置
- 在设置面板中可执行：
  - 保存配置
  - 重新翻译
  - 恢复原文
  - 关闭面板

## 当前设置项

- Provider：`openai / deepseek / custom`
- API 完整地址优先
- Base URL 自动拼接 `/v1/chat/completions`
- Model 下拉选择 + custom
- 目标语言
- 显示模式：`双语对照 / 仅译文`
- 速度模式：
  - **稳定**：更稳、更省
  - **推荐**：默认，适合大多数页面
  - **极速**：更快看到结果

## 当前翻译策略

当前实现采用 **稳定版批队列 + 缓存加速** 路线：

- 使用批队列聚合短时间窗内的翻译请求
- 使用缓存减少重复请求
- 使用并发队列避免过多请求同时压上接口
- 保持 userscript 环境下的稳定性优先

这不是“整页一个超大请求”的慢路径，也不是激进实验性的复杂调度，而是适合当前项目目标的折中方案。

## 当前页面优化

已做的页面细节优化：
- 跳过低翻译价值文本，减少无意义请求：
  - 日期
  - 时间
  - 纯数字 / 主要由数字组成的短文本
  - 短 ID / 用户标识
  - 纯符号文本
- 减少新闻站里常见的日期重复、数字重复翻译问题

## 当前悬浮球能力

- 支持 **任意拖动**
- 支持 **位置持久化**
- 支持 **边界限制**，不会轻易拖出屏幕
- 支持 **靠边半隐藏**
- 移入时完整显示，移出后再次半隐藏
- 采用低干扰半透明配色，尽量不影响阅读

## 为什么不会和 Google / DeepL 一样快

因为当前项目走的是 **OpenAI-compatible LLM** 路线，而不是 Google / DeepL 这种专用机器翻译接口。

LLM 路线的特点：
- 每次都要进行推理
- 需要返回结构化内容
- 延迟天然高于专用机器翻译接口

所以本项目的优化目标是：
- 尽量提升首屏感知速度
- 尽量减少重复请求
- 尽量减少无意义翻译
- 尽量降低阅读打扰

## 保留与边界

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

## 参考与学习来源

- `old-immersive-translate`：经典网页翻译产品交互与 DOM 处理思路
- `KISS Translator`：批队列、缓存、API 调度思路
- `FluentRead`：低价值文本过滤、页面节点选择与阅读体验细节

当前实现是在这些思路基础上，针对 **Userscripts / iOS Safari** 重新收敛出的稳定轻量版本。

## License

本仓库当前目标是维护一个本地优先、精简、可持续迭代的 userscript 版本；涉及上游来源的文件需继续遵守对应许可证要求。
