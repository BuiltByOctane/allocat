import { EmptyState } from "../ui/EmptyState";

export default function BudgetEmptyState({
  onSetup,
  carrySourceLabel,
  onCarry,
}: {
  onSetup?: () => void;
  /** When set, the primary CTA becomes "Copy from <month>" (one-tap carry). */
  carrySourceLabel?: string | null;
  onCarry?: () => void;
}) {
  const canCarry = !!carrySourceLabel && !!onCarry;
  return (
    <div className="mt-4">
      <EmptyState
        icon="account_balance_wallet"
        title="No budget for this month yet"
        description={
          canCarry
            ? `Pick up where you left off - copy ${carrySourceLabel}'s budget, or start fresh.`
            : "Set a total and a few categories - you can fine-tune anytime."
        }
        action={
          canCarry
            ? { label: `Copy from ${carrySourceLabel}`, onClick: onCarry }
            : { label: "Set up budget", onClick: onSetup }
        }
        secondaryAction={
          canCarry ? { label: "Start fresh", onClick: onSetup } : undefined
        }
      />
    </div>
  );
}
