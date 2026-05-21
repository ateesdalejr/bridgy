import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { SessionSnapshot, SessionStatus, WhatsAppInboundMessage } from "./types";
import { hashPhone } from "./utils";

type Subscriber = (snapshot: SessionSnapshot) => void;
type InboundHandler = (message: WhatsAppInboundMessage) => void | Promise<void>;
type StatusHandler = (snapshot: SessionSnapshot) => void | Promise<void>;

interface SessionState {
  smsPhone: string;
  status: SessionStatus;
  qr: string | null;
  error?: string;
  updatedAt: number;
  socket?: WASocket;
  starting?: Promise<void>;
  subscribers: Set<Subscriber>;
}

export class WhatsAppSessionManager {
  private readonly sessions = new Map<string, SessionState>();
  private readonly logger = pino({ level: process.env.BRIDGY_WA_LOG_LEVEL ?? "silent" });
  private inboundHandler: InboundHandler = () => {};
  private statusHandler: StatusHandler = () => {};

  constructor(private readonly dataDir: string) {}

  onInboundMessage(handler: InboundHandler): void {
    this.inboundHandler = handler;
  }

  onStatusChange(handler: StatusHandler): void {
    this.statusHandler = handler;
  }

  async startSession(smsPhone: string): Promise<void> {
    const session = this.getOrCreateSession(smsPhone);
    if (session.starting) return session.starting;
    if (session.socket && (session.status === "linked" || session.status === "connecting" || session.status === "qr_ready")) {
      return;
    }

    session.starting = this.connect(session).finally(() => {
      session.starting = undefined;
    });
    return session.starting;
  }

  async sendText(smsPhone: string, waJid: string, text: string): Promise<void> {
    const session = this.getOrCreateSession(smsPhone);
    if (!session.socket) await this.startSession(smsPhone);
    if (!session.socket) throw new Error("WhatsApp session is not ready yet.");
    await session.socket.sendMessage(waJid, { text });
  }

  async requestPairingCode(smsPhone: string, phoneNumber: string): Promise<string> {
    const session = this.getOrCreateSession(smsPhone);
    await this.startSession(smsPhone);
    await this.waitForQr(session, 20_000);

    if (!session.socket) throw new Error("WhatsApp session is not ready yet.");
    if (session.socket.authState.creds.registered) throw new Error("WhatsApp is already linked.");

    return session.socket.requestPairingCode(phoneNumber);
  }

  getSnapshot(smsPhone: string): SessionSnapshot {
    const session = this.getOrCreateSession(smsPhone);
    return snapshot(session);
  }

  getQr(smsPhone: string): string | null {
    return this.getOrCreateSession(smsPhone).qr;
  }

  subscribe(smsPhone: string, subscriber: Subscriber): () => void {
    const session = this.getOrCreateSession(smsPhone);
    session.subscribers.add(subscriber);
    subscriber(snapshot(session));
    return () => session.subscribers.delete(subscriber);
  }

  async resetSession(smsPhone: string): Promise<void> {
    const session = this.getOrCreateSession(smsPhone);
    try {
      await session.socket?.logout();
    } catch {
      // The local files are the source of truth for reset in the MVP.
    }
    session.socket?.end(undefined);
    session.socket = undefined;
    session.qr = null;
    this.setStatus(session, "idle");
    rmSync(this.authDir(smsPhone), { recursive: true, force: true });
  }

  private async connect(session: SessionState): Promise<void> {
    this.setStatus(session, "connecting");
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir(session.smsPhone));
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger),
      },
      logger: this.logger,
      browser: ["Bridgy", "Chrome", "0.1.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    session.socket = socket;
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", (update) => {
      if (update.qr) {
        session.qr = update.qr;
        this.setStatus(session, "qr_ready");
      }

      if (update.connection === "open") {
        session.qr = null;
        this.setStatus(session, "linked");
      }

      if (update.connection === "close") {
        const statusCode = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        session.socket = undefined;
        if (statusCode === DisconnectReason.loggedOut) {
          this.setStatus(session, "disconnected", "WhatsApp logged out. Start linking again.");
          return;
        }
        this.setStatus(session, "disconnected", "WhatsApp disconnected. Reconnecting soon.");
        setTimeout(() => {
          this.startSession(session.smsPhone).catch((error) => {
            this.setStatus(session, "error", error instanceof Error ? error.message : String(error));
          });
        }, 2500);
      }
    });

    socket.ev.on("messages.upsert", ({ type, messages }) => {
      if (type !== "notify") return;
      for (const message of messages) {
        const inbound = this.toInbound(session.smsPhone, message);
        if (inbound) void this.inboundHandler(inbound);
      }
    });
  }

  private toInbound(smsPhone: string, message: WAMessage): WhatsAppInboundMessage | null {
    if (!message.message || message.key.fromMe) return null;
    const remoteJid = message.key.remoteJid;
    if (!remoteJid || remoteJid === "status@broadcast" || remoteJid.endsWith("@g.us")) return null;

    const text =
      message.message.conversation ??
      message.message.extendedTextMessage?.text ??
      message.message.imageMessage?.caption ??
      message.message.videoMessage?.caption ??
      "";

    const trimmed = text.trim();
    if (!trimmed) return null;

    return { smsPhone, fromJid: remoteJid, text: trimmed };
  }

  private getOrCreateSession(smsPhone: string): SessionState {
    const existing = this.sessions.get(smsPhone);
    if (existing) return existing;

    const session: SessionState = {
      smsPhone,
      status: "idle",
      qr: null,
      updatedAt: Date.now(),
      subscribers: new Set(),
    };
    this.sessions.set(smsPhone, session);
    return session;
  }

  private setStatus(session: SessionState, status: SessionStatus, error?: string): void {
    session.status = status;
    session.error = error;
    session.updatedAt = Date.now();
    const current = snapshot(session);
    for (const subscriber of session.subscribers) subscriber(current);
    void this.statusHandler(current);
  }

  private authDir(smsPhone: string): string {
    return join(this.dataDir, "wa-sessions", hashPhone(smsPhone));
  }

  private waitForQr(session: SessionState, timeoutMs: number): Promise<void> {
    if (session.qr || session.status === "qr_ready") return Promise.resolve();
    if (session.status === "linked") return Promise.resolve();

    return new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error("Timed out waiting for WhatsApp pairing readiness. Try again."));
      }, timeoutMs);

      unsubscribe = this.subscribe(session.smsPhone, (snapshot) => {
        if (snapshot.status === "qr_ready" || snapshot.status === "linked") {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }

        if (snapshot.status === "error") {
          clearTimeout(timeout);
          unsubscribe();
          reject(new Error(snapshot.error ?? "WhatsApp setup failed."));
        }
      });
    });
  }
}

function snapshot(session: SessionState): SessionSnapshot {
  return {
    smsPhone: session.smsPhone,
    status: session.status,
    hasQr: Boolean(session.qr),
    error: session.error,
    updatedAt: session.updatedAt,
  };
}
