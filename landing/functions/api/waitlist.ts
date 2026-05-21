type WaitlistEntry = {
  contact: string;
  contactType: "email" | "phone";
  displayContact: string;
  source: string;
  interest: "public_beta";
  createdAt: string;
  updatedAt: string;
  duplicateCount: number;
  referrer: string | null;
  country: string | null;
  userAgent: string | null;
};

type WaitlistKV = {
  get<T = unknown>(key: string, type?: "json"): Promise<T | null>;
  put(
    key: string,
    value: string,
    options?: {
      metadata?: Record<string, string>;
    },
  ): Promise<void>;
};

type Env = {
  WAITLIST?: WaitlistKV;
};

type PagesContext = {
  request: Request;
  env: Env;
};

type Contact = {
  normalized: string;
  display: string;
  type: "email" | "phone";
};

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS",
    },
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  try {
    if (!env.WAITLIST) {
      return respond(request, { ok: false, error: "Waitlist storage is not configured yet." }, 503);
    }

    const payload = await readPayload(request);
    if (getString(payload.company)) {
      return respond(request, { ok: true, message: "You're on the beta list." }, 202);
    }

    if (!hasConsent(getString(payload.consent))) {
      return respond(request, { ok: false, error: "Please confirm beta contact consent." }, 400, {
        error: "consent",
      });
    }

    const contact = normalizeContact(getString(payload.contact));
    if (!contact) {
      return respond(request, { ok: false, error: "Enter a valid email or phone number." }, 400, {
        error: "contact",
      });
    }

    const key = `waitlist:v1:${await sha256(contact.normalized)}`;
    const existing = await env.WAITLIST.get<WaitlistEntry>(key, "json");
    const now = new Date().toISOString();
    const entry: WaitlistEntry = {
      contact: contact.normalized,
      contactType: contact.type,
      displayContact: contact.display,
      source: cleanString(getString(payload.source), 48) || "landing",
      interest: "public_beta",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      duplicateCount: (existing?.duplicateCount ?? 0) + (existing ? 1 : 0),
      referrer: cleanString(request.headers.get("referer") ?? "", 240) || null,
      country: readCountry(request),
      userAgent: cleanString(request.headers.get("user-agent") ?? "", 240) || null,
    };

    await env.WAITLIST.put(key, JSON.stringify(entry), {
      metadata: {
        contactType: entry.contactType,
        updatedAt: entry.updatedAt,
        source: entry.source,
      },
    });

    return respond(
      request,
      {
        ok: true,
        status: existing ? "already_joined" : "joined",
        message: existing
          ? "You're already on the beta list."
          : "You're on the beta list. I'll reach out when spots open.",
      },
      existing ? 200 : 201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not join the waitlist yet.";
    return respond(request, { ok: false, error: message }, 500);
  }
}

function respond(
  request: Request,
  body: Record<string, unknown>,
  status: number,
  query: Record<string, string> = {},
): Response {
  if (wantsHtml(request)) {
    const url = new URL("/", request.url);
    if (status >= 200 && status < 300) url.searchParams.set("joined", "1");
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return Response.redirect(url.toString(), 303);
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function wantsHtml(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html") && !accept.includes("application/json");
}

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8_192) throw new Error("That submission is too large.");

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  }

  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanString(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function hasConsent(value: string): boolean {
  return ["1", "on", "true", "yes"].includes(value.toLowerCase());
}

function normalizeContact(raw: string): Contact | null {
  const value = raw.trim();
  const email = value.toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { normalized: email, display: email, type: "email" };
  }

  let phone = value.replace(/[().\-\s]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (/^\d{10}$/.test(phone)) phone = `+1${phone}`;
  if (/^1\d{10}$/.test(phone)) phone = `+${phone}`;
  if (/^\+[1-9]\d{7,14}$/.test(phone)) {
    return { normalized: phone, display: phone, type: "phone" };
  }

  return null;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readCountry(request: Request): string | null {
  const cf = (request as Request & { cf?: { country?: unknown } }).cf;
  return typeof cf?.country === "string" ? cf.country : null;
}
