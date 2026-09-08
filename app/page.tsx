import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session";

export const metadata = {
  title: "AlloCat - Personal Finance, Budgeting & Net Worth Tracker",
  description:
    "AlloCat is a minimalist, offline-first personal finance PWA. Track budgets, debts, goals, and net worth in INR with AI-powered insights.",
  alternates: { canonical: "https://allocat.xyz" },
};

export default async function RootPage() {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (user) redirect("/dashboard");
  redirect("https://grow.allocat.xyz");
}
