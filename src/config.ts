export interface Config {
  port: number;
  dataDir: string;
  publicBaseUrl: string;
  quoApiKey: string;
  quoWebhookKey: string;
  quoFrom: string;
  smsDryRun: boolean;
  setupTtlMs: number;
  defaultWaJid: string;
  testSmsPhone: string | null;
}

export function loadConfig(env = Bun.env): Config {
  const port = Number(env.PORT ?? 3000);
  const quoApiKey = env.QUO_API_KEY ?? "";
  const quoFrom = env.QUO_FROM ?? env.QUO_PHONE_NUMBER_ID ?? "";
  return {
    port,
    dataDir: env.DATA_DIR ?? "./data",
    publicBaseUrl: stripTrailingSlash(env.PUBLIC_BASE_URL ?? `http://localhost:${port}`),
    quoApiKey,
    quoWebhookKey: env.QUO_WEBHOOK_KEY ?? "",
    quoFrom,
    smsDryRun: parseBool(env.SMS_DRY_RUN) ?? (!quoApiKey || !quoFrom),
    setupTtlMs: Number(env.SETUP_LINK_TTL_MS ?? 30 * 60 * 1000),
    defaultWaJid: env.BRIDGY_DEFAULT_WA_JID ?? "",
    testSmsPhone: env.BRIDGY_TEST_SMS_PHONE ?? null,
  };
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function parseBool(value: string | undefined): boolean | null {
  if (value == null || value === "") return null;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return null;
}
