import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Contact, SetupLink, UserStatus, WebhookDelivery } from "./types";
import { generateSetupCode, nowMs } from "./utils";

interface UserRow {
  sms_phone: string;
  status: UserStatus;
  active_chat_jid: string | null;
}

interface ContactRow {
  alias: string;
  sms_phone: string;
  wa_jid: string;
  phone: string | null;
}

interface SetupLinkRow {
  code: string;
  sms_phone: string;
  expires_at: number;
  consumed_at: number | null;
}

export class Store {
  readonly db: Database;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new Database(join(dataDir, "bridgy.sqlite"), { create: true });
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
    `);
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  getOrCreateUser(smsPhone: string): UserRow {
    const existing = this.getUser(smsPhone);
    if (existing) return existing;

    const now = nowMs();
    this.db
      .query("INSERT INTO users (sms_phone, status, created_at, updated_at) VALUES (?, 'new', ?, ?)")
      .run(smsPhone, now, now);
    return this.getUser(smsPhone)!;
  }

  getUser(smsPhone: string): UserRow | null {
    return this.db
      .query<UserRow, [string]>("SELECT sms_phone, status, active_chat_jid FROM users WHERE sms_phone = ?")
      .get(smsPhone);
  }

  setUserStatus(smsPhone: string, status: UserStatus): void {
    this.getOrCreateUser(smsPhone);
    this.db.query("UPDATE users SET status = ?, updated_at = ? WHERE sms_phone = ?").run(status, nowMs(), smsPhone);
  }

  setActiveChat(smsPhone: string, waJid: string | null): void {
    this.getOrCreateUser(smsPhone);
    this.db.query("UPDATE users SET active_chat_jid = ?, updated_at = ? WHERE sms_phone = ?").run(waJid, nowMs(), smsPhone);
  }

  listLinkedUsers(): string[] {
    return this.db
      .query<{ sms_phone: string }, []>("SELECT sms_phone FROM users WHERE status = 'linked'")
      .all()
      .map((row) => row.sms_phone);
  }

  createSetupLink(smsPhone: string, ttlMs: number): SetupLink {
    this.getOrCreateUser(smsPhone);
    const expiresAt = nowMs() + ttlMs;

    for (let i = 0; i < 8; i++) {
      const code = generateSetupCode();
      try {
        this.db
          .query("INSERT INTO setup_links (code, sms_phone, expires_at, created_at) VALUES (?, ?, ?, ?)")
          .run(code, smsPhone, expiresAt, nowMs());
        return { code, smsPhone, expiresAt, consumedAt: null };
      } catch (error) {
        if (i === 7) throw error;
      }
    }

    throw new Error("Unable to create setup code.");
  }

  getSetupLink(code: string): SetupLink | null {
    const row = this.db
      .query<SetupLinkRow, [string]>("SELECT code, sms_phone, expires_at, consumed_at FROM setup_links WHERE code = ?")
      .get(code.toUpperCase());
    if (!row) return null;
    return { code: row.code, smsPhone: row.sms_phone, expiresAt: row.expires_at, consumedAt: row.consumed_at };
  }

  markSetupConsumed(code: string): void {
    this.db.query("UPDATE setup_links SET consumed_at = ? WHERE code = ?").run(nowMs(), code.toUpperCase());
  }

  addContact(smsPhone: string, alias: string, waJid: string, phone: string | null): Contact {
    this.getOrCreateUser(smsPhone);
    this.db
      .query(
        `INSERT INTO contacts (sms_phone, alias, wa_jid, phone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(sms_phone, alias)
         DO UPDATE SET wa_jid = excluded.wa_jid, phone = excluded.phone, updated_at = excluded.updated_at`,
      )
      .run(smsPhone, alias, waJid, phone, nowMs(), nowMs());
    return this.getContactByAlias(smsPhone, alias)!;
  }

  getContactByAlias(smsPhone: string, alias: string): Contact | null {
    const row = this.db
      .query<ContactRow, [string, string]>(
        "SELECT alias, sms_phone, wa_jid, phone FROM contacts WHERE sms_phone = ? AND alias = ?",
      )
      .get(smsPhone, alias.toLowerCase());
    return row && contactFromRow(row);
  }

  getContactByJid(smsPhone: string, waJid: string): Contact | null {
    const row = this.db
      .query<ContactRow, [string, string]>(
        "SELECT alias, sms_phone, wa_jid, phone FROM contacts WHERE sms_phone = ? AND wa_jid = ? ORDER BY updated_at DESC LIMIT 1",
      )
      .get(smsPhone, waJid);
    return row && contactFromRow(row);
  }

  listContacts(smsPhone: string): Contact[] {
    return this.db
      .query<ContactRow, [string]>(
        "SELECT alias, sms_phone, wa_jid, phone FROM contacts WHERE sms_phone = ? ORDER BY alias ASC",
      )
      .all(smsPhone)
      .map(contactFromRow);
  }

  markWebhookProcessed(id: string): boolean {
    try {
      this.db.query("INSERT INTO processed_webhooks (id, processed_at) VALUES (?, ?)").run(id, nowMs());
      return true;
    } catch {
      return false;
    }
  }

  recordWebhookDelivery(delivery: WebhookDelivery): void {
    this.db
      .query(
        `INSERT INTO webhook_deliveries
          (id, source, event_type, from_phone, text_preview, status, error, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id)
         DO UPDATE SET
          event_type = excluded.event_type,
          from_phone = excluded.from_phone,
          text_preview = excluded.text_preview,
          status = excluded.status,
          error = excluded.error,
          received_at = excluded.received_at`,
      )
      .run(
        delivery.id,
        delivery.source,
        delivery.eventType,
        delivery.fromPhone,
        delivery.textPreview,
        delivery.status,
        delivery.error,
        delivery.receivedAt,
      );
  }

  listWebhookDeliveries(limit = 20): WebhookDelivery[] {
    return this.db
      .query<
        {
          id: string;
          source: string;
          event_type: string | null;
          from_phone: string | null;
          text_preview: string | null;
          status: string;
          error: string | null;
          received_at: number;
        },
        [number]
      >(
        `SELECT id, source, event_type, from_phone, text_preview, status, error, received_at
         FROM webhook_deliveries
         ORDER BY received_at DESC
         LIMIT ?`,
      )
      .all(limit)
      .map((row) => ({
        id: row.id,
        source: row.source,
        eventType: row.event_type,
        fromPhone: row.from_phone,
        textPreview: row.text_preview,
        status: row.status,
        error: row.error,
        receivedAt: row.received_at,
      }));
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        sms_phone TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'new',
        active_chat_jid TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS setup_links (
        code TEXT PRIMARY KEY,
        sms_phone TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_setup_links_sms_phone ON setup_links (sms_phone);

      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sms_phone TEXT NOT NULL,
        alias TEXT NOT NULL,
        wa_jid TEXT NOT NULL,
        phone TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (sms_phone, alias)
      );

      CREATE INDEX IF NOT EXISTS idx_contacts_jid ON contacts (sms_phone, wa_jid);

      CREATE TABLE IF NOT EXISTS processed_webhooks (
        id TEXT PRIMARY KEY,
        processed_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        event_type TEXT,
        from_phone TEXT,
        text_preview TEXT,
        status TEXT NOT NULL,
        error TEXT,
        received_at INTEGER NOT NULL
      );
    `);
  }
}

function contactFromRow(row: ContactRow): Contact {
  return {
    alias: row.alias,
    smsPhone: row.sms_phone,
    waJid: row.wa_jid,
    phone: row.phone,
  };
}
