# Privacy

Hosted Bridgy routes messages between SMS and WhatsApp. It does not sell personal data or use message contents for AI training.

## Data Stored

Bridgy may store:

- Waitlist contact details, such as an email address or phone number
- SMS phone numbers and WhatsApp linking state
- Contact aliases users create
- WhatsApp Web session files needed to keep the bridge linked
- Recent webhook delivery diagnostics, including short message previews

## Retention

Webhook delivery diagnostics are retained for seven days by default. WhatsApp session files, aliases, and SMS-number records remain until reset or deletion.

## Deletion

Text `RESET` to unlink WhatsApp locally.

Text `DELETE` to remove Bridgy records for your SMS number and unlink WhatsApp from the bridge.

For waitlist deletion or hosted account help, email `privacy@bridgy.chat`.

## Third Parties

Bridgy uses WhatsApp Web through Baileys and Quo/OpenPhone for SMS delivery. Those services process messages as part of routing them.
