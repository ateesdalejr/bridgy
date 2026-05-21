import { loadQuoEnv, printResponse, quoFetch, requireEnv } from "./quo-env";

const env = loadQuoEnv();
const webhookId = requireEnv("webhookId", env.webhookId);

const response = await quoFetch(`/webhooks/${webhookId}/events`, {
  headers: {
    "x-quo-api-version": "2026-03-30",
  },
});

await printResponse(response);
