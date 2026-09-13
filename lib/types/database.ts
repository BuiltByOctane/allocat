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
          currency: string
          avatar: string | null
          is_supporter: boolean
          supporter_since: string | null
          last_app_mode: "web" | "android" | null
          last_seen_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          email: string
          is_onboarded?: boolean
          currency?: string
          avatar?: string | null
          is_supporter?: boolean
          supporter_since?: string | null
          last_app_mode?: "web" | "android" | null
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          full_name?: string
          email?: string
          is_onboarded?: boolean
          currency?: string
          avatar?: string | null
          is_supporter?: boolean
          supporter_since?: string | null
          last_app_mode?: "web" | "android" | null
          last_seen_at?: string | null
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
          template_id: string | null
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
          template_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          month?: number
          year?: number
          total_budget?: number
          is_locked?: boolean
          template_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      budget_templates: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          preview: string[]
          categories: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          preview?: string[]
          categories?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          preview?: string[]
          categories?: Json
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
          color: string | null
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
          color?: string | null
          type: "needs" | "wants" | "investments" | "misc"
          allocated_amount?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          icon?: string | null
          color?: string | null
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
          emoji: string | null
          planned_amount: number
          actual_amount: number
          is_completed: boolean
          notes: string | null
          link_type: "asset" | "debt" | null
          link_id: string | null
          template_id: string | null
          template_item_id: string | null
          created_at: string
          updated_at: string
          overspend_count: number
        }
        Insert: {
          id?: string
          category_id: string
          user_id: string
          name: string
          emoji?: string | null
          planned_amount?: number
          actual_amount?: number
          is_completed?: boolean
          notes?: string | null
          link_type?: "asset" | "debt" | null
          link_id?: string | null
          template_id?: string | null
          template_item_id?: string | null
          created_at?: string
          updated_at?: string
          overspend_count?: number
        }
        Update: {
          name?: string
          emoji?: string | null
          planned_amount?: number
          actual_amount?: number
          is_completed?: boolean
          notes?: string | null
          link_type?: "asset" | "debt" | null
          link_id?: string | null
          template_id?: string | null
          template_item_id?: string | null
          updated_at?: string
          overspend_count?: number
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
      asset_categories: {
        Row: {
          id: string
          user_id: string
          name: string
          icon: string
          color: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          icon?: string
          color?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          icon?: string
          color?: string | null
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
          color: string | null
          category: string | null
          category_id: string | null
          value: number
          invested_amount: number
          is_goal: boolean
          target_amount: number | null
          achieved_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          icon?: string | null
          color?: string | null
          category?: string | null
          category_id?: string | null
          value?: number
          invested_amount?: number
          is_goal?: boolean
          target_amount?: number | null
          achieved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          icon?: string | null
          color?: string | null
          category?: string | null
          category_id?: string | null
          value?: number
          invested_amount?: number
          is_goal?: boolean
          target_amount?: number | null
          achieved_at?: string | null
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
          color: string | null
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
          color?: string | null
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
          color?: string | null
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
      merchant_rules: {
        Row: {
          id: string
          user_id: string
          match_type: "exact" | "contains" | "regex"
          pattern: string
          merchant_normalized: string | null
          template_id: string | null
          template_item_id: string | null
          budget_item_id: string | null
          category_id: string | null
          auto_apply: boolean
          times_applied: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          match_type: "exact" | "contains" | "regex"
          pattern: string
          merchant_normalized?: string | null
          template_id?: string | null
          template_item_id?: string | null
          budget_item_id?: string | null
          category_id?: string | null
          auto_apply?: boolean
          times_applied?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          match_type?: "exact" | "contains" | "regex"
          pattern?: string
          merchant_normalized?: string | null
          template_id?: string | null
          template_item_id?: string | null
          budget_item_id?: string | null
          category_id?: string | null
          auto_apply?: boolean
          times_applied?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_rules_budget_item_id_fkey"
            columns: ["budget_item_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id"]
          }
        ]
      }
      sms_transactions: {
        Row: {
          id: string
          user_id: string
          raw_text: string | null
          sender: string | null
          amount: number | null
          currency: string | null
          merchant_raw: string | null
          merchant_normalized: string | null
          direction: "debit" | "credit" | null
          occurred_at: string | null
          dedupe_key: string
          /**
           * One-way hash of the SMS *template* (sender + masked skeleton).
           * Stored at ingest so "Not a transaction" can blocklist the template
           * without needing the raw body (which never leaves the device).
           */
          template_key: string | null
          status: "pending" | "categorized" | "ignored" | "duplicate"
          matched_rule_id: string | null
          budget_item_id: string | null
          label: string | null
          source: "sms" | "manual"
          original_amount: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          raw_text?: string | null
          sender?: string | null
          amount?: number | null
          currency?: string | null
          merchant_raw?: string | null
          merchant_normalized?: string | null
          direction?: "debit" | "credit" | null
          occurred_at?: string | null
          dedupe_key: string
          template_key?: string | null
          status?: "pending" | "categorized" | "ignored" | "duplicate"
          matched_rule_id?: string | null
          budget_item_id?: string | null
          label?: string | null
          source?: "sms" | "manual"
          original_amount?: number | null
          created_at?: string
        }
        Update: {
          status?: "pending" | "categorized" | "ignored" | "duplicate"
          template_key?: string | null
          matched_rule_id?: string | null
          budget_item_id?: string | null
          merchant_normalized?: string | null
          label?: string | null
          amount?: number | null
          original_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_transactions_matched_rule_id_fkey"
            columns: ["matched_rule_id"]
            isOneToOne: false
            referencedRelation: "merchant_rules"
            referencedColumns: ["id"]
          }
        ]
      }
      sms_blocklist: {
        Row: {
          id: string
          user_id: string
          template_key: string
          sample_label: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          template_key: string
          sample_label?: string | null
          created_at?: string
        }
        Update: {
          template_key?: string
          sample_label?: string | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          id: string
          user_id: string
          kind: "bug" | "feature" | "feedback"
          message: string
          app_version: string | null
          platform: string | null
          created_at: string
          resolved_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          kind?: "bug" | "feature" | "feedback"
          message: string
          app_version?: string | null
          platform?: string | null
          created_at?: string
          resolved_at?: string | null
        }
        Update: {
          kind?: "bug" | "feature" | "feedback"
          message?: string
          resolved_at?: string | null
        }
        Relationships: []
      }
      app_config: {
        Row: {
          id: number
          min_android_version_code: number
          update_message: string | null
          flags: Json
        }
        Insert: {
          id?: number
          min_android_version_code?: number
          update_message?: string | null
          flags?: Json
        }
        Update: {
          min_android_version_code?: number
          update_message?: string | null
          flags?: Json
        }
        Relationships: []
      }
      supporters: {
        Row: {
          email: string
          user_id: string | null
          first_supported_at: string
          last_supported_at: string
          total_amount: number
          currency: string | null
          source: string
          last_message_id: string | null
          created_at: string
        }
        Insert: {
          email: string
          user_id?: string | null
          first_supported_at?: string
          last_supported_at?: string
          total_amount?: number
          currency?: string | null
          source?: string
          last_message_id?: string | null
          created_at?: string
        }
        Update: {
          user_id?: string | null
          last_supported_at?: string
          total_amount?: number
          currency?: string | null
          last_message_id?: string | null
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          user_id: string
          day: string
          count: number
        }
        Insert: {
          user_id: string
          day?: string
          count?: number
        }
        Update: {
          count?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          last_used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          last_used_at?: string | null
          created_at?: string
        }
        Update: {
          p256dh?: string
          auth?: string
          user_agent?: string | null
          last_used_at?: string | null
        }
        Relationships: []
      }
      fcm_tokens: {
        Row: {
          token: string
          user_id: string
          platform: string
          app_version: string | null
          created_at: string
          last_used_at: string | null
        }
        Insert: {
          token: string
          user_id: string
          platform?: string
          app_version?: string | null
          created_at?: string
          last_used_at?: string | null
        }
        Update: {
          platform?: string
          app_version?: string | null
          last_used_at?: string | null
        }
        Relationships: []
      }
      user_active_days: {
        Row: {
          user_id: string
          day: string
        }
        Insert: {
          user_id: string
          day?: string
        }
        Update: {
          day?: string
        }
        Relationships: []
      }
      landing_events: {
        Row: {
          id: string
          event: string
          platform: string | null
          path: string | null
          referrer: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event: string
          platform?: string | null
          path?: string | null
          referrer?: string | null
          created_at?: string
        }
        Update: {
          event?: string
        }
        Relationships: []
      }
      play_install_stats: {
        Row: {
          day: string
          package: string
          daily_device_installs: number | null
          daily_device_uninstalls: number | null
          active_device_installs: number | null
          total_user_installs: number | null
          synced_at: string
        }
        Insert: {
          day: string
          package: string
          daily_device_installs?: number | null
          daily_device_uninstalls?: number | null
          active_device_installs?: number | null
          total_user_installs?: number | null
          synced_at?: string
        }
        Update: {
          daily_device_installs?: number | null
          daily_device_uninstalls?: number | null
          active_device_installs?: number | null
          total_user_installs?: number | null
          synced_at?: string
        }
        Relationships: []
      }
      push_campaigns: {
        Row: {
          id: string
          title: string
          body: string
          url: string | null
          segment: string
          sent_count: number
          failed_count: number
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          body: string
          url?: string | null
          segment: string
          sent_count?: number
          failed_count?: number
          created_by?: string | null
          created_at?: string
        }
        Update: {
          sent_count?: number
          failed_count?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_ai_usage: {
        Args: { p_user: string }
        Returns: number
      }
      admin_overview: {
        Args: Record<string, never>
        Returns: Json
      }
      admin_daily_series: {
        Args: { p_days?: number }
        Returns: Array<{
          day: string
          signups: number
          active_users: number
          engaged_users: number
          ai_messages: number
          sms_txns: number
          play_clicks: number
          installs: number
          uninstalls: number
        }>
      }
      admin_user_search: {
        Args: { p_q: string; p_limit?: number }
        Returns: Array<{
          id: string
          email: string
          full_name: string
          is_onboarded: boolean
          is_supporter: boolean
          last_app_mode: string | null
          currency: string
          created_at: string
          last_seen_at: string | null
        }>
      }
      admin_user_detail: {
        Args: { p_user: string }
        Returns: Json
      }
      admin_feature_usage: {
        Args: Record<string, never>
        Returns: Json
      }
      admin_push_reach: {
        Args: Record<string, never>
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
