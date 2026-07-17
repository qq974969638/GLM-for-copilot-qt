# 快速上手(给上游作者 / 新接手者)

> 前置:已配置好 GLM API Key(在插件里用 BYOK 方式登录过)。

---

## 一、构建与运行

本仓库用 `pnpm` + `vp`(VS Code Packaging 工具链)。

```bash
pnpm install          # 安装依赖
pnpm compile          # 编译,产物用 F5 调试运行
# 或:
pnpm watch            # 监听模式,边改边编译
```

> **调试运行**:在 VS Code 里按 `F5`,会打开一个加载了本插件的 Extension Development Host。

环境要求:
- Node.js `>= 24.11.0`
- VS Code `^1.116.0`
- pnpm `11.7.0`(仓库 `packageManager` 字段指定)

### 测试

```bash
pnpm test             # 363 个测试全通过
pnpm lint             # 语法检查
pnpm package          # 打包 vsix
```

---

## 二、体验 MCP 服务器

内置了 4 个 GLM 官方 MCP 服务。**为避免老用户升级后被惊扰(突然多 4 个活跃服务 + 自动发 Key),4 个服务默认全部关闭**,需手动启用。

### 一键启用(推荐)

命令面板运行 **`GLM: Apply Recommended Setup for GLM Coding Plan`**(`glm-copilot.applyCodingPlanPreset`)。它会一次性完成:
- 启用 4 个内置 MCP 服务
- 把 `glm-5.2` 和 `glm-5-turbo` 切到 `mcp` 视觉模式
- 打开 `experimental.stabilizeToolList`

这是用户级 override,**不污染内置默认值**(内置默认与上游对齐)。

### 逐个启用

在 Host 窗口的设置里搜 `glm-copilot.mcp`,每个服务有独立 checkbox:

```jsonc
"glm-copilot.mcp.zai-mcp-server.enabled": true,
"glm-copilot.mcp.web-search-prime.enabled": true,
"glm-copilot.mcp.web-reader.enabled": true,
"glm-copilot.mcp.zread.enabled": true
```

### 验证

1. `F5` 启动 Extension Development Host
2. 在 Host 窗口里打开 Copilot Chat,选一个 GLM 模型(如 `glm-5.2`)
3. 点聊天框右下角的 **工具配置按钮**(或命令 `Chat: Configure Tools`)
4. 你会看到已启用的工具:
   - `zai-mcp-server`(视觉/图像分析)
   - `web-search-prime`(联网搜索)
   - `web-reader`(网页抓取)
   - `zread`(深度阅读)
5. 直接提问,例如:
   - "搜索一下 VS Code 最新版本特性" → 触发 web-search-prime
   - 把一张截图拖进聊天框问 "这个报错怎么解决" → 触发 mcp 视觉模式(见下)

**API Key**:4 个内置 GLM 官方服务显式选择接收 Coding Plan Key(china-coding 通道),复用插件已保存的 GLM API Key,**无需单独配置**。自定义 MCP 服务**默认不注入任何凭证**,必须显式设 `injectApiKey: true` 才会注入(防止 BYOK Key 泄露给第三方进程/URL)。

---

## 三、体验 mcp 视觉模式

fork 的内置模型默认与上游对齐(glm-5.2 / glm-5-turbo 默认 `proxy`)。要体验 `mcp` 模式,运行上节的 **`GLM: Apply Recommended Setup for GLM Coding Plan`** 命令,或手动在模型管理面板把某模型切到 `mcp`。

### 它和上游的 `proxy` / `native` 有什么不同

| 模式 | 图片怎么处理 | 适合场景 |
|------|-------------|---------|
| `proxy`(上游原有) | 经 GLM-4.6V-Flash 代理转文字 | 需要文字模型"看图" |
| `native`(上游原有) | 缩放后 base64 直送 API | 模型原生支持多模态 |
| **`mcp`(本 fork)** | **图片落盘,消息里只留文件路径,由 MCP 工具按需读取** | Coding Plan 通道、省 token、复用分析 |

### 试一试

1. 运行 `GLM: Apply Recommended Setup for GLM Coding Plan`(或手动启用 `zai-mcp-server` + 把 `glm-5.2` 切到 `mcp`)
2. 选 `glm-5.2` 模型
3. 把一张 UI 截图拖进聊天框
4. 问:"把这个界面用代码实现出来" → 模型会调用 `analyze_image` 读图后写代码

你会看到对话里出现 `[Image attached at local file: ...]`,模型按需调用图像工具读取,而不是把整张图塞进上下文。

> ⚠️ **mcp 模式依赖工具调用**。如果某模型在 `mcp` 模式但禁用了工具调用(`toolCalling: false`)、且请求又带了图片,请求会被明确报错拒绝(否则图片会被静默丢失)。纯文本请求不受影响。

### 切换某模型的视觉模式

打开模型管理面板(命令面板搜 `GLM`),每个模型可单独选 `proxy` / `native` / `mcp`。

### 重置为默认值 / 清理存储图片

- `GLM: Reset to Defaults` — 清除用户级的 `modelManagement`、`stabilizeToolList`、`mcp.*`、提示词覆盖,让默认值生效。**不清除 API Key,不动 workspace 级配置。**
- `GLM: Clean Up Stored Images` — 删除所有 mcp 模式落盘的图片(配合 `glm-copilot.mcp.imageCleanupMode`:`manual` 默认不自动删,`ttl-7d` 激活时删 7 天前的)。

---

## 四、想看代码?从这里开始

| 想了解 | 看这个 |
|--------|--------|
| MCP 服务怎么注册 | `src/mcp/provider.ts` + `src/runtime/mcp.ts` |
| 4 个内置服务定义 | `src/mcp/builtin.ts` |
| mcp 视觉模式核心(单点钩子) | `src/provider/vision/resolve.ts` 顶部的 `mcp` early-return 分支 |
| 图片怎么落盘 | `src/provider/vision/image-store.ts` |
| 提示词模板 | `package.json` 里 `imageHandlingPrompt` / `imageStoredPrompt` 的 default |
| 内置模型定义 | `src/consts.ts` 的 `MODELS` 数组 |

### 搜索所有 fork 改动点

在仓库根目录搜索 `[FORK]`,每处 fork 改动都标了这个注释,便于定位(当前约 10 处)。

---

## 五、相关文档

- `01-mcp-proposal-for-upstream.md` — MCP 功能的完整设计说明(给上游的正式提案)
- `02-ai-handover.md` — fork 全部改动、设计决策、踩过的坑(接手必读)
- `03-fork-decoupling-rules.md` — 改动分类(A/B/C/D)与跟进上游的方法论

---

