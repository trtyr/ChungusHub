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
	'guard.dismissTitle': '收起此栏，该内容将保持关闭'
};
