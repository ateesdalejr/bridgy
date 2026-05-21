import QRCode from "qrcode";
import { loadConfig } from "./config";
import { helpText, parseSmsCommand } from "./commands";
import { setupPage, snapshotEvent, jsonResponse } from "./html";
import { QuoClient, parseQuoInboundMessage, verifyQuoWebhook } from "./quo";
import { Store } from "./store";
import { WhatsAppSessionManager } from "./whatsapp";
import { nowMs, normalizeE164, phoneToWhatsAppJid, whatsappJidToPhone } from "./utils";

const config = loadConfig();
const store = new Store(config.dataDir);
const quo = new QuoClient(config);
const whatsapp = new WhatsAppSessionManager(config.dataDir);
const TEST_SETUP_SMS_PHONE = "+10000000000";

if (config.smsDryRun) {
  console.log("SMS dry-run mode is on. Set QUO_API_KEY and QUO_FROM to send real SMS.");
}

whatsapp.onStatusChange(async (snapshot) => {
  if (snapshot.status === "linked") {
    const user = store.getUser(snapshot.smsPhone);
    if (user?.status !== "linked") {
      store.setUserStatus(snapshot.smsPhone, "linked");
      await safeSendSms(snapshot.smsPhone, "WhatsApp linked. Text MENU for commands.");
    }
  }

  if (snapshot.status === "error") store.setUserStatus(snapshot.smsPhone, "error");
});

whatsapp.onInboundMessage(async ({ smsPhone, fromJid, text }) => {
  const contact = store.getContactByJid(smsPhone, fromJid);
  const fallback = whatsappJidToPhone(fromJid) ?? fromJid;
  const label = contact?.alias ?? fallback;
  store.setActiveChat(smsPhone, fromJid);
  await safeSendSms(smsPhone, `${label}: ${text}`);
});

for (const smsPhone of store.listLinkedUsers()) {
  whatsapp.startSession(smsPhone).catch((error) => console.error("Failed to restore WhatsApp session", smsPhone, error));
}

const server = Bun.serve({
  port: config.port,
  idleTimeout: 255,
  async fetch(request) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/health") return jsonResponse({ ok: true });
      if (url.pathname === "/debug/webhooks") return jsonResponse({ deliveries: store.listWebhookDeliveries() });
      if (url.pathname === "/") return new Response("Bridgy is running.\n", { headers: { "Content-Type": "text/plain" } });
      if (url.pathname === "/webhooks/quo" && request.method === "POST") return handleQuoWebhook(request);

      const setupMatch = url.pathname.match(/^\/setup\/([^/]+)(?:\/(start|events|qr|status|pairing-code))?$/);
      if (setupMatch) return handleSetupRoute(request, setupMatch[1], setupMatch[2] ?? "page");

      const shortCode = url.pathname.match(/^\/([A-Za-z0-9]{4,12})$/);
      if (shortCode && request.method === "GET") return renderSetupPage(shortCode[1]);

      return new Response("Not found\n", { status: 404 });
    } catch (error) {
      console.error(error);
      return new Response(error instanceof Error ? error.message : "Internal error", { status: 500 });
    }
  },
});

console.log(`Bridgy listening on http://localhost:${server.port}`);

async function handleQuoWebhook(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const deliveryId = request.headers.get("webhook-id") ?? crypto.randomUUID();
  const receivedAt = nowMs();
  let payload: unknown = null;

  if (config.quoWebhookKey && !verifyQuoWebhook(rawBody, request.headers, config.quoWebhookKey)) {
    store.recordWebhookDelivery({
      id: deliveryId,
      source: "quo",
      eventType: null,
      fromPhone: null,
      textPreview: null,
      status: "invalid_signature",
      error: "Invalid signature",
      receivedAt,
    });
    console.warn(`[quo:webhook] invalid signature delivery=${deliveryId}`);
    return new Response("Invalid signature", { status: 401 });
  }

  if (!store.markWebhookProcessed(deliveryId)) return new Response("OK");

  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    store.recordWebhookDelivery({
      id: deliveryId,
      source: "quo",
      eventType: null,
      fromPhone: null,
      textPreview: null,
      status: "invalid_json",
      error: message,
      receivedAt,
    });
    console.warn(`[quo:webhook] invalid json delivery=${deliveryId}: ${message}`);
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventType = getPayloadType(payload);
  const inbound = parseQuoInboundMessage(payload, deliveryId);
  if (!inbound) {
    store.recordWebhookDelivery({
      id: deliveryId,
      source: "quo",
      eventType,
      fromPhone: null,
      textPreview: null,
      status: "ignored",
      error: "Not a supported inbound message payload",
      receivedAt,
    });
    console.log(`[quo:webhook] ignored delivery=${deliveryId} type=${eventType ?? "unknown"}`);
    return new Response("OK");
  }

  await handleSms(inbound.from, inbound.text);
  store.recordWebhookDelivery({
    id: deliveryId,
    source: "quo",
    eventType,
    fromPhone: inbound.from,
    textPreview: inbound.text.slice(0, 80),
    status: "handled",
    error: null,
    receivedAt,
  });
  console.log(`[quo:webhook] handled delivery=${deliveryId} from=${inbound.from} text=${JSON.stringify(inbound.text)}`);
  return new Response("OK");
}

function getPayloadType(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const type = (payload as Record<string, unknown>).type;
  return typeof type === "string" ? type : null;
}

async function handleSms(from: string, text: string): Promise<void> {
  const smsPhone = normalizeE164(from);
  if (!smsPhone) return;
  store.getOrCreateUser(smsPhone);

  const command = parseSmsCommand(text);

  switch (command.type) {
    case "start": {
      store.setUserStatus(smsPhone, "pending_link");
      const link = store.createSetupLink(smsPhone, config.setupTtlMs);
      await safeSendSms(smsPhone, `Link WhatsApp: ${config.publicBaseUrl}/${link.code} Open on a computer for QR, or on your phone for pairing code.`);
      return;
    }
    case "menu":
      await safeSendSms(smsPhone, helpText());
      return;
    case "carrier_reserved":
      console.log(`[sms] ignored carrier-reserved keyword ${command.keyword} from ${smsPhone}`);
      return;
    case "reset":
      await whatsapp.resetSession(smsPhone);
      store.setActiveChat(smsPhone, null);
      store.setUserStatus(smsPhone, "new");
      await safeSendSms(smsPhone, "Local WhatsApp link reset. Text START to link again.");
      return;
    case "who": {
      const contacts = store.listContacts(smsPhone);
      const user = store.getUser(smsPhone);
      const lines = [`Status: ${user?.status ?? "new"}`];
      if (contacts.length) lines.push(...contacts.map((contact) => `${contact.alias}: ${contact.phone ?? contact.waJid}`));
      else lines.push("No contacts yet. Use ADD mom +15551234567.");
      await safeSendSms(smsPhone, lines.join("\n"));
      return;
    }
    case "add": {
      const waJid = phoneToWhatsAppJid(command.phone);
      store.addContact(smsPhone, command.alias, waJid, command.phone);
      await safeSendSms(smsPhone, `Saved ${command.alias}. Send @${command.alias} hello`);
      return;
    }
    case "send_alias": {
      const contact = store.getContactByAlias(smsPhone, command.alias);
      if (!contact) {
        await safeSendSms(smsPhone, `Unknown contact: ${command.alias}. Use ADD ${command.alias} +15551234567.`);
        return;
      }
      await sendWhatsAppOrExplain(smsPhone, contact.waJid, command.text, contact.alias);
      return;
    }
    case "send_phone": {
      const waJid = phoneToWhatsAppJid(command.phone);
      await sendWhatsAppOrExplain(smsPhone, waJid, command.text, command.phone);
      return;
    }
    case "plain": {
      const user = store.getUser(smsPhone);
      const target = user?.active_chat_jid ?? config.defaultWaJid;
      if (!target) {
        await safeSendSms(smsPhone, "No active WhatsApp chat yet. Use @alias message, @+15551234567 message, or ADD mom +15551234567.");
        return;
      }
      await sendWhatsAppOrExplain(smsPhone, target, command.text, whatsappJidToPhone(target) ?? "active chat");
      return;
    }
    case "invalid":
      await safeSendSms(smsPhone, `${command.reason}\n${helpText()}`);
      return;
  }
}

async function sendWhatsAppOrExplain(smsPhone: string, waJid: string, text: string, label: string): Promise<void> {
  const snapshot = whatsapp.getSnapshot(smsPhone);
  if (snapshot.status !== "linked") {
    await whatsapp.startSession(smsPhone);
    const link = store.createSetupLink(smsPhone, config.setupTtlMs);
    await safeSendSms(smsPhone, `WhatsApp is not linked yet: ${config.publicBaseUrl}/${link.code}`);
    return;
  }

  await whatsapp.sendText(smsPhone, waJid, text);
  store.setActiveChat(smsPhone, waJid);
  await safeSendSms(smsPhone, `Sent to ${label}.`);
}

async function handleSetupRoute(request: Request, rawCode: string, action: string): Promise<Response> {
  const code = rawCode.toUpperCase();
  if (action === "page" && request.method === "GET") return renderSetupPage(code);

  const smsPhone = resolveSetupSmsPhone(code);
  if (!smsPhone) return new Response("Setup link not found or expired.", { status: 404 });

  if (action === "start" && request.method === "POST") {
    store.setUserStatus(smsPhone, "pending_link");
    await whatsapp.startSession(smsPhone);
    return jsonResponse({ ok: true });
  }

  if (action === "pairing-code" && request.method === "POST") {
    store.setUserStatus(smsPhone, "pending_link");
    const body = await request.json().catch(() => null);
    const phone = body && typeof body === "object" ? normalizeE164(String((body as { phone?: unknown }).phone ?? "")) : null;
    if (!phone) return new Response("Enter a WhatsApp phone number like +15551234567.", { status: 400 });

    const code = await whatsapp.requestPairingCode(smsPhone, phone.slice(1));
    return jsonResponse({ code: formatPairingCode(code) });
  }

  if (action === "events" && request.method === "GET") {
    return streamSessionEvents(smsPhone);
  }

  if (action === "status" && request.method === "GET") {
    return jsonResponse(whatsapp.getSnapshot(smsPhone), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  if (action === "qr" && request.method === "GET") {
    const qr = whatsapp.getQr(smsPhone);
    if (!qr) return new Response("No QR yet.", { status: 404 });
    const svg = await QRCode.toString(qr, { type: "svg", margin: 1, width: 420 });
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
  }

  return new Response("Not found", { status: 404 });
}

function renderSetupPage(code: string): Response {
  const smsPhone = resolveSetupSmsPhone(code);
  if (!smsPhone) return new Response("Setup link not found or expired.", { status: 404 });
  const isTestSetup = code.toLowerCase() === "test";
  return new Response(
    setupPage(code, smsPhone, {
      displayLabel: isTestSetup && !config.testSmsPhone ? "test user" : undefined,
      helperText: isTestSetup && !config.testSmsPhone ? "This local smoke page is not tied to a real SMS number yet." : undefined,
    }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function resolveSetupSmsPhone(code: string): string | null {
  if (code.toLowerCase() === "test") return config.testSmsPhone ? normalizeE164(config.testSmsPhone) : TEST_SETUP_SMS_PHONE;
  const link = store.getSetupLink(code);
  if (!link || link.expiresAt < nowMs()) return null;
  return link.smsPhone;
}

function formatPairingCode(code: string): string {
  return code.replace(/(.{4})/g, "$1 ").trim();
}

function streamSessionEvents(smsPhone: string): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = whatsapp.subscribe(smsPhone, (snapshot) => {
        controller.enqueue(encoder.encode(snapshotEvent(snapshot)));
      });
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15_000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function safeSendSms(to: string, content: string): Promise<void> {
  try {
    await quo.sendSms(to, content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`SMS send failed to ${to}: ${message}`);
  }
}
