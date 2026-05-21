import { loadQuoEnv, printResponse, quoFetch, requireEnv } from "./quo-env";

const env = loadQuoEnv();
const from = requireEnv("from", env.from);
const to = requireEnv("testTo", env.testTo);

const response = await quoFetch("/v1/messages", {
  method: "POST",
  body: JSON.stringify({
    content: "Bridgy Quo outbound test",
    from,
    to: [to],
    setInboxStatus: "done",
  }),
});

await printResponse(response);
