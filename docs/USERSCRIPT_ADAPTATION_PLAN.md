# Userscript / Safari 适配第一阶段

## 当前目标

这一阶段不追求一次性做完整 Userscript 版，而是先把扩展架构中最强耦合的运行时边界拆开。

## 阶段目标

1. 设计 runtime adapter
2. 抽离 extension-only 能力
3. 准备 userscript build target
4. 为 iOS Safari / Userscripts 后续实装做铺垫

## 当前已完成

- 新增 `src/lib/runtime.js`
  - 识别 `extension` / `userscript` / `web`
  - 抽象消息发送入口
  - 抽象资源 URL
  - 抽象网络请求：优先 `fetch`，Userscript 下支持 `GM.xmlHttpRequest` / `GM_xmlhttpRequest`

- 新增 `src/userscript/immersive-lite.user.js`
  - 当前为 preview 入口文件
  - 用于后续逐步装配核心运行时和翻译链路

- 构建脚本已生成 userscript 产物
  - `dist/userscript/immersive-lite.user.js`

- 共享库开始降低 extension-only 直接依赖
  - `i18n.js`
  - `platformInfo.js`

## 下一步计划

### Step 2
- 让翻译服务优先依赖 runtime.request，而不是直接 fetch
- 逐步让 `openai_compatible` 在 userscript 模式下也可独立工作
- 加入 userscript shim 与 GM storage fallback 原型
- 提供 userscript 最小控制器（悬浮按钮 + 菜单配置）

### Step 3
- 为配置层增加 GM storage fallback
- 为 i18n 增加 userscript fallback
- 为 popup/options 增加 userscript 简化设置入口

### Step 4
- 减少对 background message 的依赖
- 将页面翻译必要能力下沉到 content / userscript runtime

## 备注

Userscripts Safari 的最终版需要：
- 更小的单文件构建
- 本地存储兼容
- 菜单/设置入口的 iOS 友好化
- 尽量减少对 browser action / background / context menu 的依赖
