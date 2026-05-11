import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "AlloCat — Personal Finance, Budgeting & Net Worth Tracker",
  description:
    "AlloCat is a minimalist, offline-first personal finance PWA. Track budgets, debts, goals, and net worth in INR with AI-powered insights.",
  alternates: { canonical: "https://allocat.app" },
};

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <main className="min-h-[100dvh] w-full bg-background text-foreground flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-2xl w-full mx-auto text-center space-y-6">
        <Image
          src="/allocat-logo.png"
          alt="AlloCat logo"
          width={72}
          height={72}
          className="mx-auto"
          priority
        />
        <h1 className="text-4xl md:text-5xl font-display font-semibold tracking-tight">
          AlloCat
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground">
          Personal finance, budgeting & net worth tracker
        </p>
        <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
          AlloCat is a minimalist, offline-first personal finance PWA. Track
          budgets, debts, goals, and net worth in INR with AI-powered insights.
          Free to use.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Link
            href="/auth/signup"
            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition"
          >
            Get started — free
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center px-6 py-3 rounded-full border border-border font-medium hover:bg-muted transition"
          >
            Sign in
          </Link>
          <a
            href="https://grow.allocat.app"
            className="inline-flex items-center justify-center px-6 py-3 rounded-full border border-border font-medium hover:bg-muted transition"
          >
            Learn more
          </a>
        </div>

        <section className="pt-10 text-left grid sm:grid-cols-2 gap-4 text-sm">
          <div className="border border-border rounded-xl p-4">
            <h2 className="font-display font-semibold mb-1">Budgeting</h2>
            <p className="text-muted-foreground">
              Monthly budgets with categories, templates, and per-item caps.
            </p>
          </div>
          <div className="border border-border rounded-xl p-4">
            <h2 className="font-display font-semibold mb-1">Net Worth</h2>
            <p className="text-muted-foreground">
              Track assets, liabilities, and historical net-worth snapshots.
            </p>
          </div>
          <div className="border border-border rounded-xl p-4">
            <h2 className="font-display font-semibold mb-1">Debt Tracker</h2>
            <p className="text-muted-foreground">
              Manage loans, EMIs, and payoff plans alongside your budget.
            </p>
          </div>
          <div className="border border-border rounded-xl p-4">
            <h2 className="font-display font-semibold mb-1">Goals & AI</h2>
            <p className="text-muted-foreground">
              Financial goals plus AI-powered insights on your spending.
            </p>
          </div>
        </section>

        <p className="text-xs text-muted-foreground pt-8">
          Offline-first PWA · Works on Android, iOS, Windows, macOS · Free
        </p>
      </div>
    </main>
  );
}
