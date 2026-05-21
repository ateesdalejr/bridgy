import { loadQuoEnv, printResponse, quoFetch, requireEnv } from "./quo-env";

const env = loadQuoEnv();
const webhookId = requireEnv("webhookId", env.webhookId);

const response = await quoFetch(`/webhooks/${webhookId}/events/test`, {
  method: "POST",
  headers: {
    "x-quo-api-version": "2026-03-30",
  },
  body: JSON.stringify({ eventType: "message.received" }),
});

await printResponse(response);
