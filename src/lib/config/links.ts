/**
 * Every address in the app that leaves it, in one place.
 *
 * Two surfaces name the same community (the welcome landing and Settings → About) and the
 * bug report is built out of the repo address, so an invite that moves has one place to move
 * in. Nothing here is fetched: these are doors a reader opens, and every call site opens them
 * in a new tab, since the workspace is a live session with unsaved drafts in it.
 */
export const LINKS = {
	repo: 'https://github.com/trtyr/ChungusHub',
	license: 'https://github.com/trtyr/ChungusHub/blob/main/LICENSE',
	/** The addresses here that never leave the machine: the bundled typefaces' own notice, the
	 *  notification sounds' credits and the ambient recordings' notice, each served beside the
	 *  files it covers. A license the app hands the reader has to be readable from an install
	 *  with no internet at all. The two in `static/` are `.txt` because the server hands any
	 *  other extension there over as a download rather than a page. */
	fontLicense: '/fonts/OFL.txt',
	soundCredits: '/sounds/CREDITS.txt',
	soundscapeLicense: '/files/sounds/CREDITS.txt'
} as const;

/**
 * A new issue with the report already shaped and the reader's build already in it. What
 * decides whether a report can be acted on is which version, which build and which browser
 * it came from, and those are exactly the three lines nobody thinks to include.
 */
export function newIssueUrl(environment: string): string {
	const body = `**What happened**\n\n\n**What you expected**\n\n\n**Steps to reproduce**\n\n\n---\n${environment}\n`;
	return `${LINKS.repo}/issues/new?body=${encodeURIComponent(body)}`;
}
