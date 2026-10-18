# @jcy2387/dsh-conversation-ui

This release targets Harness `0.2.1-rc.2`. The deliverables card uses an independent list entry; files defer to the native changed-files card when it is active, while the plugin adds websites without drawing a second file card. Settings appear on the Suite or standalone bundle page. Assistant rows delegate to the native renderer; DSH owns work-details modes, tool groups, folding, and scrolling. Older Harness users should keep the corresponding older plugin version.

[![CI](https://github.com/DamonBao/dsh-codex-suite/actions/workflows/ci.yml/badge.svg)](https://github.com/DamonBao/dsh-codex-suite/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

English | [简体中文](README.md)

A conversation enhancement plugin for DeepSeek Harness (DSH): progressive reveal and auto-expanded thinking augment the native assistant renderer, with deliveries contributed through an independent slot. DSH retains its ChatView, tool cards, Turn controls, and file previews. This is the Conversation UI package of the [DSH Codex Suite](../../README.md) monorepo.

**The package is fully independent from the Codex Provider** and can be installed alone to enhance conversations with any model.

## Features

### Native conversation integration

- Compact, Standard, Detailed, and Verbose work-details modes retain DSH's native grouping, reasoning previews, and process disclosure.
- The native assistant renderer owns Markdown, protected local images, attachments, file mentions, stopped markers, and final-answer actions.
- Tool, retry, workflow, command, and context rows retain their native layout. The plugin only wraps the winning assistant renderer in place, keeping its children, inject, store, and locale; it leaves other rows and portals untouched.

### Two streaming reveal modes

| Mode | Behavior |
| --- | --- |
| `typewriter` (default) | Progressive reveal by grapheme cluster, safe for CJK text and emoji. |
| `teleprompter` | The latest model snapshot appears immediately, with no extra character-reveal queue. |

- Three smoothing presets: `realtime` (snappier), `balanced` (default), `silky` (extra smooth). Presets shape the reveal cadence — EMA-smoothed arrival rate, buffer targets, catch-up ceilings, and the settle drain after the input idles — so long replies never dump whole paragraphs at once and fast streams never stutter.
- `typewriter` mode exposes a fixed reveal rate via `revealCharsPerSec`. When the turn settles, the remaining reveal queue drains at a faster settle rate before switching to the full snapshot; stopped and failed turns use the same drain. Loading history or switching sessions does not replay the animation, and reduced motion shows the full snapshot immediately.

### Streaming viewport cooperation

- Current DSH `ChatView` exclusively owns the running status, per-session restoration, bottom-follow, and reader unpinning. The plugin no longer adds a second waiting row or writes `scrollTop` and row transforms.
- Respects `prefers-reduced-motion` by showing the latest snapshot immediately.

### Deliverables card

- Every finished turn ends with a **deliverables** card: produced files and websites with real added/removed line counts.
- While DSH’s native changed-files card is active (developer tools on and the turn has git changes), files belong to that card, including its diff preview and review; the plugin lists websites only so one turn never shows two file cards.
- Relative and absolute spellings of the same file are merged, so the file is counted once.

### Plugin settings card

- Durable reveal mode (typewriter / teleprompter), smoothing preset (realtime / balanced / silky), reveal speed, and **Auto-expand thinking** controls in *Plugins → DSH Codex Suite (or Conversation UI)*; changes apply live without a restart.
- The card also shows the current version and installation kind (npm / local development); npm installs get a one-click update action (restart required after updating).
- Localized in Chinese and English.

## Install

Published package:

```sh
dsh plugin --profile web add @jcy2387/dsh-conversation-ui@0.2.1-rc.2
dsh web
```

Local development copy:

```sh
dsh plugin --profile web add link:/path/to/dsh-codex-suite/packages/conversation-ui
dsh web
```

Alternatively install the [`@jcy2387/dsh-suite`](../all/README.md) bundle to enable both the Codex Provider and this plugin.

Native assistant enhancement activates automatically; existing session data stays unchanged.

## Configuration

Profile patch ID: `conversation-ui`. The overlay sets deployment defaults (the suite bundle defaults to `mode: typewriter`, `preset: balanced`); `mode`, `preset`, and `revealCharsPerSec` are also live, persistent settings in the plugin card.

| Option | Range | Default | Notes |
| --- | --- | --- | --- |
| `mode` | `typewriter` \| `teleprompter` | `typewriter` | Deployment default reveal style; live-editable in the card. |
| `preset` | `realtime` \| `balanced` \| `silky` | `balanced` | Deployment default smoothing preset; live-editable in the card. |
| `revealCharsPerSec` | 5–200 | `80` | Deployment default reveal rate; live-editable in the card. |
| `scrollSpeedPxPerSec` | 1–200 | `48` | Deprecated; retained for old Profile compatibility. DSH owns scrolling. |
| `maxScrollSpeedPxPerSec` | 1–2000 | `1000` | Deprecated; retained for old Profile compatibility. DSH owns scrolling. |

Overlay example:

```yaml
- id: conversation-ui
  name: '@jcy2387/dsh-conversation-ui'
  config:
    mode: typewriter
    preset: silky
    revealCharsPerSec: 60
```

User preferences such as *Auto-expand thinking* do not go through the overlay: change them in **Plugins → DSH Codex Suite (or Conversation UI)** — they apply immediately and persist across restarts.

### Temporarily disable

The package ships a [`conversation-ui-off.yml`](conversation-ui-off.yml) overlay that disables the plugin (restoring the stock chat renderer) without uninstalling it:

```yaml
- id: conversation-ui
  disabled: true
```

## Architecture

The package ships two halves that cooperate over one very narrow config channel:

- **Host half** (`src/`): a Cordis plugin. It validates the config schema, injects the validated value into every served index HTML (the boot global `window.__DSH_CONVERSATION_UI_CONFIG__`), and registers the user-settings namespace plus a loopback-only settings RPC (read/write preferences, report installation kind, trigger an npm update).
- **Web half** (`src/client/`): wraps the winning `assistant-step` renderer in place in `conversation.chat.node`, preserving its children, inject, store, and locale while adjusting streaming text and native `useDisclosure`. It does not replace `conversation.view` or `turn-process`, or read host DOM. Deliveries use an independent `conversation.chat.turnTail` list entry; settings use `plugins.bundle.config`. Registration follows the slot declaration lifetime; the native entry's child slots, inject, store, and locale stay intact.

### Presentation after upgrading

The old custom tool icons, tool group frames, and process folding styles now use native DSH presentation. Select a work-details mode in DSH; reveal configuration and the persisted Auto-expand thinking preference continue to apply. No session format or credential migration is needed. Delivery cards read persisted Turn data rather than scanning other rows' DOM or hiding native file previews.

## Development

```sh
pnpm --filter @jcy2387/dsh-conversation-ui typecheck
pnpm --filter @jcy2387/dsh-conversation-ui test
pnpm --filter @jcy2387/dsh-conversation-ui build
```

Tests run on vitest + Testing Library, loading the published DSH Chat factory and covering native modes, reasoning disclosure, images, stream reveal, load/unload order, and the settings card (both client and host sides). See the [monorepo README](../../README.md) for workspace-wide commands.

## License

[MIT](LICENSE) © jcy2387

This release targets DSH `0.2.1-rc.2`. It imports `conversation-ui.thinkAutoExpand` from `settings.yaml` or `settings.yaml.imported` into the active profile’s `cordis.patch.yml`, recording a marker after success and retaining the source after failure. The plugin’s compatibility import fills only missing values. Exported `locale/en.json` and `locale/zh.json` localize the name and description in DSH.
