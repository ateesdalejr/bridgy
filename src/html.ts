import type { SessionSnapshot } from "./types";
import { escapeHtml, toShortDisplayPhone } from "./utils";

interface SetupPageOptions {
  displayLabel?: string;
  helperText?: string;
}

export function setupPage(code: string, smsPhone: string, options: SetupPageOptions = {}): string {
  const safeCode = escapeHtml(code);
  const safeUserLabel = escapeHtml(options.displayLabel ?? toShortDisplayPhone(smsPhone));
  const helperText = options.helperText
    ? `<p class="hint">${escapeHtml(options.helperText)}</p>`
    : "";

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
      @media (prefers-color-scheme: dark) {
        :root { background: #111827; color: #f9fafb; }
        main { background: #182235; border-color: #334155; }
        p { color: #cbd5e1; }
        .status { background: #10253c; color: #c7ddf2; }
        .code { color: #f9fafb; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Link WhatsApp</h1>
      <p>This links Bridgy to the WhatsApp account for <span class="code">${safeUserLabel}</span>.</p>
      ${helperText}
      <button id="start">Start WhatsApp Link</button>
      <div id="status" class="status">waiting</div>
      <img id="qr" class="qr" alt="WhatsApp link QR code" />
      <p>In WhatsApp, open Linked Devices and scan the QR code when it appears.</p>
    </main>
    <script>
      const code = ${JSON.stringify(safeCode)};
      const start = document.getElementById("start");
      const status = document.getElementById("status");
      const qr = document.getElementById("qr");

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

      start.addEventListener("click", async () => {
        start.disabled = true;
        status.textContent = "connecting";
        const response = await fetch("/setup/" + code + "/start", { method: "POST" });
        if (!response.ok) {
          status.textContent = await response.text();
          start.disabled = false;
        }
      });

      const events = new EventSource("/setup/" + code + "/events");
      events.onmessage = (event) => setStatus(JSON.parse(event.data));
      events.onerror = () => { status.textContent = "connection_lost"; };
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
