/**
 * P003 消毒红线验证脚本（独立运行，不进 bun test 套件；happy-dom 全局绑定会挂套件）。
 * 用真实 Izumi「1美化最近2层思维链（流式）」替换串（多行 <style> + 数 KB <script>）
 * 走真实管线：marked → DOMPurify(happy-dom) + registerMarkdownHooks + sanitizeConfig。
 * 运行：bun scripts/p003-sanitize-verify.ts；全 PASS 即红线钉住。
 * 注意：全部 app 导入必须动态；static import 会在 window 武装前求值 dompurify。
 */
import { Window } from 'happy-dom';
import { marked } from 'marked';

const win = new Window();
const G = globalThis as unknown as Record<string, unknown>;
G.window = win;
G.document = win.document;

const { registerMarkdownHooks, sanitizeConfig } = await import('../src/lib/utils/markdown');
const DOMPurifyMod = await import('dompurify');
const DOMPurify = (DOMPurifyMod.default ?? DOMPurifyMod) as (w: unknown) => {
	addHook: (n: string, fn: unknown) => void;
	sanitize: (html: string, cfg: unknown) => string;
};
const purify = DOMPurify(win);
registerMarkdownHooks(purify as never);

delete G.window;
delete G.document;

function render(content: string): string {
	const raw = marked.parse(content, { async: false }) as string;
	return purify.sanitize(raw, sanitizeConfig());
}

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
	if (!ok) failures++;
}

// ---- 1) generic red lines ----
const dirty = [
	'<style>.card { color: red; position: fixed; top: 0; }</style>',
	'<div class="card" onclick="alert(1)">x</div>',
	'<script>window.pwned = 1</script>'
].join('\n');
const clean = render(dirty);
check('script stripped', !clean.includes('<script') && !clean.includes('pwned'));
check('onclick stripped', !clean.includes('onclick'));
check('position:fixed demoted', !clean.toLowerCase().includes('position:fixed') && clean.includes('position:static'));
check('style scoped', clean.includes('.msg-style-scope .card'));

// ---- 2) real Izumi beautify payload (R1 + red lines) ----
const IZUMI = '/Users/trtyr/Downloads/Izumi 0923.json';
const file = Bun.file(IZUMI);
if (!(await file.exists())) {
	console.log('SKIP real-preset sample (file not present)');
} else {
	const raw = (await file.json()) as { extensions?: { regex_scripts?: Array<Record<string, unknown>> } };
	const scripts = raw.extensions?.regex_scripts ?? [];
	const candidates = scripts.filter((r) => String(r.replaceString ?? '').length > 100);
	const rule =
		candidates.find((r) => String(r.scriptName ?? '').includes('流式')) ?? candidates[0];
	if (!rule) {
		console.log('SKIP: beautify rule not found in preset');
	} else {
		const replacement = String(rule.replaceString ?? '');
		console.log(`sample: ${rule.scriptName ?? rule.name} replacement=${replacement.length} chars, blank lines=${(replacement.match(/\n\s*\n/g) ?? []).length}`);
		const html = render(replacement);
		const styleCount = (html.match(/<style>/g) ?? []).length;
		check('R1 multi-line style survives as ONE block', styleCount === 1, `style tags=${styleCount}`);
		check('scoped selectors present', html.includes('.msg-style-scope'));
		check('script from payload stripped', !html.includes('<script'), `script tags=${(html.match(/<script/g) ?? []).length}`);
		check('onclick stripped', !html.includes('onclick'));
		check('position:fixed demoted', !html.toLowerCase().includes('position:fixed'));
		check('styled card structure survives', html.includes('<div'));
	}
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
