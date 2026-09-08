/**
 * Single place the app talks to OpenRouter. Keeps the model id + headers in one
 * spot so the chat route and the weekly-insight action stay in sync. Returns the
 * raw `Response` — callers stream `res.body` (chat) or read `res.json()` (insight).
 */
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Update the model here — used by both the chat route and weekly insights. */
export const OPENROUTER_MODEL = "openrouter/free";

export type ORMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function openRouterChat(opts: {
  messages: ORMessage[];
  /** SSE stream (chat) vs single JSON response (insight). Default false. */
  stream?: boolean;
  /** Ask the model to return a JSON object (insight). */
  json?: boolean;
  /** Abort if the upstream sends no response headers within this long. Default 45s. */
  timeoutMs?: number;
}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("OpenRouter request timed out", "TimeoutError")),
    opts.timeoutMs ?? 45_000,
  );
  // Node keeps the event loop alive for a pending timer; this one must never
  // hold a serverless invocation open on its own.
  timer.unref?.();

  return fetch(OPENROUTER_URL, {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://allocat.xyz",
      "X-Title": "AlloCat",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      stream: opts.stream ?? false,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      messages: opts.messages,
    }),
  }).then(
    (res) => {
      // The signal stays bound to the whole fetch, body included. For a streamed
      // completion the body legitimately outlives the timeout, so once headers
      // prove the upstream is alive we disarm — otherwise a working answer gets
      // cut off mid-stream. Non-streaming callers read the body immediately, so
      // their timer stays armed and still guards a hung body.
      if (opts.stream) clearTimeout(timer);
      return res;
    },
    (err) => {
      clearTimeout(timer);
      throw err;
    },
  );
}
