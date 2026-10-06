import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.aiff', '.aac', '.ogg', '.flac', '.opus'];

export function isAudioFile(file) {
	return AUDIO_EXTENSIONS.includes(path.extname(file).toLowerCase());
}

export function expandPath(value, cwd = process.cwd()) {
	if (!value) return null;
	let expanded = value;
	if (expanded === '~' || expanded.startsWith('~/')) {
		expanded = path.join(process.env.HOME ?? '', expanded.slice(1));
	}

	return path.resolve(cwd, expanded);
}

export function pickClip(target) {
	if (!target || !existsSync(target)) return null;
	const stat = statSync(target);
	if (stat.isFile()) return isAudioFile(target) ? target : null;
	if (stat.isDirectory()) {
		const clips = readdirSync(target)
			.filter((name) => isAudioFile(name))
			.map((name) => path.join(target, name));
		if (!clips.length) return null;
		return clips[Math.floor(Math.random() * clips.length)];
	}
	return null;
}

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

function playerCommand(file) {
	switch (process.platform) {
		case 'darwin':
			return hasBinary('afplay') ? { cmd: 'afplay', args: [file] } : null;
		case 'win32':
			return {
				cmd: 'powershell.exe',
				args: ['-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${file.replaceAll("'", "''")}').PlaySync()`],
			};
		default: {
			if (hasBinary('paplay')) return { cmd: 'paplay', args: [file] };
			if (hasBinary('ffplay')) return { cmd: 'ffplay', args: ['-nodisp', '-autoexit', '-loglevel', 'quiet', file] };
			if (hasBinary('mpg123')) return { cmd: 'mpg123', args: ['-q', file] };
			if (hasBinary('aplay')) return { cmd: 'aplay', args: ['-q', file] };
			return null;
		}
	}
}

export function playFile(file, { wait = false } = {}) {
	const player = playerCommand(file);
	if (!player) return false;
	const child = spawn(player.cmd, player.args, { stdio: 'ignore', detached: !wait });
	child.on('error', () => {});
	if (wait) {
		return new Promise((resolve) => {
			child.on('close', (code) => resolve(code === 0));
		});
	}
	child.unref();
	return true;
}

function ffmpegBin() {
	return hasBinary('ffmpeg') ? 'ffmpeg' : null;
}

export function listAudioDevices() {
	const ffmpeg = ffmpegBin();
	if (!ffmpeg) return [];
	const res = spawnSync(ffmpeg, ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''], {
		encoding: 'utf8',
	});
	const devices = [];
	let inAudioSection = false;
	for (const line of (res.stderr ?? '').split('\n')) {
		if (/AVFoundation audio devices/i.test(line)) {
			inAudioSection = true;
			continue;
		}
		if (/AVFoundation video devices/i.test(line)) inAudioSection = false;
		if (!inAudioSection) continue;
		const match = line.match(/\[(\d+)\]\s+(.+)$/);
		if (match) devices.push({ index: Number(match[1]), name: match[2].trim() });
	}
	return devices;
}

export function record({ out, seconds, device }) {
	const ffmpeg = ffmpegBin();
	if (!ffmpeg) return { ok: false, error: 'ffmpeg not found. Install it with: brew install ffmpeg' };

	let index = device;
	if (index === undefined) {
		const devices = listAudioDevices();
		if (!devices.length) {
			return { ok: false, error: 'No microphone found (avfoundation listed no audio devices).' };
		}
		index = devices[0].index;
	}

	const args = ['-y', '-f', 'avfoundation', '-i', `:${index}`, '-t', String(seconds), '-ar', '22050', '-ac', '1', out];
	const res = spawnSync(ffmpeg, args, { encoding: 'utf8' });
	if (res.status !== 0) {
		return { ok: false, error: (res.stderr ?? '').split('\n').filter(Boolean).slice(-3).join('\n') };
	}
	if (!existsSync(out)) return { ok: false, error: 'Recording produced no file.' };
	return { ok: true, out, device: index };
}
