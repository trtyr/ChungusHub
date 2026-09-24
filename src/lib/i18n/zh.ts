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
	'titlebar.openLibrary': '资料库（{key}）',

	// layout · AppShell 启动状态卡
	'launch.unreachableTitle': '无法连接服务器',
	'launch.unreachableCopy': '请确认 ChungusHub 仍在运行，并保持本页打开。正在重试…',
	'launch.waitingTitle': '正在等待服务器',
	'launch.waitingCopy': '启动中。本页会自动打开。',
	'launch.preparingTitle': '正在准备工作区',
	'launch.preparingCopy': '正在加载聊天、预设、服务商与界面状态。',
	'launch.errorTitle': '初始化出错',
	'launch.retry': '重试启动',
	'launch.deniedTitle': '访问被拒绝',
	'launch.deniedCopy': '此设备不在白名单中。请主机在 设置 → 安全 里放行其 IP。',

	// layout · WelcomeView 落地页
	'welcome.eyebrow': '故事工作区',
	'welcome.newChat': '新聊天',
	'welcome.chats': '聊天',
	'welcome.yourStats': '你的统计',
	'welcome.recentAria': '最近的聊天',
	'welcome.continue': '继续',
	'welcome.allChats': '全部聊天',
	'welcome.showLess': '收起',
	'welcome.showMore': '展开更多',
	'welcome.emptyChats': '还没有聊天',
	'common.community': '社区',
	'welcome.asPersona': '扮演：{name}',

	// storymap · Inspector
	'storymap.inspAria': '回合详情',
	'storymap.turn': '回合 {n}',
	'storymap.youAreHere': '你在这里',
	'storymap.canon': '正典',
	'storymap.inMemory': '已入记忆',
	'common.closeDetails': '关闭详情',
	'storymap.variantOf': '变体 {n} / {total}',
	'storymap.images': '{n} 张图片',
	'storymap.branchesBelow': '下方 {n} 条分支',
	'storymap.tokens': '{n} token',
	'storymap.openInChat': '在聊天中打开',
	'storymap.canonClearTitle': '清除正典标记',
	'storymap.canonSetTitle': '将此时间线定为正典',
	'storymap.canonUnset': '取消正典',
	'storymap.canonMake': '设为正典',
	'storymap.compareTitle': '将此分支与另一条分支对比',
	'storymap.compare': '对比…',
	'storymap.branchName': '分支名',
	'storymap.branchNamePlaceholder': '例如：黑暗结局',
	'storymap.branchColor': '分支颜色',
	'common.save': '保存',
	'common.remove': '移除'
};
