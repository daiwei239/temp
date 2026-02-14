const envApiBase = import.meta.env.VITE_API_BASE_URL?.trim();

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  if (envApiBase) return normalizeBase(envApiBase);

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const host = window.location.hostname;
  return `${protocol}//${host}:8002`;
}

export function getWebSocketUrl(path: string): string {
  const apiBase = getApiBaseUrl();
  const url = new URL(path, `${apiBase}/`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
