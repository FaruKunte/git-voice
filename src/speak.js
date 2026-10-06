import { spawn, spawnSync } from 'node:child_process';

function hasBinary(bin) {
	try {
		const res = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], {
			stdio: 'ignore',
		});
		return res.status === 0;
	} catch {
		return false;
	}
}

function psQuote(text) {
	return `'${text.replaceAll("'", "''")}'`;
}

export function resolveBackend() {
	switch (process.platform) {
		case 'darwin':
			return hasBinary('say') ? { name: 'say', cmd: 'say', args: (text, o) => buildSayArgs(text, o) } : null;
		case 'win32':
			return { name: 'powershell', cmd: 'powershell.exe', args: (text) => psArgs(text) };
		default: {
			for (const bin of ['spd-say', 'espeak-ng', 'espeak', 'festival']) {
				if (hasBinary(bin)) {
					return { name: bin, cmd: bin, args: (text) => [text] };
				}
			}
			return null;
		}
	}
}

function buildSayArgs(text, { voice, rate } = {}) {
	const args = [];
	if (voice) args.push('-v', voice);
	if (rate) args.push('-r', String(rate));
	args.push(text);
	return args;
}

function psArgs(text) {
	const script = [
		'Add-Type -AssemblyName System.Speech;',
		'$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
		`$s.Speak(${psQuote(text)});`,
	].join(' ');
	return ['-NoProfile', '-NonInteractive', '-Command', script];
}

export function speak(text, { voice, rate, wait = false } = {}) {
	if (!text) return false;
	const backend = resolveBackend();
	if (!backend) return false;

	const child = spawn(backend.cmd, backend.args(text, { voice, rate }), {
		stdio: 'ignore',
		detached: !wait,
	});
	child.on('error', () => {});
	if (wait) {
		return new Promise((resolve) => {
			child.on('close', (code) => resolve(code === 0));
		});
	}
	child.unref();
	return true;
}
