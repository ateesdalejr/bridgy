import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { parseQuoInboundMessage, verifyQuoWebhook } from "../src/quo";

describe("Quo webhook helpers", () => {
  test("parses message.received payloads", () => {
    const payload = {
      id: "EV1",
      type: "message.received",
      data: {
        object: {
          id: "MSG1",
          from: "+15551234567",
          to: ["+15557654321"],
          direction: "incoming",
          text: "hello",
          phoneNumberId: "PN1",
        },
      },
    };

    expect(parseQuoInboundMessage(payload, "fallback")).toEqual({
      eventId: "EV1",
      messageId: "MSG1",
      from: "+15551234567",
      to: "+15557654321",
      text: "hello",
      phoneNumberId: "PN1",
    });
  });

  test("verifies Svix-style webhook signatures", () => {
    const secretBytes = Buffer.from("test-secret");
    const secret = `whsec_${secretBytes.toString("base64")}`;
    const body = JSON.stringify({ type: "message.received" });
    const id = "msg_123";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${body}`).digest("base64");
    const headers = new Headers({
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signature}`,
    });

    expect(verifyQuoWebhook(body, headers, secret)).toBe(true);
  });
});
