import { EmptyState } from "../ui/EmptyState";

export default function BudgetEmptyState({
  onSetup,
  onAddCategory,
}: {
  onSetup?: () => void;
  onAddCategory?: () => void;
}) {
  return (
    <div className="mt-4">
      <EmptyState
        icon="account_balance_wallet"
        title="No categories yet"
        description="Your budget is empty. Use a template to set up quickly, or add categories one by one."
        action={{ label: "Set up budget", onClick: onSetup }}
        secondaryAction={{ label: "Add manually", onClick: onAddCategory }}
      />
    </div>
  );
}
