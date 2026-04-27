export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          email: string
          is_onboarded: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          email: string
          is_onboarded?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          full_name?: string
          email?: string
          is_onboarded?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          id: string
          user_id: string
          month: number
          year: number
          total_budget: number
          is_locked: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          month: number
          year: number
          total_budget?: number
          is_locked?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          month?: number
          year?: number
          total_budget?: number
          is_locked?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          budget_id: string
          user_id: string
          name: string
          icon: string | null
          type: "needs" | "wants" | "investments" | "misc"
          allocated_amount: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          budget_id: string
          user_id: string
          name: string
          icon?: string | null
          type: "needs" | "wants" | "investments" | "misc"
          allocated_amount?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          icon?: string | null
          type?: "needs" | "wants" | "investments" | "misc"
          allocated_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          }
        ]
      }
      budget_items: {
        Row: {
          id: string
          category_id: string
          user_id: string
          name: string
          planned_amount: number
          actual_amount: number
          is_completed: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category_id: string
          user_id: string
          name: string
          planned_amount?: number
          actual_amount?: number
          is_completed?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          planned_amount?: number
          actual_amount?: number
          is_completed?: boolean
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          }
        ]
      }
      goals: {
        Row: {
          id: string
          user_id: string
          name: string
          icon: string | null
          target_amount: number
          current_amount: number
          notes: string | null
          priority: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          icon?: string | null
          target_amount?: number
          current_amount?: number
          notes?: string | null
          priority?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          icon?: string | null
          target_amount?: number
          current_amount?: number
          notes?: string | null
          priority?: number
          updated_at?: string
        }
        Relationships: []
      }
      asset_categories: {
        Row: {
          id: string
          user_id: string
          name: string
          icon: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          icon?: string
          created_at?: string
        }
        Update: {
          name?: string
          icon?: string
          created_at?: string
        }
        Relationships: []
      }
      asset_value_history: {
        Row: {
          id: string
          asset_id: string
          user_id: string
          entry_type: "initial" | "add_funds" | "withdraw" | "update_value"
          amount: number
          running_total: number
          note: string | null
          entry_date: string
          created_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          user_id: string
          entry_type: "initial" | "add_funds" | "withdraw" | "update_value"
          amount: number
          running_total: number
          note?: string | null
          entry_date?: string
          created_at?: string
        }
        Update: {
          entry_type?: "initial" | "add_funds" | "withdraw" | "update_value"
          amount?: number
          running_total?: number
          note?: string | null
          entry_date?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          id: string
          user_id: string
          name: string
          icon: string | null
          category: string | null
          category_id: string | null
          value: number
          invested_amount: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          icon?: string | null
          category?: string | null
          category_id?: string | null
          value?: number
          invested_amount?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          icon?: string | null
          category?: string | null
          category_id?: string | null
          value?: number
          invested_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          }
        ]
      }
      debts: {
        Row: {
          id: string
          user_id: string
          name: string
          icon: string | null
          type: "internal" | "external" | "lent"
          principal: number
          interest_rate: number
          monthly_minimum: number
          total_paid: number
          is_closed: boolean
          expected_payoff_date: string | null
          interest_type: "flat" | "diminishing"
          loan_tenure_months: number | null
          total_repayable: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          icon?: string | null
          type: "internal" | "external" | "lent"
          principal?: number
          interest_rate?: number
          monthly_minimum?: number
          total_paid?: number
          is_closed?: boolean
          expected_payoff_date?: string | null
          interest_type?: "flat" | "diminishing"
          loan_tenure_months?: number | null
          total_repayable?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          icon?: string | null
          type?: "internal" | "external" | "lent"
          principal?: number
          interest_rate?: number
          monthly_minimum?: number
          total_paid?: number
          is_closed?: boolean
          expected_payoff_date?: string | null
          interest_type?: "flat" | "diminishing"
          loan_tenure_months?: number | null
          total_repayable?: number
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          id: string
          budget_id: string
          user_id: string
          month: number
          year: number
          notes: string | null
          summary_data: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          budget_id: string
          user_id: string
          month: number
          year: number
          notes?: string | null
          summary_data?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          notes?: string | null
          summary_data?: Json
          updated_at?: string
        }
        Relationships: []
      }
      net_worth_snapshots: {
        Row: {
          id: string
          user_id: string
          total_assets: number
          total_liabilities: number
          net_worth: number
          snapshot_date: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          total_assets?: number
          total_liabilities?: number
          net_worth?: number
          snapshot_date?: string
          created_at?: string
        }
        Update: {
          total_assets?: number
          total_liabilities?: number
          net_worth?: number
          snapshot_date?: string
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          id: string
          user_id: string
          action_type: string
          category: "budget" | "net_worth" | "goals" | "debts"
          title: string
          description: string
          metadata: Record<string, unknown>
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          action_type: string
          category: "budget" | "net_worth" | "goals" | "debts"
          title: string
          description: string
          metadata?: Record<string, unknown>
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
