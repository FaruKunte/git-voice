import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BEGIN, END, WRAPPER, findBlockRange, installBlock, removeBlock, applyRc } from '../src/rc.js';

function tempRc(content = '') {
	const dir = mkdtempSync(path.join(tmpdir(), 'gpv-'));
	const file = path.join(dir, 'rc');
	writeFileSync(file, content);
	return file;
}

test('block is wrapped in markers', () => {
	assert.ok(WRAPPER.startsWith(BEGIN));
	assert.ok(WRAPPER.endsWith(END));
});

test('install appends to existing content', () => {
	const out = installBlock('export FOO=1\n');
	assert.ok(out.startsWith('export FOO=1\n'));
	assert.ok(out.includes(BEGIN));
});

test('install adds a newline when file has none', () => {
	const out = installBlock('export FOO=1');
	assert.ok(out.startsWith('export FOO=1\n'));
	assert.ok(out.includes(BEGIN));
});

test('install on empty file produces just the block', () => {
	assert.equal(installBlock(''), WRAPPER + '\n');
});

test('install is idempotent', () => {
	const once = installBlock('export FOO=1\n');
	const twice = installBlock(once);
	assert.equal(twice, once);
});

test('install replaces an outdated block', () => {
	const stale = installBlock('export FOO=1\n').replace('command git "$@"', 'command git --old "$@"');
	const updated = installBlock(stale);
	assert.equal(updated, installBlock('export FOO=1\n'));
});

test('removeBlock restores the original file byte for byte', () => {
	const original = 'export FOO=1\nalias ll="ls -la"\n';
	const installed = installBlock(original);
	assert.notEqual(installed, original);
	assert.equal(removeBlock(installed), original);
});

test('removeBlock is a no-op without markers', () => {
	assert.equal(removeBlock('export FOO=1\n'), 'export FOO=1\n');
});

test('findBlockRange returns null when markers missing', () => {
	assert.equal(findBlockRange('nothing here'), null);
});

test('applyRc writes only when content changes', () => {
	const file = tempRc('export FOO=1\n');
	const first = applyRc(file, installBlock);
	assert.equal(first.changed, true);
	assert.equal(readFileSync(file, 'utf8'), first.updated);

	const second = applyRc(file, installBlock);
	assert.equal(second.changed, false);

	const third = applyRc(file, removeBlock);
	assert.equal(third.changed, true);
	assert.equal(readFileSync(file, 'utf8'), 'export FOO=1\n');
});

test('applyRc handles a missing file', () => {
	const file = path.join(path.dirname(tempRc()), 'does-not-exist');
	assert.equal(existsSync(file), false);
	const res = applyRc(file, installBlock);
	assert.equal(res.changed, true);
	assert.ok(existsSync(file));
});
