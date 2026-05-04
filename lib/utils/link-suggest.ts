export type LinkType = "asset" | "debt";

export interface LinkSuggestion {
  link_type: LinkType | null;
  reason: string;
}

const DEBT_PATTERN = /\b(emi|loan|repay|debt|mortgage|credit\s*card)\b/i;
const ASSET_PATTERN = /\b(sip|invest|stock|mutual\s*fund|fd|deposit|crypto|gold|emergency|fund|target|saving)\b/i;

export function suggestLink(
  categoryType: "needs" | "wants" | "investments" | "misc" | string | null | undefined,
  itemName: string
): LinkSuggestion {
  const name = itemName.trim();

  if (categoryType === "investments") {
    return { link_type: "asset", reason: "Investment category" };
  }

  if (DEBT_PATTERN.test(name)) {
    return { link_type: "debt", reason: "Name suggests a debt repayment" };
  }
  if (ASSET_PATTERN.test(name)) {
    return { link_type: "asset", reason: "Name suggests an asset / goal" };
  }

  return { link_type: null, reason: "No suggestion" };
}
