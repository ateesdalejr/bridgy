# Bridgy

Bridgy is a two-way WhatsApp-to-SMS bridge for dumb phone users. A user texts a Bridgy SMS number, links WhatsApp once, and then sends or receives WhatsApp messages through plain SMS.

The easiest way to use Bridgy is the hosted service at [bridgy.chat](https://bridgy.chat). This repo is for self-hosting, hacking on the bridge, and understanding how it works.

The app is a Bun + TypeScript service that keeps local state on disk. It uses Baileys for WhatsApp, Quo/OpenPhone for SMS, and a public HTTPS URL for setup links and inbound webhooks.

## Hosted Bridgy

If you just want WhatsApp over SMS, start with [bridgy.chat](https://bridgy.chat). You do not need to clone this repo, run a server, configure webhooks, or manage WhatsApp session files.

Self-hosting is useful if you want to inspect the implementation, adapt the bridge, or run your own SMS provider and infrastructure.

## Status

This is an MVP. It supports:

- WhatsApp linking by QR code or same-phone pairing code
- Quo inbound and outbound SMS
- One WhatsApp session per SMS phone number
- Contact aliases like `ADD mom +15551234567` and `@mom hello`
- Plain SMS replies to the last active WhatsApp chat
- Docker/Railway-style deployment with persistent storage

Text messages are supported; media and group management are not.

## Self-Hosting Prerequisites

- [Bun](https://bun.sh/)
- A Quo/OpenPhone API key and sending phone number
- A WhatsApp account to link
- A public HTTPS URL for real SMS webhooks and setup links

## Self-Hosting Quick Start

Install dependencies:

```sh
bun install
```

Create local environment config:

```sh
cp .env.example .env
```

For local dry-run development, the defaults are enough:

```sh
PUBLIC_BASE_URL=http://localhost:3000
PORT=3000
DATA_DIR=./data
SMS_DRY_RUN=true
```

Start the app:

```sh
bun run dev
```

Check that it is running:

```sh
curl http://localhost:3000/health
```

Expected response:

```json
{"ok":true}
```

## SMS Setup

To send real SMS messages, fill these values in `.env`:

```sh
PUBLIC_BASE_URL=https://your-public-host.example
QUO_API_KEY=...
QUO_FROM=PN...
QUO_WEBHOOK_ID=...
QUO_WEBHOOK_KEY=whsec_...
SMS_DRY_RUN=false
```

List available Quo phone numbers:

```sh
bun run quo:list-numbers
```

Create the Quo inbound webhook against `PUBLIC_BASE_URL`:

```sh
bun run quo:create-webhook
```

Save the returned `data.id` as `QUO_WEBHOOK_ID` and `data.key` as `QUO_WEBHOOK_KEY`, restart the app, then send Quo's signed test event:

```sh
bun run quo:test-webhook
```

Quo should send `message.received` events to:

```text
https://your-public-host.example/webhooks/quo
```

## Public URL For Webhooks

Bridgy does not require Cloudflare. For real SMS testing, it only needs a public HTTPS URL that forwards to the Bun server on port `3000`.

Good options are:

- Deploy Bridgy to a host with HTTPS and persistent disk.
- Put it behind your own reverse proxy.
- Use any local tunnel that gives you an HTTPS URL and forwards to `http://localhost:3000`.

After choosing a URL, set:

```sh
PUBLIC_BASE_URL=https://your-public-host.example
```

Then run:

```sh
bun run quo:create-webhook
```

### Optional Cloudflare Tunnel

Cloudflare Tunnel is useful if you already use Cloudflare for a domain, but it is not required.

```sh
cloudflared tunnel login
cloudflared tunnel create bridgy-dev
cp deploy/cloudflared.example.yml deploy/cloudflared.local.yml
```

Edit `deploy/cloudflared.local.yml` with the tunnel id, credentials path, and hostname, then create the DNS route once:

```sh
cloudflared tunnel route dns bridgy-dev your-public-host.example
```

Run the tunnel while developing:

```sh
cloudflared tunnel --config deploy/cloudflared.local.yml run bridgy-dev
```

Set `PUBLIC_BASE_URL` to the tunnel hostname. `deploy/cloudflared.local.yml` is intentionally ignored because it points at local credentials.

## Using Bridgy

Text the Quo number:

```text
START
```

Bridgy replies with a setup link. Open it on a computer or tablet and scan the QR from WhatsApp > Linked Devices. If the link is opened on the same phone as WhatsApp, enter the WhatsApp phone number and use the pairing code flow instead.

After linking, useful SMS commands are:

```text
MENU
ADD mom +15551234567
@mom hello
@+15551234567 hello
WHO
RESET
```

`HELP` and `STOP` are reserved for the carrier/SMS provider flow, so Bridgy leaves them alone. Use `MENU` or `COMMANDS` for app help.

## Tests

Run unit tests:

```sh
bun test
```

Run the TypeScript compiler:

```sh
bunx tsc --noEmit
```

Run the WhatsApp smoke test:

```sh
WA_SMOKE_TO=+15551234567 bun run smoke:wa
```

## Docker

Build and run with Docker Compose:

```sh
docker compose up --build
```

The compose setup reads `.env` and stores app data in the `bridgy-data` volume mounted at `/app/data`.

## Deployment

Use a host that can run one long-lived process with persistent disk, such as a VM, Railway, or another container host.

Production basics:

- Copy `.env.production.example` into your deployment environment and fill the secrets there.
- Set `PUBLIC_BASE_URL` to the production HTTPS origin.
- Set `DATA_DIR=/app/data` or another persistent mount.
- Set `SMS_DRY_RUN=false` only after Quo credentials and webhook signing are configured.
- Run one replica so multiple processes do not write to the same WhatsApp session files.

`./deploy/setup-server.sh` can prepare a Docker Compose + Cloudflare Tunnel deployment on a server that already has Docker, Docker Compose, and `cloudflared` installed. It is optional; any HTTPS deployment with persistent disk is fine.

## Local Data And Secrets

Do not commit local environment, tunnel, or runtime state. The repo ignores:

- `.env` and `.env.*`, except checked-in example files
- `.dev.vars*`
- `data/`
- `.wrangler/`
- `deploy/cloudflared.local.yml`
- `node_modules/`
- logs and `.DS_Store`

`data/` can contain SQLite state and WhatsApp auth sessions. Treat it as secret because those files can authenticate linked WhatsApp accounts.

## Before Publishing

Add the license you want this project to use before making the repository public.
