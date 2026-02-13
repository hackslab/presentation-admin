const DEFAULT_BOT_API_URL = "http://localhost:3000";

function getBotApiBaseUrl() {
  const configured = process.env.BOT_API_URL?.trim();
  const baseUrl = configured && configured.length > 0 ? configured : DEFAULT_BOT_API_URL;
  return baseUrl.replace(/\/+$/, "");
}

function readErrorMessage(status: number) {
  return `Bot API request failed with status ${status}`;
}

export async function botApiRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);

  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${getBotApiBaseUrl()}${normalizedPath}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  return response;
}

export async function readBotApiPayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return {
    message: text || readErrorMessage(response.status),
  };
}
