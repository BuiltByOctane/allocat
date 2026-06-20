import { EmptyState } from "../ui/EmptyState";

export default function DebtEmptyState({ onAddDebt }: { onAddDebt?: () => void }) {
  return (
    <div className="mt-12">
      <EmptyState
        icon="account_balance_wallet"
        title="No debts yet"
        description="Track loans you owe (credit card, EMI, a friend) or money you've lent out — and watch the balance shrink as you pay it down."
        action={{ label: "Add a debt or loan", onClick: onAddDebt }}
      />
    </div>
  );
}
