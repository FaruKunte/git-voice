export function buildMessage({ ok = true, branch = null, remote = null, custom = null } = {}) {
	if (custom) {
		return custom
			.replaceAll('{branch}', branch ?? '')
			.replaceAll('{remote}', remote ?? '')
			.replaceAll('{repo}', '');
	}
	if (!ok) {
		return branch ? `Push failed for ${branch}` : 'Push failed';
	}
	const destination = remote ?? 'remote';
	return branch ? `Pushed ${branch} to ${destination}` : `Pushed to ${destination}`;
}
