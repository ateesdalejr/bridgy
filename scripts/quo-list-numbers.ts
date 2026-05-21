import { printResponse, quoFetch } from "./quo-env";

const response = await quoFetch("/v1/phone-numbers");
await printResponse(response);
