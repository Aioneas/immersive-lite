# Immersive Lite

> 面向 **iOS Safari Userscripts / Tampermonkey** 的本地优先网页翻译精简版。

[![Install Userscript](https://img.shields.io/badge/Install-Userscript-1677ff?style=flat-square)](https://raw.githubusercontent.com/Aioneas/immersive-lite/main/dist/userscript/immersive-lite.user.js)
[![License](https://img.shields.io/badge/License-MPL--2.0-6f7f97?style=flat-square)](./LICENSE)

## 项目定位

Immersive Lite 只做一件事：

**让新闻、文章、博客等网页在 iOS Safari 上以尽量稳定、低打扰、可持续使用的方式完成整页翻译。**

它不是一个追求功能堆叠的大而全产品，而是一个围绕真实阅读体验收敛出来的 userscript 版本。

### 设计原则

- **本地优先**：只保留本地设置与本地缓存
- **核心优先**：只保留网页翻译核心能力
- **阅读优先**：尽量减少视觉打扰与无意义翻译
- **稳定优先**：优先采用可验证、可维护的实现，而不是激进实验方案

---

## 安装

- Userscripts / Tampermonkey 安装地址：
  [immersive-lite.user.js](https://raw.githubusercontent.com/Aioneas/immersive-lite/main/dist/userscript/immersive-lite.user.js)

---

## 当前能力

### 页面翻译
- 单击悬浮球 **“译”**：整页翻译
- 双击悬浮球：打开设置
- 支持：
  - **双语对照**
  - **仅译文**

### 支持的服务类型
- **OpenAI**
- **DeepSeek**
- **自定义 OpenAI-compatible 接口**

### 设置项（简化后）
- 翻译服务
- 接口地址（支持完整地址 / 基础地址自动补全）
- API 密钥
- 模型
- 目标语言
- 显示模式
- 速度模式：
  - **稳定**：更稳、更省
  - **推荐**：默认，适合大多数页面
  - **极速**：更快看到结果

---

## 源码结构

当前 userscript 源码已按职责拆分，后续维护以 `src/userscript/` 为主：

- `immersive-lite.user.js`：userscript 头部元信息
- `core.js`：全局状态、设置归一化、GM 存储、公共工具
- `cache.js`：缓存键、缓存读写与裁剪
- `provider-adapters.js`：请求发送、OpenAI-compatible 响应解析、接口地址构建
- `dom-picker.js`：低价值文本过滤与 DOM 节点筛选
- `translator.js`：批队列、并发调度、整页翻译 / 恢复原文
- `settings.js`：设置面板 UI 与保存逻辑
- `ui-fab.js`：悬浮球、拖动、贴边半隐藏与交互
- `bootstrap.js`：启动入口与菜单命令注册

构建产物仍然输出到：
- `dist/userscript/immersive-lite.user.js`

这样后续继续优化时，可以只改对应模块，而不需要再直接硬改 dist 单文件。

---

## 当前性能策略

当前实现采用 **稳定版批队列 + 缓存加速** 路线：

- 使用批队列聚合短时间窗内的翻译请求
- 使用缓存减少重复请求
- 使用并发队列避免过多请求同时压上接口
- 在 userscript 环境里优先保证稳定性与可恢复性

这不是“一整页大请求”的慢路径，也不是复杂且难维护的实验调度，而是针对 iOS Safari / Userscripts 现实约束做出的稳定方案。

---

## 页面细节优化

已做的页面过滤与细节处理：

- 跳过低翻译价值文本，减少无意义请求：
  - 日期
  - 时间
  - 纯数字 / 主要由数字组成的短文本
  - 短 ID / 用户标识
  - 纯符号文本
- 减少新闻站里常见的：
  - 日期重复翻译
  - 数字重复翻译
  - 阅读节奏被无效内容打断

---

## 悬浮球体验

当前悬浮球支持：

- **任意拖动**
- **位置持久化**
- **边界限制**
- **靠边半隐藏**
- **点击时展开，延时回贴边**
- 低干扰半透明配色，尽量不影响阅读

---

## 为什么不会和 Google / DeepL 一样快

因为当前项目走的是 **OpenAI-compatible LLM** 路线，而不是 Google / DeepL 这种专用机器翻译接口。

LLM 路线的特点：
- 每次都需要推理
- 需要返回结构化结果
- 延迟天然高于专用机器翻译接口

所以本项目的优化重点不是去和专用翻译 API 比绝对延迟，而是：

- 尽量提升首屏感知速度
- 尽量减少重复请求
- 尽量减少无意义翻译
- 尽量降低阅读打扰

---

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

---

## 参考与学习来源

- `old-immersive-translate`：经典网页翻译产品交互与 DOM 处理思路
- `KISS Translator`：批队列、缓存、API 调度思路
- `FluentRead`：低价值文本过滤、节点选择与阅读体验细节

当前实现是在这些思路基础上，针对 **Userscripts / iOS Safari** 重新收敛出的稳定轻量版本。

---

## License

本仓库当前目标是维护一个本地优先、精简、可持续迭代的 userscript 版本；涉及上游来源的文件需继续遵守对应许可证要求。
