import { createHmac } from "node:crypto";
import type { Config } from "./config";
import type { QuoInboundMessage } from "./types";
import { safeEqual } from "./utils";

export class QuoClient {
  constructor(private readonly config: Config) {}

  async sendSms(to: string, content: string): Promise<void> {
    if (this.config.smsDryRun) {
      console.log(`[sms:dry-run] to ${to}: ${content}`);
      return;
    }

    if (!this.config.quoApiKey) throw new Error("QUO_API_KEY is not configured.");
    if (!this.config.quoFrom) throw new Error("QUO_FROM is not configured.");

    const response = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: {
        Authorization: this.config.quoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        from: this.config.quoFrom,
        to: [to],
        setInboxStatus: "done",
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Quo send failed (${response.status}): ${body}`);
    }
  }
}

export function verifyQuoWebhook(rawBody: string, headers: Headers, secret: string): boolean {
  const webhookId = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");

  if (!webhookId || !timestamp || !signatureHeader) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;

  const key = decodeWebhookSecret(secret);
  const signedPayload = `${webhookId}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", key).update(signedPayload).digest("base64");

  const signatures = signatureHeader
    .split(" ")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^v1,/, ""));

  return signatures.some((signature) => safeEqual(signature, expected));
}

export function parseQuoInboundMessage(payload: unknown, fallbackEventId: string): QuoInboundMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const event = payload as Record<string, unknown>;
  if (event.type !== "message.received") return null;

  const data = event.data as Record<string, unknown> | undefined;
  const object = data?.object as Record<string, unknown> | undefined;
  if (!object) return null;

  const direction = String(object.direction ?? "");
  if (direction && direction !== "incoming" && direction !== "inbound") return null;

  const from = String(object.from ?? "");
  const toList = Array.isArray(object.to) ? object.to : [];
  const to = String(toList[0] ?? "");
  const text = String(object.text ?? object.content ?? "").trim();
  const messageId = String(object.id ?? fallbackEventId);
  const phoneNumberId = object.phoneNumberId ? String(object.phoneNumberId) : undefined;

  if (!from || !to || !text) return null;

  return {
    eventId: String(event.id ?? fallbackEventId),
    messageId,
    from,
    to,
    text,
    phoneNumberId,
  };
}

function decodeWebhookSecret(secret: string): Buffer {
  const encoded = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    return Buffer.from(encoded, "base64");
  } catch {
    return Buffer.from(secret);
  }
}
