# @jcy2387/dsh-conversation-ui

本版本面向 Harness `0.2.0-rc.2`。产物卡片使用列表插槽中的独立条目，与原生文件预览、变更审阅及其他插件的回合尾部内容共存；插件设置位于 Suite 或独立插件的配置页。助手行委托原生组件渲染，工作步骤展示模式、工具分组、折叠和滚动由 DSH 管理。旧版 Harness 用户应继续使用对应旧版插件。

[![CI](https://github.com/DamonBao/dsh-codex-suite/actions/workflows/ci.yml/badge.svg)](https://github.com/DamonBao/dsh-codex-suite/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.en.md) | 简体中文

DeepSeek Harness（DSH）的对话增强插件：在原生助手组件上增加逐字揭示和思考自动展开，并通过独立插槽展示产物。原生 ChatView、工具卡片、回合控制和文件预览保持宿主的呈现。本包是 [DSH Codex Suite](../../README.zh.md) Monorepo 的对话 UI 包。

**本包与 Codex Provider 完全独立**，可以单独安装并服务任意模型。

## 功能

### 原生对话协作

- 工作步骤展示的简洁、标准、详细和完全展开模式继续使用 DSH 的原生分组、思考摘要和过程折叠。
- Markdown、受保护的本地图片、图片附件、文件引用、停止标记和最终答复操作由原生助手组件渲染。
- 工具、重试、工作流、命令和上下文行保留原生布局；插件不修改注册表中的组件，也不通过 Portal 重排行。

### 两种流式揭示模式

| 模式 | 行为 |
| --- | --- |
| `teleprompter`（默认） | 直接呈现模型的最新内容快照，不引入额外逐字队列。 |
| `typewriter` | 按字素（grapheme）渐进揭示，对中文、emoji 等宽字符安全。 |

- 三档平滑预设：`realtime`（更跟手）、`balanced`（默认）、`silky`（更绵密）。预设控制揭示节奏曲线：到达速率的 EMA 平滑、缓冲目标、追速上限和停顿后的收尾排空速度，让长回复不会整段砸出、快流不会卡顿。
- `typewriter` 模式另有固定揭示速度 `revealCharsPerSec` 可调。回合完成或停止后立即显示完整快照；加载历史和切换会话不会重播逐字效果。

### 流式视口协作

- 当前 DSH `ChatView` 独占会话级位置恢复、底部跟随和用户上滑释放；插件不再直接写 `scrollTop` 或行变换，避免切换会话时争抢滚动所有权。
- 尊重 `prefers-reduced-motion`，启用减少动态效果时直接显示最新快照。

### 产物卡片

- 每个完成的 Turn 尾部列出**产物**：生成的文件与站点，附增删行数，产出成果一目了然。

### 插件设置卡片

- 在 **插件 → DSH Codex Suite（或 Conversation UI）** 中提供持久化的「自动展开思考」开关（实时生效，无需重启）。
- 卡片同时显示当前版本与安装形态（npm / 本地开发），npm 安装支持一键更新（更新后需重启）。
- 界面中英文本地化。

## 安装

已发布版本：

```sh
dsh plugin --profile web add @jcy2387/dsh-conversation-ui@0.2.0-rc.2
dsh web
```

本地开发版本：

```sh
dsh plugin --profile web add link:/path/to/dsh-codex-suite/packages/conversation-ui
dsh web
```

也可以安装 [`@jcy2387/dsh-suite`](../all/README.md) 组合包，一次启用 Codex Provider 与本插件。

安装后自动增强原生助手行，既有会话数据不变。

## 配置

Profile patch ID：`conversation-ui`。在 profile 的 `cordis.patch.yml` overlay 中设置（组合包默认值为 `mode: teleprompter`、`preset: balanced`）。

| 选项 | 范围 | 默认 | 说明 |
| --- | --- | --- | --- |
| `mode` | `teleprompter` \| `typewriter` | `teleprompter` | 助手内容的揭示模式。 |
| `preset` | `realtime` \| `balanced` \| `silky` | `balanced` | 平滑节奏预设。 |
| `revealCharsPerSec` | 5–200 | `80` | `typewriter` 模式的固定揭示速度。 |
| `scrollSpeedPxPerSec` | 1–200 | `48` | 已弃用；仅保留旧 Profile 配置兼容，滚动由 DSH 管理。 |
| `maxScrollSpeedPxPerSec` | 1–2000 | `1000` | 已弃用；仅保留旧 Profile 配置兼容，滚动由 DSH 管理。 |

Overlay 示例：

```yaml
- id: conversation-ui
  name: '@jcy2387/dsh-conversation-ui'
  config:
    mode: typewriter
    preset: silky
    revealCharsPerSec: 60
```

「自动展开思考」等用户偏好不走 overlay：在 **插件 → DSH Codex Suite（或 Conversation UI）** 中修改，保存即生效并跨重启持久化。

### 临时禁用

包内自带 [`conversation-ui-off.yml`](conversation-ui-off.yml) overlay，可在不卸载包的情况下禁用插件（回到原生对话渲染）：

```yaml
- id: conversation-ui
  disabled: true
```

## 架构

本包由两半组成，通过一条极窄的配置通道协作：

- **Host 半**（`src/`）：Cordis 插件。负责校验配置 schema，并把校验后的配置注入每个服务出的 index HTML（启动配置全局变量 `window.__DSH_CONVERSATION_UI_CONFIG__`）；同时注册用户设置命名空间与一条仅限 loopback 的设置 RPC（读取/写入偏好、查询安装形态、触发 npm 更新）。
- **Web 半**（`src/client/`）：通过 `conversation.chat.node` 的 `assistant-step` 键注册薄包装，保留既有组件的 locale 与注入信息，只调整流式文本和原生 `useDisclosure`。不接管 `conversation.view` 或 `turn-process`，不读取宿主 DOM。产物使用 `conversation.chat.turnTail` 的独立列表条目，设置使用 `plugins.bundle.config`。组件装卸跟随插槽声明；若既有助手组件拥有子插槽或 Store，则保留该组件原样。

### 升级后的呈现

旧版插件的自定义工具图标、工具分组框和过程折叠样式已交由 DSH 原生 UI。请使用 DSH 的「工作步骤展示」选择呈现模式；插件的揭示配置与持久化「自动展开思考」偏好继续生效。没有会话格式或凭据迁移。产物卡片只读取持久化回合数据，不再扫描其他行的 DOM 或隐藏原生文件预览。

## 开发

```sh
pnpm --filter @jcy2387/dsh-conversation-ui typecheck
pnpm --filter @jcy2387/dsh-conversation-ui test
pnpm --filter @jcy2387/dsh-conversation-ui build
```

测试基于 vitest + Testing Library，加载已发布 DSH Chat 工厂，覆盖原生模式、思考折叠、图片、流式揭示、装卸顺序与设置卡片（客户端与 Host 两侧）。工作区级命令见 [Monorepo README](../../README.zh.md)。

## 许可证

[MIT](LICENSE) © jcy2387

本版面向 DSH `0.2.0-rc.2`。旧 `conversation-ui.thinkAutoExpand` 从 `settings.yaml` 或 `settings.yaml.imported` 导入当前 profile 的 `cordis.patch.yml`，成功后记录迁移标记；失败保留源文件供重试。插件兼容导入只补充缺失的值。名称和描述通过导出的 `locale/en.json`、`locale/zh.json` 跟随 DSH 界面语言。
