/**
 * Runtime label translation for store/config-sourced option labels (sort orders, sound
 * names, approval modes). These live as English strings in stores that must stay
 * server-safe, so the client translates at render time instead of keyifying the store.
 * Unknown labels pass through unchanged.
 */
import { i18n } from './i18n.svelte';

const ZH: Record<string, string> = {
	'Getting around': '移动',
	'Alert': '提醒',
	'Bell': '铃铛',
	'Blip': '哔声',
	'Complete': '完成',
	'Confirm': '确认',
	'Fanfare': '号角',
	'Message': '消息',
	'Pop': '气泡',
	'Success': '成功',
	'A reply finished': '一条回复已完成',
	'The assistant finished': '助手已完成',
	'The assistant needs an answer': '助手需要回答',
	'Something failed': '出了点问题',
	'A → Z': 'A → Z',
	'Z → A': 'Z → A',
	'Newest': '最新',
	'Oldest': '最早',
	'Recently edited': '最近编辑',
	'Most entries': '条目最多',
	'Fewest entries': '条目最少',
	'Most keys': '关键词最多',
	'Fewest keys': '关键词最少',
	'Longest': '最长',
	'Shortest': '最短',
	'Order': '顺序',
	'Reverse order': '倒序',
	'Upload order': '上传顺序',
	'Manual': '手动',
	'Auto': '自动',
	'Always': '总是',
	'Off': '关',
	'On': '开',
	'Nothing linked yet': '还没有关联',
	'Save as character…': '存为角色…',
	'Save as persona…': '存为用户角色…',
	'Raw': '原始',
	'Expanded': '展开',
	'System': '系统',
	'Connected': '已连接',
	'Device Access': '设备访问',
	'Waiting': '等待中',
	'Allow': '允许',
	'Allowed': '已允许',
	'Text on the workspace': '工作区上的文字',
	'Secondary text': '次要文字',
	'Muted text': '弱化文字',
	'Text on panels': '面板上的文字',
	'Text on your turn': '你的回合上的文字',
	'Text on their turn': '对方回合上的文字'
};

/** Translate a store-sourced label into the active language; unknown labels pass through. */
export function labelT(label: string): string {
	if (i18n.lang !== 'zh') return label;
	return ZH[label] ?? label;
}
