import { EmptyState } from "../ui/EmptyState";

export default function NetWorthEmptyState({ onAddAsset }: { onAddAsset?: () => void }) {
  return (
    <div className="mt-4">
      <EmptyState
        icon="account_balance"
        title="Track your net worth"
        description="Add what you own — bank balance, cash, investments, property — to see your total net worth grow over time."
        action={{ label: "Add an asset", onClick: onAddAsset }}
      />
    </div>
  );
}
