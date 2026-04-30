export async function fetchJson(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message = data?.error || `HTTP ${response.status}`;
      throw new Error(message);
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}
