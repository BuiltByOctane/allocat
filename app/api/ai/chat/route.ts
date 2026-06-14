import { buildFinancialContext } from "@/lib/actions/ai-chat";
import { detectTopic } from "@/lib/ai-utils";
import { createClient } from "@/lib/supabase/server";
import { openRouterChat } from "@/lib/server/openrouter";
import { getServerEntitlement } from "@/lib/actions/subscription";

// Max number of previous messages to retain in the window (system prompt excluded)
const HISTORY_WINDOW = 8;

// Hard off-topic keywords — checked BEFORE calling the AI
const OFF_TOPIC_PATTERNS =
  /\b(recipe|movie|game|sport|weather|news|code|programming|sing|joke|story|poem|political|religion|travel|fashion|music|celebrity|health advice|medical|legal|romantic|dating)\b/i;

const OFF_TOPIC_REPLY = `data: ${JSON.stringify({
  choices: [{ delta: { content: "I only help with your personal finances. Ask me about your budget, goals, net worth, or debts!" } }],
})}\n\ndata: [DONE]\n\n`;

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // AI chat is Premium-only — guard server-side so a tampered client can't bypass it.
  const entitlement = await getServerEntitlement();
  if (entitlement.tier !== "premium") {
    return new Response(JSON.stringify({ error: "premium_required" }), {
      status: 402,
    });
  }

  const { messages }: { messages: ChatMessage[] } = await req.json();
  const userMessages = (messages ?? []).filter((m) => m.role !== "system");

  // ── 1. Hard off-topic guard (no AI call needed) ───────────────────────────
  const lastUserMsg =
    [...userMessages].reverse().find((m) => m.role === "user")?.content ?? "";

  if (OFF_TOPIC_PATTERNS.test(lastUserMsg)) {
    return new Response(OFF_TOPIC_REPLY, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  // ── 2. Detect topic → fetch only relevant data ────────────────────────────
  const topics = detectTopic(lastUserMsg);
  const context = await buildFinancialContext(topics);

  // ── 3. Build system prompt (sent on every request, size is fixed) ─────────
  const systemPrompt = [
    "You are AlloCat — a calm, observant, and intelligent financial companion built into the AlloCat app.",
    "You have live access to this user's financial data, provided below.",
    "",
    "PERSONALITY:",
    "- Calm and composed. Never reactive, never dramatic.",
    "- Observant and insightful — notice patterns, surface what matters.",
    "- Slightly witty, occasionally sarcastic (always subtle, never mean).",
    "- Supportive, never judgmental.",
    "- Quietly confident.",
    "",
    "CORE BELIEFS:",
    "- People aren't bad with money — they need clarity.",
    "- Budgeting is control, not restriction.",
    "- Mistakes are normal — recovery matters more.",
    "- Small changes lead to stability.",
    "",
    "RESPONSE STYLE — follow strictly:",
    "- Max 1–2 sentences in most cases. Occasionally 3 if truly necessary.",
    "- No paragraphs. No long explanations unless explicitly asked.",
    "- Each sentence should feel intentional.",
    "- Guide, don't instruct. Suggest, don't command.",
    "- Natural, conversational tone. Minimal words, maximum meaning.",
    "- No emojis. No fluff. No financial jargon unless needed.",
    "- No guilt-inducing language. No lectures.",
    "",
    "STRICT DATA RULES:",
    "1. ONLY answer questions about the user's personal finances (budget, spending, goals, debts, net worth).",
    "2. Never make up numbers. Only use figures from the data below.",
    "3. Distinguish between 'Your Debts' (money you owe) and 'Money Owed to You' (receivables).",
    "4. Use the currency shown in the 'User currency' header at the top of the data below. Match that symbol/code for all amounts.",
    "",
    "GOAL: Make the user feel calm, in control, and capable — like they always land on their feet.",
    "",
    "User's current financial data:",
    context,
  ].join("\n");

  // ── 4. Sliding window — only last N messages, never grow unbounded ─────────
  const windowedMessages = userMessages.slice(-HISTORY_WINDOW);

  // ── 5. Call OpenRouter ────────────────────────────────────────────────────
  const openRouterRes = await openRouterChat({
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...windowedMessages,
    ],
  });

  if (!openRouterRes.ok) {
    const err = await openRouterRes.text();
    return new Response(JSON.stringify({ error: err }), {
      status: openRouterRes.status,
    });
  }

  return new Response(openRouterRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
