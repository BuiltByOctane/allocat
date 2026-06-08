"use client";

import PawLogo from "./PawLogo";

const SUGGESTED_PROMPTS = [
  "How is my budget looking this month? 📊",
  "Which category am I overspending in?",
  "How close am I to my savings goals? 🎯",
  "What's my current net worth?",
  "Summarise my debts and suggest a payoff priority.",
  "Where can I cut spending this month?",
];

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
}

export default function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className="px-4 pb-2">
      <div className="mb-6 text-center">
        <PawLogo size={56} className="mx-auto mb-3 h-14 w-14" />
        <p className="font-display text-[22px] font-bold tracking-[-0.02em] text-foreground">
          Hey! I&apos;m AlloCat 🐈
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your personal finance buddy. Ask me anything about your money!
        </p>
      </div>

      <p className="t-label mb-2.5 px-1 text-muted-foreground">
        Suggested questions
      </p>
      <div className="flex flex-col gap-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onSelect(prompt)}
            className="w-full rounded-2xl bg-card border border-border px-4 py-3.5 text-left text-sm font-semibold text-foreground transition-all hover:bg-muted active:scale-[0.99]"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
