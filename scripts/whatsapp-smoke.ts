import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const dataDir = process.env.DATA_DIR ?? "./data";
const authDir = join(dataDir, "wa-smoke");
const sendTo = process.env.WA_SMOKE_TO;
const sendText = process.env.WA_SMOKE_TEXT ?? "Bridgy WhatsApp smoke test";
const logger = pino({ level: process.env.BRIDGY_WA_LOG_LEVEL ?? "silent" });

mkdirSync(authDir, { recursive: true });

console.log("WhatsApp smoke test running. Press Ctrl+C to stop.");
await startSocket();

async function startSocket(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    browser: ["Bridgy Smoke", "Chrome", "0.1.0"],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      console.log(await QRCode.toString(qr, { type: "terminal" }));
      console.log("Scan this QR from WhatsApp > Linked Devices.");
    }

    if (connection === "open") {
      await onOpen(socket);
    }

    if (connection === "close") {
      const statusCode = getStatusCode(lastDisconnect?.error);
      if (statusCode === DisconnectReason.loggedOut) {
        console.log("WhatsApp logged out. Delete data/wa-smoke and scan again.");
        return;
      }

      const reason = statusCode === DisconnectReason.restartRequired ? "restart required after pairing" : `status ${statusCode ?? "unknown"}`;
      console.log(`Connection closed (${reason}). Reconnecting...`);
      setTimeout(() => {
        startSocket().catch((error) => {
          console.error("Reconnect failed:", error);
        });
      }, 1500);
    }
  });

  socket.ev.on("messages.upsert", ({ type, messages }) => {
    if (type !== "notify") return;
    for (const message of messages) {
      if (message.key.fromMe) continue;
      const text = message.message?.conversation ?? message.message?.extendedTextMessage?.text;
      if (text) console.log(`Incoming from ${message.key.remoteJid}: ${text}`);
    }
  });
}

async function onOpen(socket: WASocket): Promise<void> {
  console.log("WhatsApp linked.");
  if (sendTo) {
    const jid = sendTo.includes("@") ? sendTo : `${sendTo.replace(/^\+/, "")}@s.whatsapp.net`;
    await socket.sendMessage(jid, { text: sendText });
    console.log(`Sent smoke message to ${jid}.`);
  } else {
    console.log("Set WA_SMOKE_TO=+15551234567 to send a hardcoded smoke message.");
  }
}

function getStatusCode(error: unknown): number | undefined {
  return (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
}
