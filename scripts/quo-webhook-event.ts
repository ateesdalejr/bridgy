import { loadQuoEnv, printResponse, quoFetch, requireEnv } from "./quo-env";

const env = loadQuoEnv();
const webhookId = requireEnv("webhookId", env.webhookId);
const eventId = Bun.argv[2];

if (!eventId) {
  throw new Error("Usage: bun scripts/quo-webhook-event.ts <event-id>");
}

const response = await quoFetch(`/webhooks/${webhookId}/events/${eventId}`, {
  headers: {
    "x-quo-api-version": "2026-03-30",
  },
});

await printResponse(response);
