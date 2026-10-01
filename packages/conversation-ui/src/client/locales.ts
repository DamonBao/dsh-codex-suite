/** Locale bundles for the conversation-ui plugin configuration card. */

/** Dictionary namespace owned by this plugin's settings card. */
export const NS = 'settings.conversationUi'

/** Locale keys the card renders. */
export type ConversationLocaleKey =
  | 'title' | 'description'
  | 'thinkAutoExpand' | 'thinkAutoExpandHint'
  | 'readOnly' | 'loading' | 'unavailable' | 'retry'
  | 'version' | 'developmentVersion'
  | 'updates' | 'updateHint' | 'developmentBuild' | 'updateUnavailable'
  | 'update' | 'updating' | 'restartRequired' | 'updateFailed'
  | 'deliveriesFiles' | 'deliveriesWebsites' | 'deliveriesItems'
  | 'deliveriesEdited' | 'deliveriesWebsitesCount' | 'deliveriesCount'
  | 'deliveriesViewChanges' | 'deliveriesOpenWebsite' | 'deliveriesMore' | 'deliveriesCollapse'
  | 'save' | 'saving' | 'discard' | 'unsaved' | 'saveFailed'

/** English copy. */
export const en: Record<ConversationLocaleKey, string> = {
  title: 'Conversation UI',
  description: 'Assistant reveal and deliveries using the native DSH conversation UI.',
  thinkAutoExpand: 'Auto-expand thinking',
  thinkAutoExpandHint: 'Open the thinking block while it streams. Turn off to keep it collapsed.',
  readOnly: 'This deployment stores settings read-only.',
  loading: 'Loading plugin settings…',
  unavailable: 'Plugin settings are unavailable in this connection.',
  retry: 'Retry',
  version: 'Version {version}',
  developmentVersion: 'Development version {version}',
  updates: 'Updates',
  updateHint: 'Install the newest npm version, then restart Harness.',
  developmentBuild: 'Linked source; updates are managed in the checkout.',
  updateUnavailable: 'Updates are available only for an npm profile installation.',
  update: 'Update',
  updating: 'Updating…',
  restartRequired: 'Updated. Restart Harness to load the new version.',
  updateFailed: 'The package update failed; your current version is unchanged.',
  deliveriesFiles: 'files',
  deliveriesWebsites: 'websites',
  deliveriesItems: 'items',
  deliveriesEdited: 'Edited {count} files',
  deliveriesWebsitesCount: 'Delivered {count} websites',
  deliveriesCount: 'Delivered {count} items',
  deliveriesViewChanges: 'View changes',
  deliveriesOpenWebsite: 'Open website',
  deliveriesMore: 'Show {count} more {kind}',
  deliveriesCollapse: 'Collapse',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  unsaved: 'Unsaved',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
}

/** Simplified Chinese copy. */
export const zh: Record<ConversationLocaleKey, string> = {
  title: '对话界面增强',
  description: '在 DSH 原生对话界面中增强助手揭示和产物展示。',
  thinkAutoExpand: '自动展开思考',
  thinkAutoExpandHint: '思考块在流式时自动展开；关闭后保持折叠，可手动展开。',
  readOnly: '本部署的设置为只读。',
  loading: '正在加载插件设置…',
  unavailable: '当前连接无法访问插件设置。',
  retry: '重试',
  version: '版本 {version}',
  developmentVersion: '开发版本 {version}',
  updates: '更新',
  updateHint: '安装最新 npm 版本后重启 Harness。',
  developmentBuild: '当前为本地链接版本，请在源码目录管理更新。',
  updateUnavailable: '只有 profile 使用 npm 包时才能更新。',
  update: '更新',
  updating: '更新中…',
  restartRequired: '已更新；重启 Harness 后加载新版本。',
  updateFailed: '包更新失败，当前版本未改变。',
  deliveriesFiles: '文件',
  deliveriesWebsites: '网站',
  deliveriesItems: '产物',
  deliveriesEdited: '已编辑 {count} 个文件',
  deliveriesWebsitesCount: '交付 {count} 个网站',
  deliveriesCount: '已交付 {count} 项产物',
  deliveriesViewChanges: '查看更改',
  deliveriesOpenWebsite: '打开网站',
  deliveriesMore: '再显示 {count} 个{kind}',
  deliveriesCollapse: '收起',
  save: '保存',
  saving: '保存中…',
  discard: '放弃修改',
  unsaved: '未保存',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.conversationUi': ConversationLocaleKey
  }
}
