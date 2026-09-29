/**
 * SillyTavern extension-card markers: the SillyTavern Prompt-Template extension
 * dialect (EJS blocks, @INJECT / [GENERATE:*] entry-title syntax) and TavernHelper
 * (JS-Slash-Runner) script-runtime references. See P014 for the survey and P015 for
 * the degrade-compat decision.
 *
 * Detection is read-only (badges, import hints). `stripEjsBlocks` is SEND-SIDE only:
 * assembled prompts get the blocks removed so the model never sees raw template
 * syntax, while every original (message body, lorebook entry, preset item) stays
 * byte-identical. Token pricing runs on unstripped text, so it may over-count a few
 * tokens, the safe direction for budget trimming.
 */

/** EJS scriptlet/expression blocks. `<%%` opens a literal-`<%` escape, not a block,
 *  and a block never ends on `%%>`: the same shapes the SPT extension's own send-side
 *  filter matches (its handler.ts installFilter), so stripping here agrees with what
 *  the author tested against there. */
const EJS_BLOCK_RE = () => /<%(?!%)[\s\S]*?(?<!%)%>/g;

/** SPT entry-title syntax, matched at the start of an entry title/memo line. */
const INJECT_TITLE_RE =
	/^\s*(?:@INJECT\b|\[(?:GENERATE|RENDER)(?::[^\]]*)?\]|\[InitialVariables\]|\[Preprocessing\])/;

/** TavernHelper (JS-Slash-Runner) script-runtime signatures: the global object or
 *  its most distinctive API calls. A card referencing any of these needs the TH
 *  runtime we do not ship (P014 档3), so it degrades the same way but flags
 *  differently in the UI. */
const TAVERN_HELPER_RE = /\bTavernHelper\b|\bgetVariables\s*\(|\btriggerSlash\s*\(/;

export interface StMarkerHits {
	/** EJS template blocks present (SPT dialect). */
	ejs: boolean;
	/** SPT entry-title syntax (@INJECT / [GENERATE:*] / [RENDER:*] / ...). */
	inject: boolean;
	/** `@@if` (or other @@) decorator lines in content: conditional/decorated entries. */
	decorator: boolean;
	/** TavernHelper script-runtime references (可编程卡). */
	tavernHelper: boolean;
}

/** `@@` decorator lines (@@if and friends) anywhere in the content. */
const DECORATOR_LINE_RE = /^[ \t]*@@(?!@)/m;

export function detectStMarkers(text: string): StMarkerHits {
	if (!text) return { ejs: false, inject: false, decorator: false, tavernHelper: false };
	return {
		ejs: /<%(?!%)[\s\S]*?(?<!%)%>/.test(text),
		inject: INJECT_TITLE_RE.test(text),
		decorator: DECORATOR_LINE_RE.test(text),
		tavernHelper: TAVERN_HELPER_RE.test(text)
	};
}

/** True when the text carries any marker we degrade (drives UI hints). */
export function hasStMarkers(text: string): boolean {
	const hits = detectStMarkers(text);
	return hits.ejs || hits.inject || hits.decorator || hits.tavernHelper;
}

/** Remove EJS blocks from send-side text. Titles (@INJECT / [GENERATE:*] ...) are
 *  NOT stripped here: they live in entry titles, which never reach the model. Only
 *  entry CONTENT does, and content arrives as EJS blocks when it has them. Originals
 *  are never modified; this is a pure function over the assembled copy. */
export function stripEjsBlocks(text: string): string {
	if (!text || !text.includes('<%')) return text;
	return text.replace(EJS_BLOCK_RE(), '');
}
