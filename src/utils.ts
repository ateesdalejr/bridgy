import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function nowMs(): number {
  return Date.now();
}

export function normalizeE164(input: string): string | null {
  const trimmed = input.trim().replace(/[()\s.-]/g, "");
  if (/^\+[1-9]\d{1,14}$/.test(trimmed)) return trimmed;
  return null;
}

export function phoneToWhatsAppJid(phone: string): string {
  const normalized = normalizeE164(phone);
  if (!normalized) throw new Error(`Invalid E.164 phone number: ${phone}`);
  return `${normalized.slice(1)}@s.whatsapp.net`;
}

export function whatsappJidToPhone(jid: string): string | null {
  const match = jid.match(/^(\d+)@s\.whatsapp\.net$/);
  return match ? `+${match[1]}` : null;
}

export function hashPhone(phone: string): string {
  return createHash("sha256").update(phone).digest("hex").slice(0, 24);
}

export function generateSetupCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function toShortDisplayPhone(phone: string): string {
  return phone.length > 4 ? `...${phone.slice(-4)}` : phone;
}
