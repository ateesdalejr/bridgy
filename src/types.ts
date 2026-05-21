export type UserStatus = "new" | "pending_link" | "linked" | "error";

export interface Contact {
  alias: string;
  smsPhone: string;
  waJid: string;
  phone: string | null;
}

export interface SetupLink {
  code: string;
  smsPhone: string;
  expiresAt: number;
  consumedAt: number | null;
}

export type SessionStatus =
  | "idle"
  | "connecting"
  | "qr_ready"
  | "linked"
  | "disconnected"
  | "error";

export interface SessionSnapshot {
  smsPhone: string;
  status: SessionStatus;
  hasQr: boolean;
  error?: string;
  updatedAt: number;
}

export interface WhatsAppInboundMessage {
  smsPhone: string;
  fromJid: string;
  text: string;
}

export interface QuoInboundMessage {
  eventId: string;
  messageId: string;
  from: string;
  to: string;
  text: string;
  phoneNumberId?: string;
}

export interface WebhookDelivery {
  id: string;
  source: string;
  eventType: string | null;
  fromPhone: string | null;
  textPreview: string | null;
  status: string;
  error: string | null;
  receivedAt: number;
}
