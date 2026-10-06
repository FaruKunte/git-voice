import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expandPath, pickClip, isAudioFile } from '../src/audio.js';

function workspace() {
	return mkdtempSync(path.join(tmpdir(), 'gpv-audio-'));
}

test('isAudioFile accepts common formats and rejects others', () => {
	assert.equal(isAudioFile('clip.wav'), true);
	assert.equal(isAudioFile('CLIP.MP3'), true);
	assert.equal(isAudioFile('clip.m4a'), true);
	assert.equal(isAudioFile('notes.txt'), false);
	assert.equal(isAudioFile('clip'), false);
});

test('expandPath resolves relative paths against cwd', () => {
	assert.equal(expandPath('clip.wav', '/tmp'), '/tmp/clip.wav');
	assert.equal(expandPath('/abs/clip.wav', '/tmp'), '/abs/clip.wav');
});

test('expandPath expands ~ to the home directory', () => {
	assert.equal(expandPath('~/clip.wav', '/tmp'), path.join(process.env.HOME, 'clip.wav'));
	assert.equal(expandPath('~', '/tmp'), process.env.HOME);
});

test('expandPath returns null for empty input', () => {
	assert.equal(expandPath('', '/tmp'), null);
	assert.equal(expandPath(null, '/tmp'), null);
});

test('pickClip returns a file directly', () => {
	const dir = workspace();
	const file = path.join(dir, 'mine.wav');
	writeFileSync(file, 'x');
	assert.equal(pickClip(file), file);
});

test('pickClip rejects a non-audio file', () => {
	const dir = workspace();
	const file = path.join(dir, 'notes.txt');
	writeFileSync(file, 'x');
	assert.equal(pickClip(file), null);
});

test('pickClip picks a random clip from a folder', () => {
	const dir = workspace();
	for (const name of ['a.wav', 'b.mp3', 'c.m4a']) writeFileSync(path.join(dir, name), 'x');
	writeFileSync(path.join(dir, 'ignore.txt'), 'x');
	const picked = pickClip(dir);
	assert.ok(picked, 'expected a clip');
	assert.ok(['a.wav', 'b.mp3', 'c.m4a'].some((name) => picked.endsWith(name)));
});

test('pickClip returns null for a missing path or empty folder', () => {
	assert.equal(pickClip('/definitely/not/here.wav'), null);
	const dir = workspace();
	mkdirSync(path.join(dir, 'empty'));
	assert.equal(pickClip(path.join(dir, 'empty')), null);
	rmSync(dir, { recursive: true, force: true });
});
