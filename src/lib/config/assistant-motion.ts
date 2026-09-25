/**
 * Tool → kind of work, plus what the activity line says about it.
 *
 * The assistant panel carries ONE live element per turn: the activity line at the bottom
 * of the running turn (AssistantActivityLine.svelte). Its head is what is happening now
 * (a family motion while a call is in flight, the ellipsis while the model itself is
 * working) and its phrases come from the map below. Everything above that line is content: settled
 * actions, the streaming reply, the reasoning block, and the running call's own row, which
 * wears the same static icon it will keep once its result lands.
 *
 * The families are the ones `TOOL_ICONS` already groups tools into
 * (AssistantTurnTimeline.svelte). This map is the animated half of that grouping.
 *
 * A phrase is only ever shown while its work is genuinely IN FLIGHT, which is what lets it
 * describe the work instead of guessing at it: "going through the stack" during a running
 * `search_chats` is a plain description. The moment the result lands the line moves to the
 * waiting phase, because a phrase that outlived its call would claim work that had already
 * finished, and a fast tool spends far longer waiting than working, so that stale claim
 * would be the state the user mostly sees.
 *
 * Two rules the phrases keep. They never name a subsystem the assistant may not have
 * touched (a literal-sounding "consulting the lorebook" is a coin flip). And they never
 * predict: "almost done" is a promise a turn on its fourth of fifty steps cannot keep.
 *
 * A tool with no entry falls back to `idle`, exactly like a missing icon falls back:
 * cosmetic only, never a crash. Adding a capability with a new KIND of work means one line
 * here, one phrase list, and one glyph in AssistantWorkMotion.svelte.
 */

export type WorkMotion =
	| 'sift'
	| 'read'
	| 'write'
	| 'make'
	| 'cut'
	| 'bind'
	| 'look'
	| 'go'
	| 'idle';

const TOOL_MOTIONS: Record<string, WorkMotion> = {
	// Hunting through a pile of candidates.
	find_entities: 'sift',
	search_chats: 'sift',
	list_chats: 'sift',
	read_prompt_log: 'sift',
	search_file: 'sift',
	list_files: 'sift',

	// Taking one thing in whole.
	read_entity: 'read',
	read_chat_messages: 'read',
	read_chat_context: 'read',
	read_file: 'read',
	read_memory_state: 'read',
	edit_memory_episode: 'write',
	read_character_versions: 'read',
	read_lorebook_entries: 'read',
	read_prompt_entry: 'read',
	read_connection_state: 'read',

	// Rewriting something that already exists.
	edit_entity: 'write',
	set_entity: 'write',
	update_entities: 'write',
	edit_lorebook_entry: 'write',
	manage_greetings: 'write',
	manage_character_versions: 'write',
	rename_chat: 'write',

	// Something new arriving.
	create_entity: 'make',
	create_lorebook_entry: 'make',
	create_chat: 'make',

	// Taking something off the page.
	delete_entity: 'cut',
	delete_lorebook_entry: 'cut',

	// Attaching one thing to another.
	manage_entry_lorebooks: 'bind',
	set_active_persona: 'bind',
	add_steering: 'bind',

	// Looking at art.
	view_character_images: 'look',
	edit_character_images: 'look',

	// Moving the user's own screen.
	navigate: 'go'
};

/** The kind of work a tool does; `idle` for anything unmapped. */
export function motionFor(tool: string): WorkMotion {
	return TOOL_MOTIONS[tool] ?? 'idle';
}

/**
 * What the activity line says, per family. `write` serves both a running edit and the
 * assistant's own reply arriving: both are prose being written, so the cursive and the
 * phrases fit either. `idle` is the waiting set: it answers the question a wait actually
 * raises, "is this stuck?", by naming who it belongs to.
 */
export const WORK_WORDS: Record<WorkMotion, string[]> = {
	sift: ['asm.wwSift0', 'asm.wwSift1', 'asm.wwSift2', 'asm.wwSift3'],
	read: ['asm.wwRead0', 'asm.wwRead1', 'asm.wwRead2', 'asm.wwRead3'],
	write: ['asm.wwWrite0', 'asm.wwWrite1', 'asm.wwWrite2', 'asm.wwWrite3'],
	make: ['asm.wwMake0', 'asm.wwMake1', 'asm.wwMake2'],
	cut: ['asm.wwCut0', 'asm.wwCut1', 'asm.wwCut2'],
	bind: ['asm.wwBind0', 'asm.wwBind1', 'asm.wwBind2'],
	look: ['asm.wwLook0', 'asm.wwLook1', 'asm.wwLook2'],
	go: ['asm.wwGo0', 'asm.wwGo1', 'asm.wwGo2'],
	idle: ['asm.wwIdle0', 'asm.wwIdle1', 'asm.wwIdle2', 'asm.wwIdle3', 'asm.wwIdle4'],
};
