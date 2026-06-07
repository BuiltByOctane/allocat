import { EmptyState } from "../ui/EmptyState";

export default function DebtEmptyState({ onAddDebt }: { onAddDebt?: () => void }) {
  return (
    <div className="mt-12">
      <EmptyState
        icon="check_circle"
        title="Clean slate."
        description="Your architecture is clear — no liabilities detected. Maintain the discipline."
        action={{ label: "Add debt", onClick: onAddDebt }}
      />
    </div>
  );
}
