// Personalized dashboard greeting helpers.
// Pure functions — caller supplies `hour` and `index` so randomness/clock stay
// at the call site (testable, no module-scope Date/Math.random).

export function getTimeGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// General witty subtext lines (INR / en-IN tone, matches app voice).
const WITTY_LINES = [
  "Let's make every rupee count.",
  "Your money, your rules.",
  "Small saves, big wins.",
  "Where's the money going? Let's see.",
  "Budget like a boss.",
  "Money talks - you're listening.",
  "Every rupee has a job today.",
] as const;

// Time-aware lines override the general pool when the clock fits.
const LATE_NIGHT = "Late-night budgeting? Respect.";
const EARLY_BIRD = "Up early, on top of it.";

export const WITTY_POOL_LEN = WITTY_LINES.length;

export function getWittyLine(hour: number, index: number): string {
  if (hour >= 22 || hour < 5) return LATE_NIGHT;
  if (hour < 7) return EARLY_BIRD;
  const i = ((index % WITTY_POOL_LEN) + WITTY_POOL_LEN) % WITTY_POOL_LEN;
  return WITTY_LINES[i];
}
