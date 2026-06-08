"use client";

import { ChevronRight, ReceiptText, Landmark, Flag, CreditCard } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { ActivityLogRow } from "@/lib/db";

function CategoryIcon({ category }: { category: ActivityLogRow["category"] }) {
  const props = { size: 18, strokeWidth: 1.7 } as const;
  switch (category) {
    case "budget":
      return <ReceiptText {...props} />;
    case "net_worth":
      return <Landmark {...props} />;
    case "goals":
      return <Flag {...props} />;
    case "debts":
      return <CreditCard {...props} />;
    default:
      return <ReceiptText {...props} />;
  }
}

function categoryLabel(category: ActivityLogRow["category"]) {
  switch (category) {
    case "budget":
      return "Budget";
    case "net_worth":
      return "Net Worth";
    case "goals":
      return "Goals";
    case "debts":
      return "Debts";
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

interface ActivityLogItemProps {
  log: ActivityLogRow;
  onClick: () => void;
}

export default function ActivityLogItem({ log, onClick }: ActivityLogItemProps) {
  return (
    <button onClick={onClick} className="block w-full text-left active:scale-[0.99] transition-transform">
      <Card compact className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tile text-muted-foreground">
          <CategoryIcon category={log.category} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-bold text-foreground leading-snug truncate">
            {log.title}
          </p>
          <p className="text-[10.5px] font-medium text-muted-foreground mt-0.5 truncate">
            {categoryLabel(log.category)} ·{" "}
            <span className="figure">{formatTime(log.created_at)}</span>
          </p>
        </div>

        <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" />
      </Card>
    </button>
  );
}
