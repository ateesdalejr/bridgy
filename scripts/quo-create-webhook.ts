import { loadQuoEnv, printResponse, quoFetch, requireEnv } from "./quo-env";

const env = loadQuoEnv();
const publicBaseUrl = requireEnv("publicBaseUrl", env.publicBaseUrl);
const webhookUrl = `${publicBaseUrl}/webhooks/quo`;

const response = await quoFetch("/webhooks", {
  method: "POST",
  headers: {
    "x-quo-api-version": "2026-03-30",
  },
  body: JSON.stringify({
    url: webhookUrl,
    events: ["message.received"],
    label: "Bridgy dev",
  }),
});

console.log(`Creating Quo webhook for ${webhookUrl}`);
await printResponse(response);
console.log("\nSave the response data.id as QUO_WEBHOOK_ID and data.key as QUO_WEBHOOK_KEY.");
