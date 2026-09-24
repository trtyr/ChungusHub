/**
 * Chinese UI dictionary.
 *
 * Flat dotted keys, one string per user-visible text. The en dictionary is the
 * reference corpus: every key here should also exist there. Placeholders use
 * {name} and are filled by i18n.t(). Keep keys grouped by component domain so
 * the two dictionaries stay diff-friendly.
 */
export const zh: Record<string, string> = {
	'connection.lost': '与服务器的连接已断开，现在输入的内容不会被保存。',
	'connection.retrying': '正在重新连接…',

	// layout · DataAheadBar
	'dataahead.message': '这些数据最近被更新版的 ChungusHub 使用过，继续用旧版写入可能会损坏数据。',
	'dataahead.update': '更新此副本。',

	// layout · ImportBar
	'import.running': '正在导入 SillyTavern 数据',
	'common.stop': '停止',

	// layout · DeleteGuardBar
	'guard.minutesLeft': '剩余 {mins} 分钟',
	'guard.underMinute': '不足一分钟',
	'guard.restore': '恢复',
	'guard.dismissAria': '关闭',
	'guard.dismissTitle': '收起此栏，该内容将保持关闭',

	// layout · WelcomeDialog
	'welcome.title.hello': '欢迎来到 ChungusHub',
	'welcome.title.persona': '你是谁？',
	'welcome.lede': '谢谢你试用 ChungusHub。我最初只为自己做这个项目，后来它大到值得分享：也许会有几个和我一样的人喜欢它。',
	'welcome.importNote': '带着 SillyTavern 的配置来的？设置 → 导入 可以一次性读入整个文件夹：角色、用户角色、世界书、聊天和背景图。',
	'welcome.getStarted': '开始使用',
	'welcome.personaLede': '用户角色（Persona）就是故事里的你。现在起一个名字，每次聊天都会以它开始；以后可以在资料库里继续完善。',
	'welcome.nameLabel': '名字',
	'welcome.namePlaceholder': '故事中怎么称呼你',
	'welcome.aboutLabel': '关于你',
	'common.optional': '可选',
	'welcome.aboutPlaceholder': '外貌、气质、举手投足的样子…',
	'welcome.createPersona': '创建用户角色',

	// layout · TitleBar
	'nav.presetControls': '预设控制',
	'nav.storymap': '故事地图',
	'nav.memory': '记忆',
	'titlebar.settings': '设置',
	'titlebar.closeSettings': '关闭设置（{key}）',
	'titlebar.openSettings': '设置（{key}）',
	'common.pinned': '已固定，点击取消固定',
	'common.pinOpen': '固定打开（点击其他区域或其他面板不会将其收起）',
	'titlebar.library': '资料库',
	'titlebar.closeLibrary': '关闭资料库（{key}）',
	'titlebar.openLibrary': '资料库（{key}）'
};
