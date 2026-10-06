import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentBranch, currentRemote, pushvoiceConfig } from './git.js';
import { buildMessage } from './message.js';
import { speak, resolveBackend } from './speak.js';
import { pickClip, expandPath, playFile, record, listAudioDevices, AUDIO_EXTENSIONS } from './audio.js';
import { WRAPPER, findBlockRange, installBlock, removeBlock, applyRc } from './rc.js';

const USAGE = `git-push-voice — speaks when you git push

Usage:
  git-push-voice install      Add the git wrapper to your shell rc file
  git-push-voice uninstall    Remove it again
  git-push-voice status       Show install state, backend and config
  git-push-voice preview      Print the message that would be spoken
  git-push-voice say <text>   Speak arbitrary text now
  git-push-voice record       Record your own voice with the microphone
  git-push-voice play <file>  Play an audio file through the same player
  git-push-voice run [args]   Internal: called by the wrapper after a push

Options:
  --rc-file <path>   Override the rc file used by install/uninstall
  --out <path>       record: where to save (default ~/.config/git-push-voice/clip.wav)
  --seconds <n>      record: length in seconds (default 5)
  --device <n>       record: microphone index (see --list-devices)
  --list-devices     record: show available microphones
  --force            Install even if no supported shell was detected
  -h, --help         Show this help

Config (git config --global):
  pushvoice.audio    Your own recording: a file, or a folder of clips picked at random
  pushvoice.text     Message template, e.g. "Shipped {branch} to {remote}"
  pushvoice.voice    Voice name (macOS: say -v ?)
  pushvoice.rate     Words per minute
  pushvoice.muted    "true" to disable speaking
`;

function version() {
	const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
	return JSON.parse(readFileSync(pkgPath, 'utf8')).version;
}

function defaultRcFile() {
	const shell = path.basename(process.env.SHELL ?? '');
	if (shell === 'zsh') return path.join(homedir(), '.zshrc');
	if (shell === 'bash') {
		const mac = process.platform === 'darwin';
		return path.join(homedir(), mac ? '.bash_profile' : '.bashrc');
	}
	if (shell === 'fish') return path.join(homedir(), '.config', 'fish', 'config.fish');
	return null;
}

function parseArgs(argv) {
	const flags = { rcFile: null, force: false, out: null, seconds: null, device: null, listDevices: false, text: [] };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--rc-file') flags.rcFile = argv[++i] ?? null;
		else if (arg === '--out') flags.out = argv[++i] ?? null;
		else if (arg === '--seconds') flags.seconds = Number(argv[++i]);
		else if (arg === '--device') flags.device = Number(argv[++i]);
		else if (arg === '--list-devices') flags.listDevices = true;
		else if (arg === '--force') flags.force = true;
		else if (arg === '-h' || arg === '--help') flags.help = true;
		else if (arg === '--version') flags.version = true;
		else flags.text.push(arg);
	}
	return flags;
}

function config(cwd) {
	return pushvoiceConfig(cwd);
}

function isMuted(cfg) {
	return cfg['pushvoice.muted'] === 'true';
}

function messageFor(cwd, ok = true) {
	const cfg = config(cwd);
	return buildMessage({
		ok,
		branch: currentBranch(cwd),
		remote: currentRemote(cwd, currentBranch(cwd)),
		custom: cfg['pushvoice.text'] ?? null,
	});
}

function rcPathOrDefault(flags) {
	if (flags.rcFile) return flags.rcFile;
	const detected = defaultRcFile();
	if (!detected) {
		throw new Error(
			`Unsupported shell: ${path.basename(process.env.SHELL ?? 'unknown')}. Use --rc-file <path>.`,
		);
	}
	return detected;
}

function cmdInstall(flags) {
	const rcPath = rcPathOrDefault(flags);
	if (process.env.SHELL && path.basename(process.env.SHELL) === 'fish') {
		console.error('fish is not supported yet (its syntax differs). Use --rc-file with a POSIX shell instead.');
		return 1;
	}
	const { changed } = applyRc(rcPath, installBlock);
	if (!changed) console.log(`Already installed in ${rcPath}`);
	else console.log(`Installed git wrapper in ${rcPath}`);
	console.log('Run `source ' + rcPath + '` (or open a new terminal) to activate.');
	return 0;
}

function cmdUninstall(flags) {
	const rcPath = rcPathOrDefault(flags);
	if (!existsSync(rcPath)) {
		console.error(`No rc file at ${rcPath}`);
		return 1;
	}
	const { changed } = applyRc(rcPath, removeBlock);
	console.log(changed ? `Removed git wrapper from ${rcPath}` : `Nothing to remove in ${rcPath}`);
	return 0;
}

function cmdStatus(flags) {
	const rcPath = flags.rcFile ?? defaultRcFile();
	let installed = false;
	if (rcPath && existsSync(rcPath)) {
		installed = findBlockRange(readFileSync(rcPath, 'utf8')) !== null;
	}
	const backend = resolveBackend();
	const cfg = config(process.cwd());
	console.log(`version:      ${version()}`);
	console.log(`rc file:      ${rcPath ?? 'undetected'}`);
	console.log(`installed:    ${installed ? 'yes' : 'no'}`);
	console.log(`tts backend:  ${backend ? backend.name : 'none found'}`);
	console.log(`muted:        ${isMuted(cfg) ? 'yes' : 'no'}`);
	if (cfg['pushvoice.audio']) {
		const clip = ownClip(cfg, process.cwd());
		console.log(`own voice:    ${cfg['pushvoice.audio']}${clip ? '' : '  (not found)'}`);
	}
	if (cfg['pushvoice.text']) console.log(`text:         ${cfg['pushvoice.text']}`);
	if (cfg['pushvoice.voice']) console.log(`voice:         ${cfg['pushvoice.voice']}`);
	if (cfg['pushvoice.rate']) console.log(`rate:          ${cfg['pushvoice.rate']}`);
	return 0;
}

function cmdPreview() {
	console.log(messageFor(process.cwd()));
	return 0;
}

function ownClip(cfg, cwd) {
	const configured = cfg['pushvoice.audio'];
	if (!configured) return null;
	return pickClip(expandPath(configured, cwd));
}

function cmdRecord(flags) {
	if (flags.listDevices) {
		const devices = listAudioDevices();
		if (!devices.length) console.log('No microphones found.');
		for (const device of devices) console.log(`[${device.index}] ${device.name}`);
		return 0;
	}
	const seconds = Number.isFinite(flags.seconds) && flags.seconds > 0 ? flags.seconds : 5;
	const out = expandPath(
		flags.out ?? path.join(homedir(), '.config', 'git-push-voice', 'clip.wav'),
	);
	mkdirSync(path.dirname(out), { recursive: true });

	console.log(`Recording ${seconds}s from your microphone…`);
	const result = record({ out, seconds, device: Number.isFinite(flags.device) ? flags.device : undefined });
	if (!result.ok) {
		console.error(result.error);
		return 1;
	}
	console.log(`Saved ${out}`);
	console.log('Use it with:');
	console.log(`  git config --global pushvoice.audio "${out}"`);
	return 0;
}

function cmdPlay(file, cwd) {
	if (!file) {
		console.error('Usage: git-push-voice play <file>');
		return 1;
	}
	const clip = pickClip(expandPath(file, cwd));
	if (!clip) {
		console.error(`No playable audio at ${file} (supported: ${AUDIO_EXTENSIONS.join(', ')})`);
		return 1;
	}
	return playFile(clip, { wait: true }) ? 0 : 1;
}

function cmdSay(text, cwd) {
	if (!text.length) {
		console.error('Usage: git-push-voice say <text>');
		return 1;
	}
	const cfg = config(cwd);
	if (isMuted(cfg)) return 0;
	const ok = speak(text.join(' '), { voice: cfg['pushvoice.voice'], rate: cfg['pushvoice.rate'], wait: true });
	if (!ok) {
		console.error('No text-to-speech backend available on this system.');
		return 1;
	}
	return 0;
}

function cmdRun(cwd) {
	try {
		const cfg = config(cwd);
		if (isMuted(cfg)) return 0;
		const clip = ownClip(cfg, cwd);
		if (clip) {
			playFile(clip);
			return 0;
		}
		if (cfg['pushvoice.audio']) {
			console.error('git-push-voice: pushvoice.audio set but no playable file found; falling back to voice.');
		}
		speak(messageFor(cwd), { voice: cfg['pushvoice.voice'], rate: cfg['pushvoice.rate'] });
	} catch {
		// never break the user's push flow
	}
	return 0;
}

export function main(argv) {
	const flags = parseArgs(argv);
	if (flags.version) {
		console.log(version());
		return 0;
	}
	const [command, ...rest] = flags.text;
	switch (command) {
		case 'install':
			return cmdInstall(flags);
		case 'uninstall':
			return cmdUninstall(flags);
		case 'status':
			return cmdStatus(flags);
		case 'preview':
			return cmdPreview();
		case 'say':
			return cmdSay(rest, process.cwd());
		case 'record':
			return cmdRecord(flags);
		case 'play':
			return cmdPlay(rest[0], process.cwd());
		case 'run':
			return cmdRun(process.cwd());
		default:
			if (flags.help || !command) {
				console.log(USAGE.trim());
				return command ? 1 : 0;
			}
			console.error(`Unknown command: ${command}\n`);
			console.log(USAGE.trim());
			return 1;
	}
}

export { WRAPPER };
