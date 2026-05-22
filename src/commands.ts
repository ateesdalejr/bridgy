import { normalizeE164 } from "./utils";

export type SmsCommand =
  | { type: "start" }
  | { type: "menu" }
  | { type: "carrier_reserved"; keyword: "HELP" | "STOP" | "START" }
  | { type: "reset" }
  | { type: "delete" }
  | { type: "who" }
  | { type: "add"; alias: string; phone: string }
  | { type: "send_alias"; alias: string; text: string }
  | { type: "send_phone"; phone: string; text: string }
  | { type: "plain"; text: string }
  | { type: "invalid"; reason: string };

const ALIAS_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/;

export function parseSmsCommand(input: string): SmsCommand {
  const text = input.trim();
  if (!text) return { type: "invalid", reason: "Empty message." };

  const upper = text.toUpperCase();
  if (upper === "START" || upper === "LINK") return { type: "start" };
  if (upper === "HELP" || upper === "STOP") return { type: "carrier_reserved", keyword: upper };
  if (upper === "MENU" || upper === "COMMANDS") return { type: "menu" };
  if (upper === "RESET") return { type: "reset" };
  if (upper === "DELETE") return { type: "delete" };
  if (upper === "WHO") return { type: "who" };

  const add = text.match(/^ADD\s+(\S+)\s+(.+)$/i);
  if (add) {
    const alias = add[1].toLowerCase();
    const phone = normalizeE164(add[2]);
    if (!ALIAS_RE.test(alias)) return { type: "invalid", reason: "Alias must start with a letter and use letters, numbers, _ or -." };
    if (!phone) return { type: "invalid", reason: "Phone number must be E.164, like +15551234567." };
    return { type: "add", alias, phone };
  }

  const directed = text.match(/^@(\S+)\s+([\s\S]+)$/);
  if (directed) {
    const target = directed[1];
    const body = directed[2].trim();
    if (!body) return { type: "invalid", reason: "Message cannot be empty." };

    if (target.startsWith("+")) {
      const phone = normalizeE164(target);
      if (!phone) return { type: "invalid", reason: "Phone number must be E.164, like +15551234567." };
      return { type: "send_phone", phone, text: body };
    }

    const alias = target.toLowerCase();
    if (!ALIAS_RE.test(alias)) return { type: "invalid", reason: "Unknown target format. Use @alias message or @+15551234567 message." };
    return { type: "send_alias", alias, text: body };
  }

  return { type: "plain", text };
}

export function helpText(): string {
  return [
    "Bridgy commands:",
    "START - link WhatsApp",
    "MENU - show commands",
    "ADD mom +15551234567",
    "@mom hello",
    "@+15551234567 hello",
    "WHO - list contacts",
    "RESET - unlink locally",
    "DELETE - delete local Bridgy data",
  ].join("\n");
}
