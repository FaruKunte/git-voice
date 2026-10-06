import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage } from '../src/message.js';

test('default success message uses branch and remote', () => {
	assert.equal(buildMessage({ branch: 'feature-revamp', remote: 'origin' }), 'Pushed feature-revamp to origin');
});

test('missing remote falls back to "remote"', () => {
	assert.equal(buildMessage({ branch: 'main' }), 'Pushed main to remote');
});

test('missing branch omits the branch', () => {
	assert.equal(buildMessage({ remote: 'upstream' }), 'Pushed to upstream');
});

test('failure message', () => {
	assert.equal(buildMessage({ ok: false, branch: 'main' }), 'Push failed for main');
});

test('failure message without branch', () => {
	assert.equal(buildMessage({ ok: false }), 'Push failed');
});

test('custom text overrides everything', () => {
	assert.equal(buildMessage({ custom: 'Done', branch: 'main', remote: 'origin' }), 'Done');
});

test('custom text supports placeholders', () => {
	assert.equal(
		buildMessage({ custom: 'Shipped {branch} to {remote}', branch: 'dev', remote: 'origin' }),
		'Shipped dev to origin',
	);
});
