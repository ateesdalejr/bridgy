# Bridgy.chat Waitlist

This is a small Cloudflare Pages project for the public beta waitlist.

## Local Preview

Preview the static page:

```sh
cd landing/public
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

To test the Pages Function locally, run from `landing/` with Wrangler and a KV binding named `WAITLIST`.

## Cloudflare Pages Setup

Create a Pages project with:

- Root directory: `landing`
- Build command: leave blank
- Build output directory: `public`

Add a KV namespace binding named `WAITLIST` for both Production and Preview. Submissions are stored under keys prefixed with `waitlist:v1:`.

The form accepts either an email address or a phone number. Ten-digit US phone numbers are normalized to `+1...`; international numbers should be entered in E.164 format.
