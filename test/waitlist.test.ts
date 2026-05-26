import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store";
import { handleWaitlistRequest, normalizeContact } from "../src/waitlist";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeStore(): Store {
  const dir = mkdtempSync(join(tmpdir(), "bridgy-test-"));
  dirs.push(dir);
  return new Store(dir);
}

describe("waitlist", () => {
  test("normalizes email and phone contacts", () => {
    expect(normalizeContact("HELLO@EXAMPLE.COM")?.normalized).toBe("hello@example.com");
    expect(normalizeContact("(555) 123-4567")?.normalized).toBe("+15551234567");
    expect(normalizeContact("not a contact")).toBeNull();
  });

  test("stores JSON waitlist submissions", async () => {
    const store = makeStore();
    const payload = JSON.stringify({
      contact: "hello@example.com",
      consent: "yes",
      source: "landing",
    });
    const request = new Request("https://bridgy.chat/api/waitlist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: payload,
    });

    const response = await handleWaitlistRequest(store, request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status).toBe("joined");

    const duplicate = await handleWaitlistRequest(
      store,
      new Request("https://bridgy.chat/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: payload,
      }),
    );
    const duplicateBody = await duplicate.json();
    expect(duplicate.status).toBe(200);
    expect(duplicateBody.status).toBe("already_joined");

    store.close();
  });

  test("rejects submissions without consent", async () => {
    const store = makeStore();
    const request = new Request("https://bridgy.chat/api/waitlist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        contact: "hello@example.com",
      }),
    });

    const response = await handleWaitlistRequest(store, request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Please confirm beta contact consent.");
    store.close();
  });

  test("uses forwarded host and protocol for form fallback redirects", async () => {
    const store = makeStore();
    const form = new URLSearchParams({
      contact: "hello@example.com",
      consent: "yes",
      source: "landing",
    });
    const request = new Request("http://bridgy:3000/api/waitlist", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
        "X-Forwarded-Host": "bridgy.chat",
        "X-Forwarded-Proto": "https",
      },
      body: form,
    });

    const response = await handleWaitlistRequest(store, request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://bridgy.chat/?joined=1");
    store.close();
  });
});
