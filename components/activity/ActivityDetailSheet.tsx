"use client";

import { type ReactNode } from "react";
import { Clock } from "lucide-react";
import { CurrencyText } from "@/components/ui/CurrencyText";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import type { ActivityLogRow } from "@/lib/db";
import { hasNumericText } from "@/lib/number-format";

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

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) +
    " · " +
    d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  );
}

function MetadataRow({
  label,
  value,
  isNumeric = false,
}: {
  label: string;
  value: ReactNode;
  isNumeric?: boolean;
}) {
  return (
    <div className="flex justify-between items-start py-3 border-b border-border last:border-0">
      <span className="t-label text-muted-foreground">
        {label}
      </span>
      <span
        className={`text-sm font-semibold text-foreground text-right max-w-[60%] ${
          isNumeric ? "figure" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

const FRIENDLY_KEYS: Record<string, string> = {
  name: "Name",
  amount: "Amount",
  newBalance: "New Balance",
  running_total: "New Balance",
  assetName: "Asset",
  categoryName: "Category",
  type: "Type",
  principal: "Principal",
  target_amount: "Target",
  current_amount: "Current",
  planned_amount: "Planned",
  actual_amount: "Actual",
  note: "Note",
  itemName: "Item",
  debtName: "Debt",
  goalName: "Goal",
  totalPaid: "Total Paid",
  newTotal: "New Total",
};

function formatValue(
  key: string,
  value: unknown
): { content: ReactNode; isNumeric: boolean } {
  if (value === null || value === undefined) {
    return { content: "-", isNumeric: false };
  }
  if (
    typeof value === "number" &&
    (key.toLowerCase().includes("amount") ||
      key.toLowerCase().includes("balance") ||
      key.toLowerCase().includes("total") ||
      key.toLowerCase().includes("principal") ||
      key === "value")
  ) {
    return {
      content: <CurrencyText value={value} />,
      isNumeric: true,
    };
  }
  const stringValue = String(value);
  return {
    content: stringValue,
    isNumeric: hasNumericText(stringValue),
  };
}

interface ActivityDetailSheetProps {
  log: ActivityLogRow | null;
  open: boolean;
  onClose: () => void;
}

export default function ActivityDetailSheet({
  log,
  open,
  onClose,
}: ActivityDetailSheetProps) {
  const metadataEntries = log
    ? Object.entries(log.metadata as Record<string, unknown>).filter(
        ([k, v]) =>
          FRIENDLY_KEYS[k] !== undefined &&
          v !== null &&
          v !== undefined &&
          v !== ""
      )
    : [];

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="sheet-3q bg-card border-border">
        {log && (
          <>
            <DrawerHeader className="text-left px-5 pt-2 pb-0">
              <p className="t-label text-muted-foreground mb-1">
                {categoryLabel(log.category)}
              </p>
              <DrawerTitle className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground leading-tight">
                {log.title}
              </DrawerTitle>
              {log.description !== log.title && (
                <DrawerDescription className="text-sm text-muted-foreground mt-1">
                  {log.description}
                </DrawerDescription>
              )}
            </DrawerHeader>

            <div className="overflow-y-auto flex-1 px-5 pb-10 pt-4">
              {metadataEntries.length > 0 && (
                <div className="bg-tile rounded-2xl px-4 mb-6">
                  {metadataEntries.map(([key, value]) => {
                    const formatted = formatValue(key, value);
                    return (
                      <MetadataRow
                        key={key}
                        label={FRIENDLY_KEYS[key]}
                        value={formatted.content}
                        isNumeric={formatted.isNumeric}
                      />
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock size={14} strokeWidth={1.8} />
                <span className="figure">{formatDateTime(log.created_at)}</span>
              </div>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
