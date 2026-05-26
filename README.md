# Bridgy

WhatsApp over SMS for dumb phones.

Use the hosted service at [bridgy.chat](https://bridgy.chat). This repo is for self-hosting, hacking, and seeing how the bridge works.

Bridgy is a Bun + TypeScript app using Baileys for WhatsApp and Quo/OpenPhone for SMS.

If this project is useful or interesting, please [star the repo](https://github.com/ateesdalejr/bridgy). It helps more dumb phone people find it.

Trust links: [Privacy](https://bridgy.chat/privacy), [Security](https://bridgy.chat/security), [Status](https://bridgy.chat/status), [Source](https://github.com/ateesdalejr/bridgy).

## Features

- Link WhatsApp by QR or pairing code
- Send and receive WhatsApp messages over SMS
- Use aliases like `ADD mom +15551234567` and `@mom hello`
- Keep one WhatsApp session per SMS number
- Run locally, with Docker, or on any host with persistent disk

## Quick Start

```sh
bun install
cp .env.example .env
bun run dev
curl http://localhost:3000/health
```

Local development starts in dry-run mode, so SMS messages are printed instead of sent.

## Real SMS

You need:

- A Quo/OpenPhone API key
- A Quo/OpenPhone sending number
- A public HTTPS URL that forwards to this app

Set `.env`:

```sh
PUBLIC_BASE_URL=https://your-public-host.example
QUO_API_KEY=...
QUO_FROM=PN...
QUO_WEBHOOK_ID=...
QUO_WEBHOOK_KEY=whsec_...
SMS_DRY_RUN=false
```

Then:

```sh
bun run quo:list-numbers
bun run quo:create-webhook
bun run quo:test-webhook
```

Quo should send `message.received` events to:

```text
https://your-public-host.example/webhooks/quo
```

Cloudflare Tunnel is optional. Any HTTPS tunnel, reverse proxy, or deployed host works as long as `PUBLIC_BASE_URL` matches it.

## SMS Commands

```text
START
MENU
ADD mom +15551234567
@mom hello
@+15551234567 hello
WHO
RESET
DELETE
```

`RESET` unlinks WhatsApp locally. `DELETE` removes local Bridgy records for the SMS number. `HELP` and `STOP` are left for the SMS provider or carrier.

## Hosted Or Self-Hosted

Hosted Bridgy is for people who want WhatsApp over SMS without managing a server, SMS webhooks, or WhatsApp session files.

Self-hosting gives you the source, AGPL rights, and control over your own SMS provider, public HTTPS URL, and persistent storage.

## Docker

```sh
docker compose up --build
```

Compose serves the static landing page through nginx on port 80 and proxies dynamic routes to the
Bun service internally. Persist `/app/data` and run one replica. WhatsApp session files and waitlist
entries live there.

For a VPS behind Cloudflare:

- Point `bridgy.chat` and optionally `www` to the VPS with proxied DNS records enabled.
- Set Cloudflare SSL/TLS mode to Flexible for this port-80 origin setup, or add an origin certificate
  and a 443 nginx listener if you want Full (strict).
- Set `PUBLIC_BASE_URL=https://bridgy.chat` before creating the Quo/OpenPhone webhook.

## Development

```sh
bun test
bunx tsc --noEmit
```

## Secrets

Do not commit `.env`, `data/`, `.wrangler/`, or `deploy/cloudflared.local.yml`.

`data/` contains SQLite state and WhatsApp auth sessions. Treat it as secret. Webhook delivery diagnostics are retained for seven days by default.

## Disclaimer

Bridgy uses WhatsApp Web through Baileys. It is not affiliated with, endorsed by, or officially connected to WhatsApp or Meta.

## License

Licensed under [AGPL-3.0](./LICENSE). If you modify Bridgy and run it as a network service, you must offer the corresponding source code to users of that service.
