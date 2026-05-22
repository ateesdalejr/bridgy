import type { SessionSnapshot } from "./types";
import { escapeHtml, toShortDisplayPhone } from "./utils";

interface SetupPageOptions {
  displayLabel?: string;
  helperText?: string;
  sourceUrl?: string;
  privacyUrl?: string;
  securityUrl?: string;
  statusUrl?: string;
  versionLabel?: string;
}

export function setupPage(code: string, smsPhone: string, options: SetupPageOptions = {}): string {
  const safeCode = escapeHtml(code);
  const safeUserLabel = escapeHtml(options.displayLabel ?? toShortDisplayPhone(smsPhone));
  const helperText = options.helperText
    ? `<p class="hint">${escapeHtml(options.helperText)}</p>`
    : "";
  const sourceUrl = escapeHtml(options.sourceUrl ?? "https://github.com/ateesdalejr/bridgy");
  const privacyUrl = escapeHtml(options.privacyUrl ?? "https://bridgy.chat/privacy");
  const securityUrl = escapeHtml(options.securityUrl ?? "https://bridgy.chat/security");
  const statusUrl = escapeHtml(options.statusUrl ?? "https://bridgy.chat/status");
  const versionLabel = escapeHtml(options.versionLabel ?? "local");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Link Bridgy</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f7f9;
        color: #111827;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      main {
        width: min(440px, 100%);
        background: white;
        border: 1px solid #d7dce2;
        border-radius: 8px;
        padding: 24px;
        box-shadow: 0 18px 60px rgba(15, 23, 42, 0.08);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 26px;
        letter-spacing: 0;
      }
      p {
        color: #4b5563;
        line-height: 1.5;
      }
      .mobile-warning {
        display: none;
        margin: 16px 0;
        padding: 12px;
        border-radius: 6px;
        background: #fff7ed;
        color: #7c2d12;
        border: 1px solid #fed7aa;
      }
      button {
        width: 100%;
        border: 0;
        border-radius: 6px;
        padding: 12px 14px;
        color: white;
        background: #166534;
        font-weight: 700;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .secondary {
        margin-top: 8px;
        background: #1f2937;
      }
      input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 12px;
        font: inherit;
        margin-top: 8px;
        background: transparent;
        color: inherit;
      }
      .status {
        margin: 18px 0;
        padding: 12px;
        border-radius: 6px;
        background: #eef6ff;
        color: #1f3b57;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      .qr {
        display: none;
        width: 100%;
        aspect-ratio: 1;
        object-fit: contain;
        border: 1px solid #d7dce2;
        border-radius: 6px;
        margin-top: 16px;
        background: white;
      }
      .code {
        font-weight: 700;
        color: #111827;
      }
      .hint {
        font-size: 14px;
      }
      .pairing {
        margin-top: 18px;
        border-top: 1px solid #d7dce2;
        padding-top: 18px;
      }
      .pairing-code {
        display: none;
        margin-top: 12px;
        padding: 14px;
        border-radius: 6px;
        background: #ecfdf5;
        color: #064e3b;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 28px;
        font-weight: 800;
        text-align: center;
        letter-spacing: 2px;
      }
      .trust-links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 14px;
        margin-top: 18px;
        padding-top: 16px;
        border-top: 1px solid #d7dce2;
        color: #64748b;
        font-size: 13px;
      }
      .trust-links a {
        color: inherit;
      }
      @media (prefers-color-scheme: dark) {
        :root { background: #111827; color: #f9fafb; }
        main { background: #182235; border-color: #334155; }
        p { color: #cbd5e1; }
        .status { background: #10253c; color: #c7ddf2; }
        .code { color: #f9fafb; }
        .mobile-warning { background: #3a2414; color: #fed7aa; border-color: #9a5b1e; }
        .pairing { border-color: #334155; }
        .pairing-code { background: #102e26; color: #a7f3d0; }
        .trust-links { border-color: #334155; color: #94a3b8; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Link WhatsApp</h1>
      <p>This links Bridgy to the WhatsApp account for <span class="code">${safeUserLabel}</span>.</p>
      ${helperText}
      <div id="mobile-warning" class="mobile-warning">
        Open this link on a computer, tablet, or a second phone. Linking needs WhatsApp on your primary phone to scan the QR code shown here.
      </div>
      <button id="start">Start WhatsApp Link</button>
      <div id="status" class="status">waiting</div>
      <img id="qr" class="qr" alt="WhatsApp link QR code" />
      <p>In WhatsApp, open Linked Devices and scan the QR code when it appears.</p>
      <div class="pairing">
        <p>Using the same phone that has WhatsApp? Enter that WhatsApp phone number and use a pairing code instead.</p>
        <input id="pair-phone" inputmode="tel" autocomplete="tel" placeholder="+15551234567" />
        <button id="pair" class="secondary">Get Pairing Code</button>
        <div id="pairing-code" class="pairing-code"></div>
        <p class="hint">In WhatsApp, open Linked Devices, choose Link a Device, then use the phone-number pairing option and enter this code.</p>
      </div>
      <nav class="trust-links" aria-label="Trust links">
        <a href="${sourceUrl}">Source</a>
        <a href="${privacyUrl}">Privacy</a>
        <a href="${securityUrl}">Security</a>
        <a href="${statusUrl}">Status</a>
        <span>Version ${versionLabel}</span>
      </nav>
    </main>
    <script>
      const code = ${JSON.stringify(safeCode)};
      const start = document.getElementById("start");
      const status = document.getElementById("status");
      const qr = document.getElementById("qr");
      const mobileWarning = document.getElementById("mobile-warning");
      const pair = document.getElementById("pair");
      const pairPhone = document.getElementById("pair-phone");
      const pairingCode = document.getElementById("pairing-code");
      let polling = false;

      const isLikelyPhone = /Android|iPhone|iPod/i.test(navigator.userAgent) && Math.min(window.innerWidth, window.innerHeight) < 700;
      if (isLikelyPhone) {
        mobileWarning.style.display = "block";
        start.textContent = "Show QR Anyway";
      }

      function setStatus(snapshot) {
        status.textContent = snapshot.error ? snapshot.status + ": " + snapshot.error : snapshot.status;
        if (snapshot.hasQr) {
          qr.style.display = "block";
          qr.src = "/setup/" + code + "/qr?t=" + Date.now();
        }
        if (snapshot.status === "linked") {
          start.disabled = true;
          qr.style.display = "none";
        }
      }

      async function pollStatus() {
        if (polling) return;
        polling = true;
        while (true) {
          try {
            const response = await fetch("/setup/" + code + "/status", { cache: "no-store" });
            if (response.ok) setStatus(await response.json());
          } catch {
            status.textContent = "connection_lost";
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      start.addEventListener("click", async () => {
        start.disabled = true;
        status.textContent = "connecting";
        const response = await fetch("/setup/" + code + "/start", { method: "POST" });
        if (!response.ok) {
          status.textContent = await response.text();
          start.disabled = false;
        }
      });

      pair.addEventListener("click", async () => {
        pair.disabled = true;
        pairingCode.style.display = "none";
        status.textContent = "requesting_pairing_code";
        const response = await fetch("/setup/" + code + "/pairing-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: pairPhone.value })
        });
        if (!response.ok) {
          status.textContent = await response.text();
          pair.disabled = false;
          return;
        }

        const body = await response.json();
        pairingCode.textContent = body.code;
        pairingCode.style.display = "block";
        status.textContent = "enter_pairing_code_in_whatsapp";
        pair.disabled = false;
      });

      const events = new EventSource("/setup/" + code + "/events");
      events.onmessage = (event) => setStatus(JSON.parse(event.data));
      events.onerror = () => {
        status.textContent = "using_polling";
        events.close();
        void pollStatus();
      };
      setTimeout(() => {
        if (status.textContent === "waiting") void pollStatus();
      }, 2500);
    </script>
  </body>
</html>`;
}

export function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

export function snapshotEvent(snapshot: SessionSnapshot): string {
  return `data: ${JSON.stringify(snapshot)}\n\n`;
}
