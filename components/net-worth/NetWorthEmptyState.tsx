import { EmptyState } from "../ui/EmptyState";

export default function NetWorthEmptyState({ onAddAsset }: { onAddAsset?: () => void }) {
  return (
    <div className="mt-12">
      <EmptyState
        icon="account_balance"
        title="Track your wealth"
        description="Your financial picture starts here. Manually add assets to visualize your path."
        action={{ label: "Add asset", onClick: onAddAsset }}
      />
    </div>
  );
}
