export interface QuoEnv {
  apiKey: string;
  publicBaseUrl: string;
  from: string;
  webhookKey: string;
  webhookId: string;
  testTo: string;
}

export function loadQuoEnv(): QuoEnv {
  return {
    apiKey: Bun.env.QUO_API_KEY ?? "",
    publicBaseUrl: stripTrailingSlash(Bun.env.PUBLIC_BASE_URL ?? ""),
    from: Bun.env.QUO_FROM ?? Bun.env.QUO_PHONE_NUMBER_ID ?? "",
    webhookKey: Bun.env.QUO_WEBHOOK_KEY ?? "",
    webhookId: Bun.env.QUO_WEBHOOK_ID ?? "",
    testTo: Bun.env.QUO_TEST_TO ?? Bun.env.BRIDGY_TEST_SMS_PHONE ?? "",
  };
}

export function requireEnv(name: keyof QuoEnv, value: string): string {
  if (!value) {
    throw new Error(`${envName(name)} is required.`);
  }
  return value;
}

export async function quoFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const env = loadQuoEnv();
  const apiKey = requireEnv("apiKey", env.apiKey);
  return fetch(`https://api.openphone.com${path}`, {
    ...init,
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

export async function printResponse(response: Response): Promise<void> {
  const body = await response.text();
  if (!response.ok) {
    console.error(`HTTP ${response.status}`);
    console.error(body);
    process.exit(1);
  }

  try {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  } catch {
    console.log(body);
  }
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function envName(name: keyof QuoEnv): string {
  switch (name) {
    case "apiKey":
      return "QUO_API_KEY";
    case "publicBaseUrl":
      return "PUBLIC_BASE_URL";
    case "from":
      return "QUO_FROM";
    case "webhookKey":
      return "QUO_WEBHOOK_KEY";
    case "webhookId":
      return "QUO_WEBHOOK_ID";
    case "testTo":
      return "QUO_TEST_TO";
  }
}
