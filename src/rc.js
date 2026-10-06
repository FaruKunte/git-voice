import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const BEGIN = '# >>> git-push-voice >>>';
export const END = '# <<< git-push-voice <<<';

export const WRAPPER = `${BEGIN}
git() {
	command git "$@"
	local __gpv_status=$?
	if [ $__gpv_status -eq 0 ] && [ "$1" = "push" ] && command -v git-push-voice >/dev/null 2>&1; then
		command git-push-voice run "$@"
	fi
	return $__gpv_status
}
${END}`;

export function findBlockRange(content) {
	const start = content.indexOf(BEGIN);
	if (start === -1) return null;
	const end = content.indexOf(END, start);
	if (end === -1) return null;
	return { start, end: end + END.length };
}

export function installBlock(content, block = WRAPPER) {
	const range = findBlockRange(content);
	if (range) {
		return content.slice(0, range.start) + block + content.slice(range.end);
	}
	if (!content) return block + '\n';
	const separator = content.endsWith('\n') ? '' : '\n';
	return content + separator + block + '\n';
}

export function removeBlock(content) {
	const range = findBlockRange(content);
	if (!range) return content;
	let before = content.slice(0, range.start);
	let after = content.slice(range.end);
	if (after.startsWith('\n')) after = after.slice(1);
	if (before.endsWith('\n\n')) before = before.slice(0, -1);
	return before + after;
}

export function applyRc(rcPath, mutate) {
	const original = existsSync(rcPath) ? readFileSync(rcPath, 'utf8') : '';
	const updated = mutate(original);
	if (updated !== original) writeFileSync(rcPath, updated);
	return { original, updated, changed: updated !== original };
}
