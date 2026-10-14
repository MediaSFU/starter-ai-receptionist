# AI receptionist on your own number (MediaSFU)

An AI receptionist answers your business number, takes messages and books callbacks. Every finished call shows up on a
small dashboard and is sent to your automation (n8n, Make, Zapier or a CRM) with its summary. You bring the phone number
and, if you like, your own AI provider keys; MediaSFU runs the call and the agent.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMediaSFU%2Fstarter-ai-receptionist&env=MEDIASFU_API_USERNAME,MEDIASFU_API_KEY,CALL_WEBHOOK_TOKEN,DASHBOARD_PASSWORD&envDescription=MediaSFU%20API%20username%20and%20key%2C%20your%20number%27s%20secure%20code%2C%20and%20a%20dashboard%20password&envLink=https%3A%2F%2Fmediasfu.com%2Fapi-keys%3Futm_source%3Dtpl-receptionist%26utm_medium%3Dtemplate%26utm_campaign%3Dgrowth-2026q4&project-name=ai-receptionist&repository-name=ai-receptionist)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/MediaSFU/starter-ai-receptionist)
[![Run on Replit](https://replit.com/badge/github/MediaSFU/starter-ai-receptionist)](https://replit.com/github/MediaSFU/starter-ai-receptionist)

## Set it up in 10 minutes

1. **Account and key.** Sign up and create an API key at
   [mediasfu.com/api-keys](https://mediasfu.com/api-keys?utm_source=tpl-receptionist&utm_medium=template&utm_campaign=growth-2026q4).
2. **Deploy this service** with a button above. Set `CALL_WEBHOOK_TOKEN` (8+ characters) and `DASHBOARD_PASSWORD`. Note
   the public URL, for example `https://ai-receptionist.vercel.app`.
3. **Add your number.** In the MediaSFU dashboard, turn on **Telephony Support** in your profile, then open
   **Phone & SIP Setup** and add the number from your SIP provider (Twilio, Telnyx, Plivo and others). Set its
   **secure code** to the same value as `CALL_WEBHOOK_TOKEN` and its **webhook URL** to
   `https://<your service>/hooks/calls`.
4. **Create the agent.** In the **Agents Workspace**, pick the **AI Receptionist** template, set your company and agent names (see
   [`agent/receptionist.md`](agent/receptionist.md), which also has an after-hours version), and attach it to the number.
5. **Call your number.** The receptionist answers. When you hang up, the call appears at `https://<your service>/`
   (sign in with any username and `DASHBOARD_PASSWORD`), and its summary follows a few seconds later.

**Check it works:** `/healthz` returns `{"ok":true}`, and the dashboard lists your test call with its length and summary.

## Send calls to your automation

Set `FORWARD_WEBHOOK_URL` to an n8n Webhook node, a Make custom webhook or a Zapier catch hook. Each call is posted when
it ends and again when the summary is ready, as `{ "event": "receptionist.call_completed", "call": { … } }`. The full
shape is in [`agent/receptionist.md`](agent/receptionist.md).

Using n8n? The MediaSFU community node can also start an outbound agent call and react to room and recording events.

## What runs where

| Piece | Where |
| --- | --- |
| Phone number, call audio, the AI agent, recording, summary | MediaSFU |
| Call webhook receiver, dashboard, forwarding | This service (`src/app.js`) |
| Follow-ups: CRM entry, Slack message, email | Your automation |

This service keeps the last 200 calls in memory, so a restart clears the dashboard. MediaSFU keeps the full call list:
`GET /api/mediasfu/calls` reads it with your API key.

## Common problems

| Symptom | Fix |
| --- | --- |
| Dashboard empty after a call | Check the number's webhook URL ends in `/hooks/calls`, and its secure code equals `CALL_WEBHOOK_TOKEN` |
| Webhook returns 401 | The secure code and `CALL_WEBHOOK_TOKEN` differ, or the token is under 8 characters |
| Call rings but nobody answers | Attach the agent to the number in **Agents**, and make sure the number's SIP config is active |
| Summary never arrives | Summaries need an AI provider; use MediaSFU-managed AI or add your keys under **AI Credentials** |

## Learn more

- [AI agents and phone calls over HTTP](https://mediasfu.com/docs/usage/llm-reference?utm_source=tpl-receptionist&utm_medium=template&utm_campaign=growth-2026q4#ai-agents-and-phone-calls)
- [Hand a live call to a person](https://mediasfu.com/docs/operations/ai-call-control-http?utm_source=tpl-receptionist&utm_medium=template&utm_campaign=growth-2026q4)
- [Pricing](https://mediasfu.com/pricing?utm_source=tpl-receptionist&utm_medium=template&utm_campaign=growth-2026q4)

MIT licensed.
