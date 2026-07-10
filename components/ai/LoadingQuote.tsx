"use client";

import { useEffect, useState } from "react";

const QUOTES = [
  "\"Do not save what is left after spending, but spend what is left after saving.\" - Warren Buffett",
  "\"A budget is telling your money where to go instead of wondering where it went.\" - Dave Ramsey",
  "\"The goal isn't more money. The goal is living life on your terms.\" - Chris Brogan",
  "\"An investment in knowledge pays the best interest.\" - Benjamin Franklin",
  "\"Financial freedom is available to those who learn about it and work for it.\" - Robert Kiyosaki",
  "\"Beware of little expenses; a small leak will sink a great ship.\" - Benjamin Franklin",
  "\"It's not how much money you make, but how much money you keep.\" - Robert Kiyosaki",
  "\"Never spend your money before you have it.\" - Thomas Jefferson",
  "\"The secret to wealth is simple: Find a way to do more for others than anyone else does.\" - Tony Robbins",
  "\"Money is a terrible master but an excellent servant.\" - P.T. Barnum",
  "\"Wealth consists not in having great possessions, but in having few wants.\" - Epictetus",
  "\"Compound interest is the eighth wonder of the world.\" - Albert Einstein",
  "\"Wealth isn't about how much you make - it's about how much you keep.\"",
  "\"Money doesn't change people - it reveals their discipline.\"",
  "\"To grow financially, you must outgrow your limiting beliefs.\"",
  "\"Wealth is a result of consistent choices, not random luck.\"",
  "\"The mindset that fears risk will never unlock freedom.\"",
  "\"Don't chase money - chase the value that creates it.\"",
  "\"Wealth begins where excuses end.\"",
  "\"If you would be wealthy, think of saving as well as getting.\" - Benjamin Franklin",
  "\"Money grows on the tree of persistence.\" - Japanese proverb",
  "\"Every dollar saved is a seed for future growth.\"",
  "\"Freedom is earned by those who set financial goals and stick to them.\"",
  "\"If you're saving, you're succeeding.\" - Steve Burkholder",
  "\"Annual income twenty pounds, annual expenditure nineteen six, result happiness.\" - Charles Dickens",
  "\"Hustle turns dreams into deposits.\"",
  "\"Success doesn't respond to wishes - only to action and focus.\"",
  "\"The hustle is hard now so freedom can be easy later.\"",
  "\"The single most powerful asset we all have is our mind. If it is trained well, it can create enormous wealth.\" - Robert Kiyosaki",
  "\"Money is only a tool. It will take you wherever you wish, but it will not replace you as the driver.\" - Ayn Rand",
  "\"Formal education will make you a living; self-education will make you a fortune.\" - Jim Rohn",
  "\"The bitterness of poor quality remains long after the sweetness of low price is forgotten.\" - Benjamin Franklin",
  "\"Budgeting your money is the key to having enough.\" - Elizabeth Warren",
  "\"It’s not your salary that makes you rich, it’s your spending habits.\" - Charles A. Jaffe",
  "\"Price is what you pay. Value is what you get.\" - Warren Buffett",
];

function getRandom(exclude?: string): string {
  const pool = QUOTES.filter((q) => q !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function LoadingQuote() {
  const [quote, setQuote] = useState(() => getRandom());

  // Shuffle every 4 seconds while waiting
  useEffect(() => {
    const id = setInterval(() => {
      setQuote((prev) => getRandom(prev));
    }, 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {/* Spinner */}
      <div className="flex items-center gap-2 opacity-60">
        <svg
          className="animate-spin h-3.5 w-3.5 shrink-0 text-current"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12" cy="12" r="10"
            stroke="currentColor" strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <span className="text-xs opacity-70">AlloCat is thinking…</span>
      </div>

      {/* Shuffling quote */}
      <p className="text-xs italic leading-relaxed opacity-45 select-none transition-opacity duration-500">
        {quote}
      </p>
    </div>
  );
}
