"use client";

import ReactMarkdown from "react-markdown";
import LoadingQuote from "./LoadingQuote";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

/**
 * Chat bubbles styled to match the onboarding "Ask AlloCat" mock: inverted
 * user bubble on the right, bordered assistant bubble on the left with a small
 * paw trailing the message. Uses theme tokens so it works in light and dark.
 */
export default function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === "user";

  if (isUser) {
    return (
      <div className="mb-3 flex w-full justify-end">
        <div
          className="max-w-[82%] rounded-[20px] rounded-tr-md bg-[var(--pill)] px-4 py-2.5 text-sm leading-relaxed text-[var(--pill-foreground)]"
          style={{ wordBreak: "break-word" }}
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 flex w-full justify-start">
      <div
        className="flex max-w-[88%] items-end gap-1.5 rounded-[20px] rounded-tl-md border border-border bg-card px-4 py-2.5 text-sm leading-relaxed text-foreground"
        style={{ wordBreak: "break-word" }}
      >
        {content ? (
          <>
            <div
              className="prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
              [&_p]:my-1
              [&_ul]:my-1 [&_ul]:pl-4 [&_ul]:list-disc
              [&_ol]:my-1 [&_ol]:pl-4 [&_ol]:list-decimal
              [&_li]:my-0.5
              [&_strong]:font-semibold
              [&_code]:rounded [&_code]:bg-border [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono
              [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-2
              [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2
              [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-1"
            >
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
            <span
              aria-hidden
              className="shrink-0 select-none text-sm leading-none"
            >
              🐾
            </span>
          </>
        ) : (
          isStreaming && <LoadingQuote />
        )}
      </div>
    </div>
  );
}
