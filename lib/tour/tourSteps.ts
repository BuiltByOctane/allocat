import type { DriveStep } from "driver.js";
import type { TourPage } from "./types";

export const TOUR_STEPS: Record<TourPage, DriveStep[]> = {
  dashboard: [
    {
      element: "#dashboard-budget-summary",
      popover: {
        title: "Monthly Budget",
        description:
          "Your total income allocation for the month. Tap the number to edit it inline. The progress bar shows how much has been spent so far.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "#dashboard-budget-progress",
      popover: {
        title: "Spending Progress",
        description:
          "Each tick represents ~3% of your budget. Fills left to right as you log spending across categories. Red means you've gone over.",
        side: "top",
        align: "start",
      },
    },
    {
      element: "#dashboard-quick-spend",
      popover: {
        title: "Quick Logger",
        description:
          "Log a spend instantly from here — pick a category, pick an item, enter the amount. No need to navigate to Budget.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "#dashboard-net-worth-section",
      popover: {
        title: "Net Worth Snapshot",
        description:
          "Total Assets minus Total Liabilities. The percentage shows change from the previous month. Goes up as you save and pay down debt.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "#dashboard-net-worth-chart",
      popover: {
        title: "Wealth Trend",
        description:
          "A 12-month line chart of your net worth. You want this line going up and to the right. Built automatically from your asset and debt data.",
        side: "top",
        align: "start",
      },
    },
    {
      element: "#dashboard-goals-card",
      popover: {
        title: "Goals Summary",
        description:
          "Your top 3 active savings goals at a glance. Each bar shows progress toward the target. Tap to go to the full Goals page.",
        side: "top",
        align: "start",
      },
    },
  ],

  budget: [
    {
      element: "#budget-hero-section",
      popover: {
        title: "Budget Left",
        description:
          "How much of your monthly budget is still left to spend. Tap the smaller number on the right to edit your total budget.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "#budget-spend-meter",
      popover: {
        title: "Spend Meter",
        description:
          "Shows how much of your total budget you've spent. The tick ruler fills as you log expenses — taller ticks mark 25% milestones.",
        side: "top",
        align: "start",
      },
    },
    {
      element: "#budget-categories-header",
      popover: {
        title: "Budget Categories",
        description:
          "Divide your budget into categories — Needs, Wants, Investments. Each category holds line items (rent, groceries, Netflix, etc.). Tap a category to manage its items.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "#budget-category-row-0",
      popover: {
        title: "Category Row",
        description:
          "Shows the category name, how much you've spent vs how much was allocated, and a 20-segment progress bar. Red means over budget. Tap to drill in.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "#add-category-inline",
      popover: {
        title: "Add Category",
        description:
          "Create a new budget category. Start with a name — you can set the icon, allocation amount, and individual items inside the category after.",
        side: "bottom",
        align: "end",
      },
    },
  ],

  goals: [
    {
      element: "#goals-list-header",
      popover: {
        title: "Your Goals",
        description:
          "All your savings targets in one place — emergency fund, travel, down payment, anything. Ordered by priority. Tap any goal to edit its details.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "#goals-goal-row-0",
      popover: {
        title: "Goal Card",
        description:
          "Shows the goal name, current amount vs target, percentage complete, and a progress bar. The bar fills as you add funds. Tap to edit.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "#goals-quick-section",
      popover: {
        title: "Quick Update",
        description:
          "Log progress toward a goal without opening the edit sheet. Pick a goal from the dropdown, enter the new total saved amount, and hit Update.",
        side: "top",
        align: "start",
      },
    },
    {
      element: "#goals-add-btn",
      popover: {
        title: "Add a Goal",
        description:
          "Create a new savings goal. Set a name, target amount, and optional notes. The app will track your progress as you update the current amount over time.",
        side: "bottom",
        align: "end",
      },
    },
  ],

  debt: [
    {
      element: "#debt-hero-section",
      popover: {
        title: "Total Outstanding",
        description:
          "The total amount you still owe across all active debts (excluding money you've lent out). This number should decrease as you make payments.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "#debt-progress-ruler",
      popover: {
        title: "Overall Payoff Progress",
        description:
          "How much of all your debts combined have been paid off. The tick ruler fills left to right — aim for 100%.",
        side: "top",
        align: "start",
      },
    },
    {
      element: "#debt-tabs",
      popover: {
        title: "Debt Types",
        description:
          "External — loans and credit cards from banks or lenders. Internal — debts to family or friends. Closed — fully paid off debts (archived for history).",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "#debt-row-0",
      popover: {
        title: "Debt Card",
        description:
          "Shows the debt name, remaining balance, interest rate, and repayment progress bar. Tap to edit details or record a payment.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "#quick-action-dock",
      popover: {
        title: "Quick Payment",
        description:
          "Tap here to log a payment without opening the debt sheet. Pick the debt, enter how much you paid this month, and hit Mark Paid.",
        side: "top",
        align: "end",
      },
    },
  ],

  "net-worth": [
    {
      element: "#net-worth-hero",
      popover: {
        title: "Your Net Worth",
        description:
          "Total Assets minus Total Liabilities. This is the single most important financial number — a measure of everything you own minus everything you owe.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "#net-worth-chart-section",
      popover: {
        title: "Wealth Trend",
        description:
          "Monthly net worth history plotted as a line chart. Built automatically from your asset value updates. A rising line means you're building wealth.",
        side: "top",
        align: "start",
      },
    },
    {
      element: "#net-worth-distribution-section",
      popover: {
        title: "Asset Distribution",
        description:
          "A pie chart showing how your wealth is split across asset categories — savings, investments, real estate, crypto. More diversification = less risk.",
        side: "top",
        align: "start",
      },
    },
    {
      element: "#net-worth-assets-section",
      popover: {
        title: "Asset Categories",
        description:
          "Your assets grouped by category. Each row shows the asset name and current value. Tap any asset to update its value, add funds, or withdraw.",
        side: "top",
        align: "start",
      },
    },
    {
      element: "#quick-action-dock",
      popover: {
        title: "Add an Asset",
        description:
          "Tap here to track a new asset — bank account, stock portfolio, property, vehicle, anything with value. Set an initial value and update it over time.",
        side: "top",
        align: "end",
      },
    },
  ],

  activity: [
    {
      element: "#activity-category-chips",
      popover: {
        title: "Filter by Type",
        description:
          "Show only budget actions, net worth changes, goal updates, or debt payments. 'All' shows everything in chronological order.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "#activity-log-list",
      popover: {
        title: "Your Financial Timeline",
        description:
          "Every action you take in the app is recorded here — adding a category, logging a payment, updating a goal. Grouped by date, newest first.",
        side: "top",
        align: "start",
      },
    },
    {
      element: "#activity-first-item",
      popover: {
        title: "Activity Entry",
        description:
          "Tap any entry to see full details including what changed, the category, and the exact timestamp. Use this as your audit trail.",
        side: "bottom",
        align: "start",
      },
    },
  ],
};
