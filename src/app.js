import { timingSafeEqual } from 'node:crypto';
import express from 'express';

import { createCallBook, forwardCall, isAuthorizedCallWebhook } from './calls.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createApp({
  env = process.env,
  fetchImpl = fetch,
  callBook = createCallBook(),
} = {}) {
  const app = express();
  app.disable('x-powered-by');

  // Staff pages use HTTP basic auth with DASHBOARD_PASSWORD (any username).
  function requireStaff(req, res, next) {
    const expected = env.DASHBOARD_PASSWORD ?? '';
    const [, encoded = ''] = String(req.headers.authorization ?? '').split(' ');
    const password = Buffer.from(encoded, 'base64').toString('utf8').split(':').slice(1).join(':');
    const ok = expected.length >= 8 && password.length === expected.length &&
      timingSafeEqual(Buffer.from(password), Buffer.from(expected));
    if (ok) return next();
    res.set('WWW-Authenticate', 'Basic realm="receptionist"').status(401).send('Sign in with the dashboard password.');
  }

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  // MediaSFU posts call events here. Set this URL as the number's webhook.
  app.post('/hooks/calls', express.json({ limit: '1mb' }), async (req, res) => {
    if (!isAuthorizedCallWebhook(req.headers, env.CALL_WEBHOOK_TOKEN)) return res.sendStatus(401);
    const change = callBook.apply(req.body);
    res.sendStatus(204);

    // Forward once the call has ended and again when its summary arrives,
    // so your automation can act on the outcome and then the notes.
    if (change && (change.kind === 'ended' || change.kind === 'summary' || change.kind === 'follow-up')) {
      await forwardCall(env.FORWARD_WEBHOOK_URL, { ...change.record, stage: change.kind }, { fetchImpl });
    }
  });

  app.get('/api/calls', requireStaff, (_req, res) => res.json({ calls: callBook.list() }));

  // Calls as MediaSFU records them, for when this server restarted and lost its memory.
  app.get('/api/mediasfu/calls', requireStaff, async (req, res) => {
    const url = new URL('https://mediasfu.com/v1/sipcall/list');
    url.searchParams.set('page', String(Number(req.query.page) || 1));
    url.searchParams.set('limit', '20');
    try {
      const upstream = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${env.MEDIASFU_API_USERNAME}:${env.MEDIASFU_API_KEY}`, Accept: 'application/json' },
      });
      res.status(upstream.status).json(await upstream.json().catch(() => ({})));
    } catch {
      res.status(502).json({ error: 'MediaSFU is unreachable.' });
    }
  });

  app.get('/', requireStaff, (_req, res) => {
    const rows = callBook.list().map((call) => `
      <tr>
        <td>${escapeHtml(call.endedAt ?? call.receivedAt)}</td>
        <td>${escapeHtml(call.caller)}</td>
        <td>${escapeHtml(call.durationSeconds ?? '')}</td>
        <td>${escapeHtml(call.summary ?? (call.endedAt ? 'Summary on its way' : call.status ?? ''))}</td>
        <td>${call.needsFollowUp ? 'Yes' : ''}</td>
      </tr>`).join('');
    res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receptionist calls</title>
<style>
  body{font-family:Inter,system-ui,sans-serif;margin:0;padding:24px;background:#f3f6f9;color:#0b1b2b}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden}
  th,td{padding:10px 12px;border-bottom:1px solid #e3e9ef;text-align:left;font-size:14px;vertical-align:top}
  th{background:#0b1b2b;color:#fff} a{color:#0f766e} .empty{padding:24px;text-align:center;color:#4a5b6c}
  @media(max-width:640px){body{padding:12px}td,th{font-size:12px;padding:8px}}
</style></head><body>
<h1>Receptionist calls</h1>
<p>Calls answered by your AI receptionist since this server started. Each one is also sent to your automation.</p>
<table><thead><tr><th>When</th><th>Caller</th><th>Seconds</th><th>Summary</th><th>Follow up</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5" class="empty">No calls yet. Ring your number to test.</td></tr>'}</tbody></table>
<p><small>Powered by <a href="https://mediasfu.com/?utm_source=tpl-receptionist&utm_medium=template&utm_campaign=growth-2026q4">MediaSFU</a></small></p>
</body></html>`);
  });

  return app;
}

export default createApp();
