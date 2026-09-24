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
	'connection.retrying': '正在重新连接…'
};
