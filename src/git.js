import { spawnSync } from 'node:child_process';
import path from 'node:path';

export function git(args, cwd = process.cwd()) {
	const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
	if (res.error || res.status !== 0) return null;
	return res.stdout.trim();
}

export function currentBranch(cwd) {
	const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
	return branch && branch !== 'HEAD' ? branch : null;
}

export function currentRemote(cwd, branch) {
	if (branch) {
		const remote = git(['config', `branch.${branch}.remote`], cwd);
		if (remote) return remote;
	}
	const remotes = git(['remote'], cwd);
	if (remotes) {
		const list = remotes
			.split('\n')
			.map((entry) => entry.trim())
			.filter(Boolean);
		if (list.length) return list.includes('origin') ? 'origin' : list[0];
	}
	return 'origin';
}

export function repoName(cwd) {
	const top = git(['rev-parse', '--show-toplevel'], cwd);
	return top ? path.basename(top) : null;
}

export function pushvoiceConfig(cwd) {
	const out = git(['config', '--get-regexp', '^pushvoice\\.'], cwd);
	if (!out) return {};
	const config = {};
	for (const line of out.split('\n')) {
		const idx = line.indexOf(' ');
		if (idx === -1) continue;
		config[line.slice(0, idx)] = line.slice(idx + 1);
	}
	return config;
}
