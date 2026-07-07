/**
 * Single place the app talks to OpenRouter. Keeps the model id + headers in one
 * spot so the chat route and the weekly-insight action stay in sync. Returns the
 * raw `Response` — callers stream `res.body` (chat) or read `res.json()` (insight).
 */
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Update the model here — used by both the chat route and weekly insights. */
export const OPENROUTER_MODEL = "openai/gpt-oss-120b:free";

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
}): Promise<Response> {
  return fetch(OPENROUTER_URL, {
    method: "POST",
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
  });
}
