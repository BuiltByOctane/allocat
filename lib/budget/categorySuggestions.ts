import { PREDEFINED_TEMPLATES } from "@/lib/budget-templates";

/**
 * Curated fallback per category type, used when a category's name doesn't
 * match any predefined template category (e.g. a renamed or custom category).
 */
const TYPE_FALLBACK: Record<string, string[]> = {
  needs: ["Rent / EMI", "Groceries", "Utilities", "Transport", "Insurance"],
  wants: ["Dining Out", "Entertainment", "Shopping", "Subscriptions"],
  investments: ["Emergency Fund", "Investments", "Goals"],
  misc: ["Subscriptions", "Gifts", "Other"],
};

/**
 * Quick-add item name suggestions for a category: item names from any
 * predefined template category with a matching name, falling back to a
 * curated list per category type. Recognition over recall — most first
 * items should be a tap, not typing.
 */
export function suggestItemNames(
  categoryName: string,
  categoryType?: string | null
): string[] {
  const nameLower = categoryName.trim().toLowerCase();
  const matched = new Set<string>();

  if (nameLower) {
    for (const template of PREDEFINED_TEMPLATES) {
      for (const cat of template.categories) {
        if (cat.name.toLowerCase() === nameLower) {
          cat.items.forEach((i) => matched.add(i.name));
        }
      }
    }
  }

  if (matched.size === 0 && categoryType && TYPE_FALLBACK[categoryType]) {
    TYPE_FALLBACK[categoryType].forEach((n) => matched.add(n));
  }

  return Array.from(matched).slice(0, 6);
}
