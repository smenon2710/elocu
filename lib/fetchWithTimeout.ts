/**
 * Guards a fetch call end-to-end, including reading the response body via
 * `onResponse` — not just the initial connection. A bare `fetch()` promise
 * resolves as soon as headers arrive; the body can still stream in slowly
 * afterward (seen in practice with free OpenRouter models: response starts
 * in a couple seconds, then the JSON body trickles in over 30-60s). Clearing
 * the abort timer right after `fetch()` resolves — the previous version of
 * this function — leaves that slow-body window completely unguarded.
 */
export async function fetchWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  onResponse: (res: Response) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return await onResponse(res);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
