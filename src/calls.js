import { timingSafeEqual } from 'node:crypto';

// MediaSFU call webhooks carry the number's secure code in X-Secure-Code by
// default, or the API key / bearer token you set as the number's webhook auth.
export function isAuthorizedCallWebhook(headers, expected) {
  if (!expected || expected.length < 8) return false;
  const bearer = String(headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const candidates = [headers['x-secure-code'], headers['x-api-key'], bearer].filter(Boolean).map(String);
  return candidates.some((value) => value.length === expected.length &&
    timingSafeEqual(Buffer.from(value), Buffer.from(expected)));
}

// Turns MediaSFU's call events into one "call finished" record per call:
// sip:callStateUpdate tells us when it ended and how long it took;
// sip:conversationSummary brings the summary and transcript.
export function createCallBook({ limit = 200 } = {}) {
  const calls = new Map();

  function upsert(sipCallId, fields) {
    const current = calls.get(sipCallId) ?? { sipCallId, receivedAt: new Date().toISOString() };
    const next = { ...current, ...fields };
    calls.delete(sipCallId);
    calls.set(sipCallId, next);
    while (calls.size > limit) calls.delete(calls.keys().next().value);
    return next;
  }

  function apply(event) {
    if (!event || typeof event.sipCallId !== 'string' || !event.sipCallId) return null;
    const base = {
      roomName: event.roomName ?? null,
      caller: event.callerIdUser ?? null,
      calledNumber: event.calledDid ?? null,
    };

    if (event.eventType === 'sip:callStateUpdate') {
      const state = event.currentState ?? {};
      const ended = state.callEnded === true;
      const record = upsert(event.sipCallId, {
        ...base,
        status: state.status ?? null,
        direction: state.direction ?? null,
        durationSeconds: state.durationSeconds ?? null,
        agentAnswered: state.agentCreated === true,
        ...(ended ? { endedAt: event.timestamp ?? new Date().toISOString() } : {}),
      });
      return ended ? { kind: 'ended', record } : { kind: 'update', record };
    }

    if (event.eventType === 'sip:conversationSummary') {
      const record = upsert(event.sipCallId, {
        ...base,
        summary: event.summary?.content ?? null,
        messageCount: event.summary?.messageCount ?? null,
      });
      return { kind: 'summary', record };
    }

    if (event.eventType === 'sip:callbackRequested' || event.eventType === 'sip:humanInterventionRequired') {
      const record = upsert(event.sipCallId, { ...base, needsFollowUp: event.eventType });
      return { kind: 'follow-up', record };
    }

    return null;
  }

  return {
    apply,
    list: () => [...calls.values()].reverse(),
    get: (id) => calls.get(id) ?? null,
  };
}

// Sends a finished call to your automation (n8n, Make, Zapier catch hook, CRM).
export async function forwardCall(url, record, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  if (!url) return { forwarded: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'receptionist.call_completed', call: record }),
      signal: controller.signal,
    });
    return { forwarded: response.ok, status: response.status };
  } catch (error) {
    return { forwarded: false, error: error.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
