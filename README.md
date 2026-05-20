# Bridgy

Bridgy is a simple WhatsApp to SMS two way bridge for dumb phone users.

Problem: dumb phone users still want to communicate with their loved ones and others over WhatsApp, but they do not have access to hardware that can run WhatsApp. Bridgy solves that problem by letting users send and receive WhatsApp messages over SMS.

## Current MVP

This repo is a Bun + TypeScript implementation of the phased MVP plan:

1. WhatsApp smoke test with Baileys.
2. Tiny setup page for linking WhatsApp.
3. Quo SMS webhook loop.
4. One-user bridge.
5. Short-link onboarding.
6. Multi-user isolation by SMS phone number.
7. Aliases and plain-text replies.
8. Railway-ready deployment with persistent storage.

The MVP is text-only. It assumes users already have WhatsApp accounts they can link once from a PC using WhatsApp Linked Devices.

## Quick Start

Install dependencies:

```sh
bun install
```

Copy environment values:

```sh
cp .env.example .env
```

Run tests:

```sh
bun test
```

Run the server:

```sh
bun run dev
```

If port 3000 is busy:

```sh
PORT=45187 bun run dev
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

Open the Phase 2 setup smoke page:

```text
http://localhost:3000/setup/test
```

By default, `/setup/test` displays `test user` instead of a fake SMS number. Set `BRIDGY_TEST_SMS_PHONE=+1...` if you want that page tied to a specific local test number.

Run the Phase 1 WhatsApp smoke test:

```sh
WA_SMOKE_TO=+15551234567 bun run smoke:wa
```

After scanning the QR, WhatsApp may close the stream with `restart required`. That is expected during pairing; the smoke script reconnects with the saved credentials and should then print `WhatsApp linked.`

## SMS Commands

Users text the Quo number:

```text
START
ADD mom +15551234567
@mom hello
@+15551234567 hello
WHO
HELP
RESET
```

Plain SMS replies go to the last active WhatsApp chat.

## Quo Webhook

Configure Quo to send `message.received` events to:

```text
https://bridgy.chat/webhooks/quo
```

For local development, expose the Bun server through `cloudflared` and set:

```sh
PUBLIC_BASE_URL=https://bridgy.chat
QUO_API_KEY=...
QUO_WEBHOOK_KEY=...
QUO_FROM=PNxxxxxxxx
```

If Quo credentials are missing, Bridgy runs SMS sends in dry-run mode and prints lines like:

```text
[sms:dry-run] to +14254052446: WhatsApp linked. Text HELP for commands.
```

Set `SMS_DRY_RUN=false` once `QUO_API_KEY` and `QUO_FROM` are configured.

## bridgy.chat Config

Use `bridgy.chat` as the canonical public URL:

```sh
PUBLIC_BASE_URL=https://bridgy.chat
```

If running locally behind Cloudflare Tunnel, copy `deploy/cloudflared.example.yml` to your local cloudflared config, fill in your tunnel id, and route `bridgy.chat` to `http://localhost:3000`.

If running on Railway, add `bridgy.chat` as the custom domain in Railway, point Cloudflare DNS at Railway as instructed by Railway, and set the production env vars from `.env.production.example`.

Quo should use:

```text
https://bridgy.chat/webhooks/quo
```

## Persistent Data

All local state lives under `DATA_DIR`, defaulting to `./data`:

```text
data/bridgy.sqlite
data/wa-sessions/<hashed-sms-phone>/
```

For Railway, mount a volume at `/app/data` and set:

```sh
DATA_DIR=/app/data
```

Run one replica only so two processes do not touch the same WhatsApp session files.
