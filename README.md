# Bridgy

Bridgy is a simple two-way WhatsApp-to-SMS bridge for dumb phone users.

Problem: dumb phone users still want to communicate with loved ones and others over WhatsApp, but they do not have hardware that can comfortably run WhatsApp. Bridgy lets users send and receive WhatsApp messages over SMS.

## Current MVP

This repo is a Bun + TypeScript implementation of the phased MVP plan:

1. WhatsApp smoke test with Baileys.
2. Tiny setup page for linking WhatsApp.
3. Quo SMS webhook loop.
4. One-user bridge.
5. Short-link onboarding.
6. Multi-user isolation by SMS phone number.
7. Aliases and plain-text replies.
8. Docker/Railway-style deployment with persistent storage.

The MVP is text-only. It assumes users already have WhatsApp accounts they can link once.

Cloudflare is used as the public edge/tunnel for `bridgy.chat`. The app itself should run as a long-lived Bun process with persistent disk because Baileys needs WebSocket connections and WhatsApp session files. Cloudflare Workers/Wrangler are not the current target runtime for the WhatsApp bridge process.

## Current Dev Runbook

Install dependencies:

```sh
bun install
```

Copy environment values:

```sh
cp .env.example .env
```

For the normal local dev setup behind the named Cloudflare Tunnel, `.env` should include:

```sh
PUBLIC_BASE_URL=https://bridgy.chat
PORT=3000
DATA_DIR=./data
QUO_API_KEY=...
QUO_FROM=PN...
QUO_WEBHOOK_ID=...
QUO_WEBHOOK_KEY=whsec_...
SMS_DRY_RUN=false
```

Do not commit `.env`; it contains Quo secrets.

Run the app:

```sh
bun run dev
```

In another terminal, run the named tunnel:

```sh
cloudflared tunnel --config deploy/cloudflared.local.yml run bridgy-dev
```

Verify the public URL reaches the local Bun server:

```sh
curl https://bridgy.chat/health
```

Expected response:

```json
{"ok":true}
```

Open the setup smoke page:

```text
https://bridgy.chat/setup/test
```

By default, `/setup/test` displays `test user` instead of a fake SMS number. Set `BRIDGY_TEST_SMS_PHONE=+1...` if you want that page tied to a specific local test number.

## Cloudflare Tunnel

The stable development path is a named Cloudflare Tunnel for `bridgy.chat`.

Install and authenticate `cloudflared`:

```sh
cloudflared tunnel login
```

Create the tunnel once:

```sh
cloudflared tunnel create bridgy-dev
```

Create a local config from the example:

```sh
cp deploy/cloudflared.example.yml deploy/cloudflared.local.yml
```

Fill in the tunnel id and credentials path. The local file is ignored by git.

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /Users/YOU/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: bridgy.chat
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Create the DNS route once:

```sh
cloudflared tunnel route dns bridgy-dev bridgy.chat
```

Then start the tunnel when developing:

```sh
cloudflared tunnel --config deploy/cloudflared.local.yml run bridgy-dev
```

### Where The Tunnel ID And Credentials Come From

Create them with `cloudflared` while logged into the Cloudflare account for `bridgy.chat`:

```sh
cloudflared tunnel login
cloudflared tunnel create bridgy-dev
cloudflared tunnel route dns bridgy-dev bridgy.chat
```

`cloudflared tunnel create bridgy-dev` prints a tunnel UUID. You can see it again with:

```sh
cloudflared tunnel list
```

It also writes a credentials JSON file locally:

```text
~/.cloudflared/<tunnel-id>.json
```

That JSON file is secret. Do not commit it. On a new server, either run the `login` and `create` flow there to make a new tunnel, or securely copy the existing JSON file to the new server.

The current dev tunnel config expects:

```text
deploy/cloudflared.local.yml
```

That file is ignored by git because it points at a local credentials path.

### Quick Server Script

After Docker, Docker Compose, and `cloudflared` are installed on a server, copy the tunnel credentials JSON there, then run:

```sh
./deploy/setup-server.sh
```

The script tries to auto-detect the tunnel UUID from an existing config, from `cloudflared tunnel list`, or from the only UUID-named JSON file in `~/.cloudflared`.

If auto-detection is ambiguous, pass the tunnel id explicitly:

```sh
./deploy/setup-server.sh --tunnel-id <tunnel-id>
```

If the credentials JSON is somewhere other than `~/.cloudflared/<tunnel-id>.json`, pass it explicitly:

```sh
./deploy/setup-server.sh \
  --tunnel-id <tunnel-id> \
  --credentials-file /path/to/<tunnel-id>.json
```

The script creates `.env` if missing, writes `deploy/cloudflared.local.yml`, starts Docker Compose, backgrounds `cloudflared`, and checks `/health`.

### Temporary Tunnel

You can use a random TryCloudflare URL for a quick smoke test:

```sh
cloudflared tunnel --url http://127.0.0.1:3000
```

Copy the generated `https://...trycloudflare.com` URL into `.env` as `PUBLIC_BASE_URL`, restart `bun run dev`, and create or update the Quo webhook against that URL. The URL changes every time, so the named `bridgy.chat` tunnel is much easier for SMS testing.

The setup page uses Server-Sent Events when available and falls back to polling, so quick tunnels can work for setup testing. The named tunnel is still the least fussy path.

## Quo Setup

Configure Quo/OpenPhone to send `message.received` events to:

```text
https://bridgy.chat/webhooks/quo
```

Add your Quo API key to `.env`:

```sh
QUO_API_KEY=...
```

List your Quo phone numbers and copy the `id` for the number Bridgy should send from:

```sh
bun run quo:list-numbers
```

Set it as:

```sh
QUO_FROM=PN...
```

Test outbound SMS:

```sh
QUO_TEST_TO=+15551234567 bun run quo:send-test
```

Create the inbound webhook against `PUBLIC_BASE_URL`:

```sh
bun run quo:create-webhook
```

Save the returned values in `.env`:

```sh
QUO_WEBHOOK_ID=...
QUO_WEBHOOK_KEY=whsec_...
```

Turn off dry-run once `QUO_API_KEY`, `QUO_FROM`, and the webhook values are set:

```sh
SMS_DRY_RUN=false
```

Restart Bridgy so it picks up the new env:

```sh
bun run dev
```

Send Quo's signed test event:

```sh
bun run quo:test-webhook
```

Inspect recent webhook deliveries from Quo:

```sh
bun run quo:webhook-events
```

Inspect a single Quo webhook event:

```sh
bun run quo:webhook-event <event-id>
```

Inspect what Bridgy has received locally:

```sh
curl https://bridgy.chat/debug/webhooks
```

`/debug/webhooks` is a dev diagnostic endpoint. Do not leave it exposed forever in a real production deployment.

If Quo credentials are missing or `SMS_DRY_RUN=true`, Bridgy prints SMS sends instead of sending them:

```text
[sms:dry-run] to +15551234567: WhatsApp linked. Text MENU for commands.
```

## WhatsApp Linking

Run the Phase 1 WhatsApp smoke test:

```sh
WA_SMOKE_TO=+15551234567 bun run smoke:wa
```

After scanning the QR, WhatsApp may close the stream with `restart required`. That is expected during pairing; the smoke script reconnects with the saved credentials and should then print `WhatsApp linked.`

For the product flow, a user texts the Quo number:

```text
START
```

Bridgy replies with a short setup link like:

```text
https://bridgy.chat/AB12CD
```

The setup page supports two linking paths:

- Computer/tablet/second phone: open the link there, then scan the QR from WhatsApp > Linked Devices.
- Same smartphone as WhatsApp: open the link, enter the WhatsApp phone number, tap `Get Pairing Code`, then in WhatsApp use Linked Devices > Link a Device > Link with phone number instead.

The same-phone pairing flow exists because a user cannot scan a QR shown on the same phone camera they need for WhatsApp.

## SMS Commands

Users text the Quo number:

```text
START
LINK
MENU
COMMANDS
ADD mom +15551234567
@mom hello
@+15551234567 hello
WHO
RESET
```

Plain SMS replies go to the last active WhatsApp chat.

`HELP` and `STOP` are carrier/10DLC-reserved keywords. Bridgy intentionally ignores them so the SMS provider/carrier flow can handle them. Use `MENU` or `COMMANDS` for the app help text.

## End-to-End Test

1. Start Bun with `bun run dev`.
2. Start the named tunnel with `cloudflared tunnel --config deploy/cloudflared.local.yml run bridgy-dev`.
3. Confirm `curl https://bridgy.chat/health` returns `{"ok":true}`.
4. Confirm Quo webhook testing succeeds with `bun run quo:test-webhook`.
5. Text `START` to the Quo number.
6. Open the returned `https://bridgy.chat/<CODE>` link.
7. Link WhatsApp by QR or pairing code.
8. Text `MENU`.
9. Add a WhatsApp contact with `ADD mom +15551234567`.
10. Send `@mom hello`.
11. Reply from WhatsApp and confirm it arrives by SMS.

Final multi-user acceptance:

1. Two SMS users text `START`.
2. Each opens their own setup link.
3. Each links a different WhatsApp account.
4. Each sends and receives WhatsApp messages by SMS.
5. No message crosses users.

## Tests

Run unit tests:

```sh
bun test
```

Run the TypeScript compiler:

```sh
bunx tsc --noEmit
```

## Docker

Build the image:

```sh
docker build -t bridgy:local .
```

Run it with your `.env` file and persistent local data:

```sh
docker compose up --build
```

The compose setup mounts persistent app state at `/app/data`, including SQLite and WhatsApp auth sessions.

## Deploy

Use a host that can run one long-lived Bun process with persistent disk, such as Railway, a VM, or another container host.

Set production env from `.env.production.example`, including:

```sh
PUBLIC_BASE_URL=https://bridgy.chat
DATA_DIR=/app/data
SMS_DRY_RUN=false
```

Mount persistent storage at `/app/data`.

Run one replica only so two processes do not touch the same WhatsApp session files.

If running on Railway, add `bridgy.chat` as the custom domain in Railway or point Cloudflare Tunnel/DNS at the deployed service as appropriate.

## Persistent Data

All local state lives under `DATA_DIR`, defaulting to `./data`:

```text
data/bridgy.sqlite
data/wa-sessions/<hashed-sms-phone>/
```

Each SMS phone number is the user id. WhatsApp sessions are isolated per hashed SMS phone number.

## Troubleshooting

Cloudflare `Error 1033` means Cloudflare cannot reach the named tunnel. Start or restart:

```sh
cloudflared tunnel --config deploy/cloudflared.local.yml run bridgy-dev
```

A Cloudflare `502` or origin timeout usually means the tunnel is running but Bun is not reachable. Confirm:

```sh
curl http://127.0.0.1:3000/health
```

If the Quo webhook does not seem to fire, check Quo's event history first:

```sh
bun run quo:webhook-events
```

Then check Bridgy's local receipt log:

```sh
curl https://bridgy.chat/debug/webhooks
```

If the setup page is opened on the same phone that has WhatsApp, use `Get Pairing Code` instead of the QR.

If Baileys logs `restart required` immediately after pairing, let it reconnect. That is expected during the link step.
