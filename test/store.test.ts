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
});
