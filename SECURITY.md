# Security Policy

Bridgy handles SMS identity, webhook secrets, and WhatsApp session files. Please report security issues privately.

## Reporting A Vulnerability

Email security reports to `security@bridgy.chat`.

Please include:

- A short description of the issue
- Steps to reproduce
- Affected files, endpoints, or configuration
- Any logs or proof-of-concept details that are safe to share

Do not open public GitHub issues for vulnerabilities.

## Sensitive Data

Treat these as secrets:

- `.env`
- Quo/OpenPhone API keys and webhook signing keys
- `data/bridgy.sqlite`
- `data/wa-sessions/`
- Cloudflare Tunnel credentials and `deploy/cloudflared.local.yml`

If any of these are exposed, rotate the affected credentials and unlink/relink affected WhatsApp sessions.

## Scope

In scope:

- Authentication or session handling bugs
- Webhook signature validation issues
- Cross-user message leakage
- Exposure of WhatsApp session files, SMS numbers, or message contents
- Deployment defaults that could leak secrets
- Hosted version/source metadata being unavailable or misleading

Out of scope:

- Issues requiring access to a user's local machine or committed secrets
- Denial-of-service reports without a practical exploit path
- Vulnerabilities in third-party services such as WhatsApp, Meta, Quo, OpenPhone, or Cloudflare

## Disclosure

Please give me a reasonable window to investigate and fix before public disclosure. I will credit reporters when requested.

## User Controls

Users can text `RESET` to unlink WhatsApp locally or `DELETE` to remove Bridgy records for their SMS number. Webhook delivery diagnostics are retained for seven days by default.
