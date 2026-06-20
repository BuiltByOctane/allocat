export interface TemplateItem {
  name: string;
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
          { name: "Rent / EMI" },
          { name: "Groceries" },
          { name: "Utilities" },
          { name: "Transport" },
          { name: "Insurance" },
        ],
      },
      {
        name: "Wants",
        icon: "🎉",
        allocationPct: 30,
        items: [
          { name: "Dining Out" },
          { name: "Entertainment" },
          { name: "Shopping" },
          { name: "Subscriptions" },
        ],
      },
      {
        name: "Savings",
        icon: "💰",
        allocationPct: 20,
        items: [
          { name: "Emergency Fund" },
          { name: "Investments" },
          { name: "Goals" },
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
        items: [{ name: "Rent / EMI" }, { name: "Electricity" }, { name: "Internet" }],
      },
      {
        name: "Food",
        icon: "🍽️",
        allocationPct: null,
        items: [{ name: "Groceries" }, { name: "Dining Out" }],
      },
      {
        name: "Transport",
        icon: "🚗",
        allocationPct: null,
        items: [{ name: "Fuel" }, { name: "Public Transport" }],
      },
      {
        name: "Savings",
        icon: "💰",
        allocationPct: null,
        items: [{ name: "Emergency Fund" }, { name: "Investments" }],
      },
      {
        name: "Personal",
        icon: "🧴",
        allocationPct: null,
        items: [
          { name: "Health & Fitness" },
          { name: "Clothing" },
          { name: "Entertainment" },
        ],
      },
      {
        name: "Misc",
        icon: "📦",
        allocationPct: null,
        items: [{ name: "Subscriptions" }, { name: "Gifts" }, { name: "Other" }],
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
          { name: "Rent" },
          { name: "Groceries" },
          { name: "Electricity" },
          { name: "Water" },
        ],
      },
      {
        name: "Transport",
        icon: "🚌",
        allocationPct: null,
        items: [{ name: "Fuel / Commute" }],
      },
      {
        name: "Health",
        icon: "💊",
        allocationPct: null,
        items: [{ name: "Medicine" }, { name: "Insurance" }],
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
