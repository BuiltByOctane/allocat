import { EmptyState } from "../ui/EmptyState";

export default function DashboardEmptyState() {
  return (
    <div className="mt-12">
      <EmptyState
        icon="monitoring"
        title="No financial data to display"
        description="The path to financial freedom begins with the first entry. Establish your baseline by creating your initial allocation."
        action={{ label: "Create first allocation", href: "/budget" }}
      />
    </div>
  );
}
