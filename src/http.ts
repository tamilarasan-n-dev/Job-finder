const UA = "job-finder/1.0 (+personal job alert bot; contact via repo owner)";

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET with timeout and a couple of retries on network errors / 429 / 5xx.
 * 4xx (other than 429) fails immediately — usually a wrong slug.
 */
export async function get(url: string, opts: { timeoutMs?: number; retries?: number; accept?: string } = {}): Promise<string> {
  const { timeoutMs = 20_000, retries = 2, accept = "application/json" } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      if (res.ok) return await res.text();
      const err = new HttpError(res.status, url);
      if (res.status !== 429 && res.status < 500) throw err;
      lastErr = err;
    } catch (e) {
      if (e instanceof HttpError && e.status !== 429 && e.status < 500) throw e;
      lastErr = e;
    }
    if (attempt < retries) await sleep(1000 * 2 ** attempt);
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function getJson<T>(url: string, opts?: { timeoutMs?: number; retries?: number }): Promise<T> {
  const text = await get(url, opts);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from ${url}`);
  }
}

/** Run async tasks with a concurrency cap. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}
