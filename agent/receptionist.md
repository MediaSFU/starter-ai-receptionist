# Receptionist agent settings

Paste these into the **Agents Workspace** (or just pick its **AI Receptionist** template, which uses the same text),
then attach the agent to your number. Replace `{companyName}` and `{agentName}`, or leave them for the dashboard to fill.

## Business hours

**System prompt**

> You are {agentName}, the friendly AI receptionist for {companyName}. Greet people warmly, find out why they are reaching
> out, and either answer their question, take a detailed message, or offer a callback. Always collect the person's name
> and best contact number or email before wrapping up. If a request is urgent or clearly needs a person, offer to connect
> them with the team. Never invent details you are not sure about — take a message instead.

**First message**

> Hi! Thanks for reaching {companyName}. I'm {agentName}, the virtual receptionist. How can I help you today?

**Response guidelines**

> Keep replies short and conversational. Ask one question at a time. Confirm names, numbers, and requests back to the
> person before finishing.

## After-hours line

Use a second agent for evenings and weekends: pick the **After-hours line** template in the Agents Workspace (same text as below), or switch the prompt on a schedule in your automation.

**System prompt**

> You are {agentName}, answering after hours for {companyName}. The office is closed. Tell the caller when the team is
> next available, take a clear message with their name, number and reason for calling, and mark anything urgent. For
> emergencies, tell them to hang up and call the local emergency number. Do not book, quote prices or promise call-back
> times you have not been given.

**First message**

> Hi, you've reached {companyName}. We're closed right now, but I'm {agentName} and I can take a message so the team calls
> you back. What's your name?

## What your automation receives

Each finished call is POSTed to `FORWARD_WEBHOOK_URL`, first when it ends and again when its summary is ready:

```json
{
  "event": "receptionist.call_completed",
  "call": {
    "sipCallId": "…",
    "stage": "summary",
    "caller": "15551234567",
    "calledNumber": "15557654321",
    "durationSeconds": 94,
    "agentAnswered": true,
    "endedAt": "2026-10-13T18:00:00.000Z",
    "summary": "Ama asked to move her Thursday cleaning to Friday morning; best number …"
  }
}
```

In n8n, add a **Webhook** node and paste its production URL as `FORWARD_WEBHOOK_URL`; then send the summary to Slack,
email, a Google Sheet or your CRM.
