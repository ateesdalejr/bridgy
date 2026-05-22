import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../src/store";
import { phoneToWhatsAppJid } from "../src/utils";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeStore(): Store {
  const dir = mkdtempSync(join(tmpdir(), "bridgy-test-"));
  dirs.push(dir);
  return new Store(dir);
}

describe("Store", () => {
  test("creates setup links for SMS users", () => {
    const store = makeStore();
    const link = store.createSetupLink("+15551234567", 60_000);
    expect(link.code).toHaveLength(6);
    expect(store.getSetupLink(link.code)?.smsPhone).toBe("+15551234567");
    expect(store.getUser("+15551234567")?.status).toBe("new");
    store.close();
  });

  test("stores contacts per phone number", () => {
    const store = makeStore();
    const jid = phoneToWhatsAppJid("+15557654321");
    store.addContact("+15551234567", "mom", jid, "+15557654321");
    expect(store.getContactByAlias("+15551234567", "mom")?.waJid).toBe(jid);
    expect(store.getContactByAlias("+15550000000", "mom")).toBeNull();
    store.close();
  });

  test("deduplicates processed webhooks", () => {
    const store = makeStore();
    expect(store.markWebhookProcessed("evt_1")).toBe(true);
    expect(store.markWebhookProcessed("evt_1")).toBe(false);
    store.close();
  });

  test("deletes user-owned local data", () => {
    const store = makeStore();
    const phone = "+15551234567";
    const otherPhone = "+15550000000";
    const jid = phoneToWhatsAppJid("+15557654321");
    store.addContact(phone, "mom", jid, "+15557654321");
    store.addContact(otherPhone, "dad", jid, "+15557654321");
    store.createSetupLink(phone, 60_000);
    store.recordWebhookDelivery({
      id: "evt_1",
      source: "quo",
      eventType: "message.received",
      fromPhone: phone,
      textPreview: "hello",
      status: "handled",
      error: null,
      receivedAt: Date.now(),
    });

    store.deleteUserData(phone);

    expect(store.getUser(phone)).toBeNull();
    expect(store.getContactByAlias(phone, "mom")).toBeNull();
    expect(store.listWebhookDeliveries().some((delivery) => delivery.fromPhone === phone)).toBe(false);
    expect(store.getContactByAlias(otherPhone, "dad")?.waJid).toBe(jid);
    store.close();
  });

  test("prunes old webhook delivery diagnostics", () => {
    const store = makeStore();
    store.recordWebhookDelivery({
      id: "old",
      source: "quo",
      eventType: "message.received",
      fromPhone: "+15551234567",
      textPreview: "old",
      status: "handled",
      error: null,
      receivedAt: 100,
    });
    store.recordWebhookDelivery({
      id: "new",
      source: "quo",
      eventType: "message.received",
      fromPhone: "+15551234567",
      textPreview: "new",
      status: "handled",
      error: null,
      receivedAt: 200,
    });

    store.pruneWebhookDeliveries(150);

    expect(store.listWebhookDeliveries().map((delivery) => delivery.id)).toEqual(["new"]);
    store.close();
  });
});
