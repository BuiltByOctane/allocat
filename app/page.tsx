import { redirect } from "next/navigation";
import { getAuthedUser } from "@/lib/supabase/server";

export const metadata = {
  title: "AlloCat - Personal Finance, Budgeting & Net Worth Tracker",
  description:
    "AlloCat is a minimalist, offline-first personal finance PWA. Track budgets, debts, goals, and net worth in INR with AI-powered insights.",
  alternates: { canonical: "https://allocat.xyz" },
};

export default async function RootPage() {
  const user = await getAuthedUser();

  if (user) redirect("/dashboard");
  redirect("https://grow.allocat.xyz");
}
