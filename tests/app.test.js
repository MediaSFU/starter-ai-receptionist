import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createApp } from '../src/app.js';
import { createCallBook, isAuthorizedCallWebhook } from '../src/calls.js';

const env = {
  MEDIASFU_API_USERNAME: 'agencyone',
  MEDIASFU_API_KEY: 'k'.repeat(64),
  CALL_WEBHOOK_TOKEN: 'secure-code-123',
  DASHBOARD_PASSWORD: 'front-desk-pass',
  FORWARD_WEBHOOK_URL: 'https://hooks.example.com/receptionist',
};

async function start(overrides = {}) {
  const forwarded = [];
  const upstream = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url).startsWith('https://hooks.example.com')) {
      forwarded.push(JSON.parse(init.body));
      return new Response('', { status: 200 });
    }
    upstream.push({ url: String(url), init });
    return new Response(JSON.stringify({ success: true, calls: [] }), { status: 200 });
  };
  const app = createApp({ env: { ...env, ...overrides }, fetchImpl });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, forwarded, upstream, close: () => new Promise((r) => server.close(r)) };
}

const staff = { Authorization: `Basic ${Buffer.from('desk:front-desk-pass').toString('base64')}` };
const ended = {
  eventType: 'sip:callStateUpdate',
  sipCallId: 'call-1',
  roomName: 'p1a2b3c4',
  callerIdUser: '15551234567',
  calledDid: '15557654321',
  timestamp: '2026-10-13T18:00:00.000Z',
  currentState: { status: 'terminated', callEnded: true, durationSeconds: 94, direction: 'incoming', agentCreated: true },
};

test('webhook auth accepts the secure code, API key or bearer token only', () => {
  assert.equal(isAuthorizedCallWebhook({ 'x-secure-code': 'secure-code-123' }, 'secure-code-123'), true);
  assert.equal(isAuthorizedCallWebhook({ 'x-api-key': 'secure-code-123' }, 'secure-code-123'), true);
  assert.equal(isAuthorizedCallWebhook({ authorization: 'Bearer secure-code-123' }, 'secure-code-123'), true);
  assert.equal(isAuthorizedCallWebhook({ 'x-secure-code': 'wrong-code-123' }, 'secure-code-123'), false);
  assert.equal(isAuthorizedCallWebhook({ 'x-secure-code': 'short' }, 'short'), false, 'tokens under 8 characters are refused');
  assert.equal(isAuthorizedCallWebhook({}, ''), false);
});

test('the call book merges state and summary into one record per call', () => {
  const book = createCallBook({ limit: 2 });
  assert.equal(book.apply(ended).kind, 'ended');
  const summary = book.apply({ eventType: 'sip:conversationSummary', sipCallId: 'call-1', summary: { content: 'Wants a callback', messageCount: 6 } });
  assert.equal(summary.kind, 'summary');
  assert.equal(book.get('call-1').durationSeconds, 94);
  assert.equal(book.get('call-1').summary, 'Wants a callback');
  book.apply({ ...ended, sipCallId: 'call-2' });
  book.apply({ ...ended, sipCallId: 'call-3' });
  assert.equal(book.get('call-1'), null, 'oldest call is dropped past the limit');
  assert.equal(book.apply({ eventType: 'other', sipCallId: 'x' }), null);
  assert.equal(book.apply({ eventType: 'sip:callStateUpdate' }), null);
});

test('an unauthenticated webhook is rejected and nothing is forwarded', async () => {
  const app = await start();
  try {
    const response = await fetch(`${app.base}/hooks/calls`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ended),
    });
    assert.equal(response.status, 401);
    assert.equal(app.forwarded.length, 0);
  } finally { await app.close(); }
});

test('a finished call is stored, forwarded, and shown to staff only', async () => {
  const app = await start();
  try {
    const hook = await fetch(`${app.base}/hooks/calls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Secure-Code': 'secure-code-123' },
      body: JSON.stringify(ended),
    });
    assert.equal(hook.status, 204);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(app.forwarded.length, 1);
    assert.equal(app.forwarded[0].event, 'receptionist.call_completed');
    assert.equal(app.forwarded[0].call.stage, 'ended');
    assert.equal(app.forwarded[0].call.durationSeconds, 94);

    assert.equal((await fetch(`${app.base}/api/calls`)).status, 401);
    const list = await (await fetch(`${app.base}/api/calls`, { headers: staff })).json();
    assert.equal(list.calls[0].sipCallId, 'call-1');

    const page = await (await fetch(`${app.base}/`, { headers: staff })).text();
    assert.match(page, /15551234567/);
  } finally { await app.close(); }
});

test('call details are HTML-escaped on the dashboard', async () => {
  const app = await start();
  try {
    await fetch(`${app.base}/hooks/calls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Secure-Code': 'secure-code-123' },
      body: JSON.stringify({ ...ended, callerIdUser: '<script>alert(1)</script>' }),
    });
    const page = await (await fetch(`${app.base}/`, { headers: staff })).text();
    assert.doesNotMatch(page, /<script>alert/);
    assert.match(page, /&lt;script&gt;/);
  } finally { await app.close(); }
});

test('the MediaSFU call list is fetched server-side with the API key', async () => {
  const app = await start();
  try {
    const response = await fetch(`${app.base}/api/mediasfu/calls?page=2`, { headers: staff });
    assert.equal(response.status, 200);
    assert.equal(app.upstream[0].url, 'https://mediasfu.com/v1/sipcall/list?page=2&limit=20');
    assert.equal(app.upstream[0].init.headers.Authorization, `Bearer agencyone:${'k'.repeat(64)}`);
  } finally { await app.close(); }
});

test('the dashboard stays locked when no password is configured', async () => {
  const app = await start({ DASHBOARD_PASSWORD: '' });
  try {
    assert.equal((await fetch(`${app.base}/`, { headers: staff })).status, 401);
  } finally { await app.close(); }
});
