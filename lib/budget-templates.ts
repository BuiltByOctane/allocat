export interface TemplateItem {
  name: string;
  /**
   * Stable identity for this item, durable across template edits and re-applies.
   * Used to re-key SMS merchant rules so allocations follow the item from month
   * to month (and survive renames). Predefined templates use hand-assigned slugs;
   * custom templates mint a uuid when first saved. See lib/sms/resolveRuleItem.ts.
   */
  templateItemId: string;
  /** Absolute planned amount in the user's display currency. Optional — predefined templates omit. */
  plannedAmount?: number;
  /** Cross-section link preserved across applies. Predefined templates omit. */
  linkType?: "asset" | "debt" | null;
  linkId?: string | null;
}

export interface TemplateCategory {
  name: string;
  icon: string | null;
  /** % of total budget. null = user must set manually. */
  allocationPct: number | null;
  items: TemplateItem[];
}

export interface BudgetTemplate {
  id: string;
  name: string;
  description: string;
  preview: string[]; // category names shown on the card
  categories: TemplateCategory[];
  isCustom?: boolean;
  savedAt?: string;
}

export const PREDEFINED_TEMPLATES: BudgetTemplate[] = [
  {
    id: "50-30-20",
    name: "50 / 30 / 20",
    description: "Needs · Wants · Savings. A balanced split that works for most.",
    preview: ["Needs 50%", "Wants 30%", "Savings 20%"],
    categories: [
      {
        name: "Needs",
        icon: "🏠",
        allocationPct: 50,
        items: [
          { name: "Rent / EMI", templateItemId: "50-30-20:needs:rent" },
          { name: "Groceries", templateItemId: "50-30-20:needs:groceries" },
          { name: "Utilities", templateItemId: "50-30-20:needs:utilities" },
          { name: "Transport", templateItemId: "50-30-20:needs:transport" },
          { name: "Insurance", templateItemId: "50-30-20:needs:insurance" },
        ],
      },
      {
        name: "Wants",
        icon: "🎉",
        allocationPct: 30,
        items: [
          { name: "Dining Out", templateItemId: "50-30-20:wants:dining" },
          { name: "Entertainment", templateItemId: "50-30-20:wants:entertainment" },
          { name: "Shopping", templateItemId: "50-30-20:wants:shopping" },
          { name: "Subscriptions", templateItemId: "50-30-20:wants:subscriptions" },
        ],
      },
      {
        name: "Savings",
        icon: "💰",
        allocationPct: 20,
        items: [
          { name: "Emergency Fund", templateItemId: "50-30-20:savings:emergency" },
          { name: "Investments", templateItemId: "50-30-20:savings:investments" },
          { name: "Goals", templateItemId: "50-30-20:savings:goals" },
        ],
      },
    ],
  },
  {
    id: "zero-based",
    name: "Zero-Based",
    description: "Every rupee assigned. Allocate until nothing is left.",
    preview: ["Housing", "Food", "Transport", "Savings", "Personal", "Misc"],
    categories: [
      {
        name: "Housing",
        icon: "🏠",
        allocationPct: null,
        items: [
          { name: "Rent / EMI", templateItemId: "zero-based:housing:rent" },
          { name: "Electricity", templateItemId: "zero-based:housing:electricity" },
          { name: "Internet", templateItemId: "zero-based:housing:internet" },
        ],
      },
      {
        name: "Food",
        icon: "🍽️",
        allocationPct: null,
        items: [
          { name: "Groceries", templateItemId: "zero-based:food:groceries" },
          { name: "Dining Out", templateItemId: "zero-based:food:dining" },
        ],
      },
      {
        name: "Transport",
        icon: "🚗",
        allocationPct: null,
        items: [
          { name: "Fuel", templateItemId: "zero-based:transport:fuel" },
          { name: "Public Transport", templateItemId: "zero-based:transport:public" },
        ],
      },
      {
        name: "Savings",
        icon: "💰",
        allocationPct: null,
        items: [
          { name: "Emergency Fund", templateItemId: "zero-based:savings:emergency" },
          { name: "Investments", templateItemId: "zero-based:savings:investments" },
        ],
      },
      {
        name: "Personal",
        icon: "🧴",
        allocationPct: null,
        items: [
          { name: "Health & Fitness", templateItemId: "zero-based:personal:health" },
          { name: "Clothing", templateItemId: "zero-based:personal:clothing" },
          { name: "Entertainment", templateItemId: "zero-based:personal:entertainment" },
        ],
      },
      {
        name: "Misc",
        icon: "📦",
        allocationPct: null,
        items: [
          { name: "Subscriptions", templateItemId: "zero-based:misc:subscriptions" },
          { name: "Gifts", templateItemId: "zero-based:misc:gifts" },
          { name: "Other", templateItemId: "zero-based:misc:other" },
        ],
      },
    ],
  },
  {
    id: "bare-minimum",
    name: "Bare Minimum",
    description: "Essentials only. Track the basics on tight months.",
    preview: ["Essentials", "Transport", "Health"],
    categories: [
      {
        name: "Essentials",
        icon: "🏠",
        allocationPct: null,
        items: [
          { name: "Rent", templateItemId: "bare-minimum:essentials:rent" },
          { name: "Groceries", templateItemId: "bare-minimum:essentials:groceries" },
          { name: "Electricity", templateItemId: "bare-minimum:essentials:electricity" },
          { name: "Water", templateItemId: "bare-minimum:essentials:water" },
        ],
      },
      {
        name: "Transport",
        icon: "🚌",
        allocationPct: null,
        items: [{ name: "Fuel / Commute", templateItemId: "bare-minimum:transport:fuel" }],
      },
      {
        name: "Health",
        icon: "💊",
        allocationPct: null,
        items: [
          { name: "Medicine", templateItemId: "bare-minimum:health:medicine" },
          { name: "Insurance", templateItemId: "bare-minimum:health:insurance" },
        ],
      },
    ],
  },
  {
    id: "blank",
    name: "Blank",
    description: "Start from scratch. Build your own categories and items.",
    preview: [],
    categories: [],
  },
];

// ─── User-saved templates ────────────────────────────────────────────────────
// Custom templates now persist to Supabase via lib/actions/budget-templates.ts
// (getBudgetTemplates / saveBudgetTemplate / deleteBudgetTemplate).
