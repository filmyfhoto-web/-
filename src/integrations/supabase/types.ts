export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          detail: Json | null
          id: string
          target_id: string | null
          target_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      admin_alert_rule_state: {
        Row: {
          fire_count: number
          last_fired_at: string | null
          rule_id: string
          updated_at: string
        }
        Insert: {
          fire_count?: number
          last_fired_at?: string | null
          rule_id: string
          updated_at?: string
        }
        Update: {
          fire_count?: number
          last_fired_at?: string | null
          rule_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_alert_rule_state_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: true
            referencedRelation: "admin_alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_alert_rules: {
        Row: {
          admin_user_id: string
          channels: string[]
          cooldown_seconds: number
          created_at: string
          enabled: boolean
          event_type: string
          id: string
          keyword: string | null
          label: string
          min_amount: number | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
        }
        Insert: {
          admin_user_id: string
          channels?: string[]
          cooldown_seconds?: number
          created_at?: string
          enabled?: boolean
          event_type: string
          id?: string
          keyword?: string | null
          label: string
          min_amount?: number | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
        }
        Update: {
          admin_user_id?: string
          channels?: string[]
          cooldown_seconds?: number
          created_at?: string
          enabled?: boolean
          event_type?: string
          id?: string
          keyword?: string | null
          label?: string
          min_amount?: number | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      admin_email_allowlist: {
        Row: {
          created_at: string
          email: string
          note: string | null
        }
        Insert: {
          created_at?: string
          email: string
          note?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          note?: string | null
        }
        Relationships: []
      }
      admin_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          channel: string
          created_at: string
          expires_at: string
          id: string
          invited_by: string | null
          invitee_name: string | null
          message: string | null
          perm_history: boolean
          perm_po: boolean
          perm_pos: boolean
          perm_stock: boolean
          role: string
          status: string
          store_id: string | null
          target: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          channel: string
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invitee_name?: string | null
          message?: string | null
          perm_history?: boolean
          perm_po?: boolean
          perm_pos?: boolean
          perm_stock?: boolean
          role: string
          status?: string
          store_id?: string | null
          target: string
          token: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          channel?: string
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invitee_name?: string | null
          message?: string | null
          perm_history?: boolean
          perm_po?: boolean
          perm_pos?: boolean
          perm_stock?: boolean
          role?: string
          status?: string
          store_id?: string | null
          target?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_invitations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_line_enroll_codes: {
        Row: {
          code: string
          consumed_at: string | null
          consumed_line_user_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          label: string | null
        }
        Insert: {
          code: string
          consumed_at?: string | null
          consumed_line_user_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          label?: string | null
        }
        Update: {
          code?: string
          consumed_at?: string | null
          consumed_line_user_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          label?: string | null
        }
        Relationships: []
      }
      admin_line_recipients: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          label: string | null
          line_user_id: string
          notify_orders: boolean
          status_filters: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          label?: string | null
          line_user_id: string
          notify_orders?: boolean
          status_filters?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          label?: string | null
          line_user_id?: string
          notify_orders?: boolean
          status_filters?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      catalog_backfill_report: {
        Row: {
          action: string
          canonical_product_id: string | null
          id: string
          note: string | null
          run_at: string
          source_id: string
          source_table: string
        }
        Insert: {
          action: string
          canonical_product_id?: string | null
          id?: string
          note?: string | null
          run_at?: string
          source_id: string
          source_table: string
        }
        Update: {
          action?: string
          canonical_product_id?: string | null
          id?: string
          note?: string | null
          run_at?: string
          source_id?: string
          source_table?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          image_urls: string[]
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_urls?: string[]
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          image_urls?: string[]
          name?: string
        }
        Relationships: []
      }
      consent_policy_versions: {
        Row: {
          effective_at: string
          key: string
          notes: string | null
          updated_at: string
          version: string
        }
        Insert: {
          effective_at?: string
          key: string
          notes?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          effective_at?: string
          key?: string
          notes?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          min_subtotal: number
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          min_subtotal?: number
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          min_subtotal?: number
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          address_line: string
          created_at: string
          district: string | null
          id: string
          is_default: boolean
          is_pickup: boolean
          label: string | null
          note: string | null
          phone: string
          postcode: string | null
          province: string | null
          recipient_name: string
          subdistrict: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line: string
          created_at?: string
          district?: string | null
          id?: string
          is_default?: boolean
          is_pickup?: boolean
          label?: string | null
          note?: string | null
          phone: string
          postcode?: string | null
          province?: string | null
          recipient_name: string
          subdistrict?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line?: string
          created_at?: string
          district?: string | null
          id?: string
          is_default?: boolean
          is_pickup?: boolean
          label?: string | null
          note?: string | null
          phone?: string
          postcode?: string | null
          province?: string | null
          recipient_name?: string
          subdistrict?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_excel_intakes: {
        Row: {
          converted_at: string | null
          converted_id: string | null
          converted_to: string | null
          created_at: string
          customer_name: string
          file_size: number
          filename: string
          id: string
          items: Json
          mime_type: string
          needs_review_count: number
          note: string
          phone: string
          row_count: number
          school_name: string
          source: string
          status: string
          storage_bucket: string | null
          storage_path: string | null
          submitted_at: string
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          converted_at?: string | null
          converted_id?: string | null
          converted_to?: string | null
          created_at?: string
          customer_name?: string
          file_size?: number
          filename?: string
          id?: string
          items?: Json
          mime_type?: string
          needs_review_count?: number
          note?: string
          phone?: string
          row_count?: number
          school_name?: string
          source?: string
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          submitted_at?: string
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          converted_at?: string | null
          converted_id?: string | null
          converted_to?: string | null
          created_at?: string
          customer_name?: string
          file_size?: number
          filename?: string
          id?: string
          items?: Json
          mime_type?: string
          needs_review_count?: number
          note?: string
          phone?: string
          row_count?: number
          school_name?: string
          source?: string
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          submitted_at?: string
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_messages: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          order_id: string | null
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          order_id?: string | null
          topic?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          order_id?: string | null
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_po_review_events: {
        Row: {
          actor: string
          created_at: string
          event: string
          id: string
          note: string
          po_id: string
        }
        Insert: {
          actor?: string
          created_at?: string
          event: string
          id?: string
          note?: string
          po_id: string
        }
        Update: {
          actor?: string
          created_at?: string
          event?: string
          id?: string
          note?: string
          po_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_po_review_events_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "customer_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_prices: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          price: number
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          price: number
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          price?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_prices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
      customer_purchase_orders: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          attachments: Json
          confirmed_at: string | null
          created_at: string
          customer_name: string
          customer_phone: string
          delivery_note: string | null
          delivery_note_file: Json | null
          delivery_note_sent_at: string | null
          delivery_note_sent_by: string | null
          desk_stage: string
          discount: number
          document_date: string
          document_id: string | null
          document_no: string | null
          documented_at: string | null
          due_date: string | null
          id: string
          items: Json
          last_sent_at: string | null
          line_user_id: string | null
          net_total: number
          note: string
          po_number: string | null
          priced_at: string | null
          priced_by: string | null
          quote_file: Json | null
          quote_sent_at: string | null
          quote_sent_by: string | null
          receive_method: string | null
          request_delivery_note: boolean
          request_quotation: boolean
          review_status: string
          review_token: string | null
          revision_note: string
          school_or_org: string
          seller_name: string
          source: string
          status: string
          store_slug: string
          submitted_at: string | null
          subtotal: number
          updated_at: string
          user_id: string | null
          vat_amount: number
          vat_enabled: boolean
          vat_rate: number
          wht_amount: number
          wht_enabled: boolean
          wht_rate: number
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          attachments?: Json
          confirmed_at?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string
          delivery_note?: string | null
          delivery_note_file?: Json | null
          delivery_note_sent_at?: string | null
          delivery_note_sent_by?: string | null
          desk_stage?: string
          discount?: number
          document_date?: string
          document_id?: string | null
          document_no?: string | null
          documented_at?: string | null
          due_date?: string | null
          id?: string
          items?: Json
          last_sent_at?: string | null
          line_user_id?: string | null
          net_total?: number
          note?: string
          po_number?: string | null
          priced_at?: string | null
          priced_by?: string | null
          quote_file?: Json | null
          quote_sent_at?: string | null
          quote_sent_by?: string | null
          receive_method?: string | null
          request_delivery_note?: boolean
          request_quotation?: boolean
          review_status?: string
          review_token?: string | null
          revision_note?: string
          school_or_org?: string
          seller_name?: string
          source?: string
          status?: string
          store_slug?: string
          submitted_at?: string | null
          subtotal?: number
          updated_at?: string
          user_id?: string | null
          vat_amount?: number
          vat_enabled?: boolean
          vat_rate?: number
          wht_amount?: number
          wht_enabled?: boolean
          wht_rate?: number
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          attachments?: Json
          confirmed_at?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string
          delivery_note?: string | null
          delivery_note_file?: Json | null
          delivery_note_sent_at?: string | null
          delivery_note_sent_by?: string | null
          desk_stage?: string
          discount?: number
          document_date?: string
          document_id?: string | null
          document_no?: string | null
          documented_at?: string | null
          due_date?: string | null
          id?: string
          items?: Json
          last_sent_at?: string | null
          line_user_id?: string | null
          net_total?: number
          note?: string
          po_number?: string | null
          priced_at?: string | null
          priced_by?: string | null
          quote_file?: Json | null
          quote_sent_at?: string | null
          quote_sent_by?: string | null
          receive_method?: string | null
          request_delivery_note?: boolean
          request_quotation?: boolean
          review_status?: string
          review_token?: string | null
          revision_note?: string
          school_or_org?: string
          seller_name?: string
          source?: string
          status?: string
          store_slug?: string
          submitted_at?: string | null
          subtotal?: number
          updated_at?: string
          user_id?: string | null
          vat_amount?: number
          vat_enabled?: boolean
          vat_rate?: number
          wht_amount?: number
          wht_enabled?: boolean
          wht_rate?: number
        }
        Relationships: []
      }
      document_command_audit: {
        Row: {
          actor_id: string | null
          actor_label: string | null
          created_at: string
          detail: Json
          draft_id: string | null
          event: string
          id: string
          line_user_id: string | null
          source: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          detail?: Json
          draft_id?: string | null
          event: string
          id?: string
          line_user_id?: string | null
          source?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          detail?: Json
          draft_id?: string | null
          event?: string
          id?: string
          line_user_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_command_audit_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "document_command_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      document_command_counters: {
        Row: {
          doc_type: string
          seq: number
          shop_key: string
          updated_at: string
          year: number
        }
        Insert: {
          doc_type: string
          seq?: number
          shop_key: string
          updated_at?: string
          year: number
        }
        Update: {
          doc_type?: string
          seq?: number
          shop_key?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      document_command_drafts: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          companion_doc_nos: Json
          companions: Json
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_branch: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_tax_id: string | null
          deposit: number
          discount: number
          doc_type: string
          document_date: string | null
          due_at: string | null
          final_doc_no: string | null
          final_document_id: string | null
          final_invoice_id: string | null
          id: string
          image_url: string | null
          last_error: string | null
          line_user_id: string | null
          missing_fields: Json
          notes: string | null
          paper_size: string | null
          parsed: Json
          payment_method: string | null
          payment_status: string
          price_type: string | null
          project: string | null
          raw_command: string | null
          sent_at: string | null
          sent_to_line_user_id: string | null
          shop_key: string
          source: string
          source_document_id: string | null
          source_document_no: string | null
          status: string
          subtotal: number
          temp_ref: string
          template: string | null
          total: number
          transcript: string | null
          updated_at: string
          vat_amount: number
          vat_mode: string
          vat_rate: number
          wht_amount: number
          wht_rate: number
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          companion_doc_nos?: Json
          companions?: Json
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_branch?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_tax_id?: string | null
          deposit?: number
          discount?: number
          doc_type?: string
          document_date?: string | null
          due_at?: string | null
          final_doc_no?: string | null
          final_document_id?: string | null
          final_invoice_id?: string | null
          id?: string
          image_url?: string | null
          last_error?: string | null
          line_user_id?: string | null
          missing_fields?: Json
          notes?: string | null
          paper_size?: string | null
          parsed?: Json
          payment_method?: string | null
          payment_status?: string
          price_type?: string | null
          project?: string | null
          raw_command?: string | null
          sent_at?: string | null
          sent_to_line_user_id?: string | null
          shop_key?: string
          source?: string
          source_document_id?: string | null
          source_document_no?: string | null
          status?: string
          subtotal?: number
          temp_ref?: string
          template?: string | null
          total?: number
          transcript?: string | null
          updated_at?: string
          vat_amount?: number
          vat_mode?: string
          vat_rate?: number
          wht_amount?: number
          wht_rate?: number
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          companion_doc_nos?: Json
          companions?: Json
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_branch?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_tax_id?: string | null
          deposit?: number
          discount?: number
          doc_type?: string
          document_date?: string | null
          due_at?: string | null
          final_doc_no?: string | null
          final_document_id?: string | null
          final_invoice_id?: string | null
          id?: string
          image_url?: string | null
          last_error?: string | null
          line_user_id?: string | null
          missing_fields?: Json
          notes?: string | null
          paper_size?: string | null
          parsed?: Json
          payment_method?: string | null
          payment_status?: string
          price_type?: string | null
          project?: string | null
          raw_command?: string | null
          sent_at?: string | null
          sent_to_line_user_id?: string | null
          shop_key?: string
          source?: string
          source_document_id?: string | null
          source_document_no?: string | null
          status?: string
          subtotal?: number
          temp_ref?: string
          template?: string | null
          total?: number
          transcript?: string | null
          updated_at?: string
          vat_amount?: number
          vat_mode?: string
          vat_rate?: number
          wht_amount?: number
          wht_rate?: number
        }
        Relationships: []
      }
      document_command_items: {
        Row: {
          created_at: string
          description: string
          discount: number
          draft_id: string
          id: string
          quantity: number
          sort_order: number
          total: number
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          discount?: number
          draft_id: string
          id?: string
          quantity?: number
          sort_order?: number
          total?: number
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          discount?: number
          draft_id?: string
          id?: string
          quantity?: number
          sort_order?: number
          total?: number
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_command_items_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "document_command_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      document_receipts: {
        Row: {
          confirmed_at: string | null
          created_at: string
          first_viewed_at: string
          id: string
          order_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          first_viewed_at?: string
          id?: string
          order_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          first_viewed_at?: string
          id?: string
          order_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          doc_no: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          id: string
          order_id: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          doc_no: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          id?: string
          order_id?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          doc_no?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          id?: string
          order_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      film_admin_line_links: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          line_user_id: string | null
          link_token: string | null
          linked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          line_user_id?: string | null
          link_token?: string | null
          linked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          line_user_id?: string | null
          link_token?: string | null
          linked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      film_automation_runs: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          kind: string
          ref_id: string | null
          result: Json
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          kind: string
          ref_id?: string | null
          result?: Json
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string
          ref_id?: string | null
          result?: Json
          status?: string
        }
        Relationships: []
      }
      film_cash_advance_repayments: {
        Row: {
          advance_id: string
          amount: number
          created_at: string
          deleted_at: string | null
          id: string
          notes: string | null
          repaid_at: string
          shift_id: string | null
        }
        Insert: {
          advance_id: string
          amount?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          repaid_at?: string
          shift_id?: string | null
        }
        Update: {
          advance_id?: string
          amount?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          repaid_at?: string
          shift_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "film_cash_advance_repayments_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "film_cash_advances"
            referencedColumns: ["id"]
          },
        ]
      }
      film_cash_advances: {
        Row: {
          amount: number
          attachments: Json
          borrowed_at: string
          borrower_name: string
          borrower_type: string
          created_at: string
          deleted_at: string | null
          due_date: string | null
          employee_id: string | null
          expense_category: string | null
          id: string
          notes: string | null
          paid_amount: number
          purpose: string
          settled_shift_id: string | null
          shift_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          attachments?: Json
          borrowed_at?: string
          borrower_name: string
          borrower_type?: string
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          employee_id?: string | null
          expense_category?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          purpose: string
          settled_shift_id?: string | null
          shift_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          attachments?: Json
          borrowed_at?: string
          borrower_name?: string
          borrower_type?: string
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          employee_id?: string | null
          expense_category?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          purpose?: string
          settled_shift_id?: string | null
          shift_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_cash_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "film_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      film_cash_drawer_audit: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          field_changed: string | null
          id: string
          new_value: string | null
          notes: string | null
          old_value: string | null
          shift_id: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          field_changed?: string | null
          id?: string
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          shift_id: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          field_changed?: string | null
          id?: string
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          shift_id?: string
        }
        Relationships: []
      }
      film_cash_drawer_shifts: {
        Row: {
          actual_amount: number | null
          closed_at: string | null
          created_at: string
          difference: number | null
          expected_amount: number
          id: string
          notes: string | null
          opened_at: string
          opening_amount: number
          status: string
        }
        Insert: {
          actual_amount?: number | null
          closed_at?: string | null
          created_at?: string
          difference?: number | null
          expected_amount?: number
          id?: string
          notes?: string | null
          opened_at?: string
          opening_amount?: number
          status?: string
        }
        Update: {
          actual_amount?: number | null
          closed_at?: string | null
          created_at?: string
          difference?: number | null
          expected_amount?: number
          id?: string
          notes?: string | null
          opened_at?: string
          opening_amount?: number
          status?: string
        }
        Relationships: []
      }
      film_cash_drawer_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          pos_receipt_id: string | null
          shift_id: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          pos_receipt_id?: string | null
          shift_id: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          pos_receipt_id?: string | null
          shift_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_cash_drawer_transactions_pos_receipt_id_fkey"
            columns: ["pos_receipt_id"]
            isOneToOne: false
            referencedRelation: "film_pos_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_cash_drawer_transactions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "film_cash_drawer_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      film_conversations: {
        Row: {
          assignee: string | null
          assignee_updated_at: string | null
          avatar_url: string | null
          channel: string
          created_at: string
          customer_id: string | null
          display_name: string | null
          external_thread_id: string
          external_user_id: string | null
          id: string
          is_test: boolean
          last_message_at: string | null
          last_message_preview: string | null
          last_order_id: string | null
          last_read_at: string | null
          last_read_by: string | null
          status: string
          status_updated_at: string | null
          store_id: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          assignee_updated_at?: string | null
          avatar_url?: string | null
          channel?: string
          created_at?: string
          customer_id?: string | null
          display_name?: string | null
          external_thread_id: string
          external_user_id?: string | null
          id?: string
          is_test?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          last_order_id?: string | null
          last_read_at?: string | null
          last_read_by?: string | null
          status?: string
          status_updated_at?: string | null
          store_id?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          assignee_updated_at?: string | null
          avatar_url?: string | null
          channel?: string
          created_at?: string
          customer_id?: string | null
          display_name?: string | null
          external_thread_id?: string
          external_user_id?: string | null
          id?: string
          is_test?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          last_order_id?: string | null
          last_read_at?: string | null
          last_read_by?: string | null
          status?: string
          status_updated_at?: string | null
          store_id?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "film_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_conversations_last_order_id_fkey"
            columns: ["last_order_id"]
            isOneToOne: false
            referencedRelation: "film_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      film_customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          line_user_id: string | null
          name: string
          phone: string | null
          tax_branch: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          line_user_id?: string | null
          name: string
          phone?: string | null
          tax_branch?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          line_user_id?: string | null
          name?: string
          phone?: string | null
          tax_branch?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      film_daily_reports: {
        Row: {
          attachments: Json
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          notes: string | null
          report_date: string
          snapshot: Json
          updated_at: string
        }
        Insert: {
          attachments?: Json
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          report_date: string
          snapshot?: Json
          updated_at?: string
        }
        Update: {
          attachments?: Json
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          report_date?: string
          snapshot?: Json
          updated_at?: string
        }
        Relationships: []
      }
      film_dept_capacity: {
        Row: {
          backup_employee_id: string | null
          created_at: string
          daily_jobs: number
          daily_minutes: number
          dept: string
          label: string
          updated_at: string
        }
        Insert: {
          backup_employee_id?: string | null
          created_at?: string
          daily_jobs?: number
          daily_minutes?: number
          dept: string
          label: string
          updated_at?: string
        }
        Update: {
          backup_employee_id?: string | null
          created_at?: string
          daily_jobs?: number
          daily_minutes?: number
          dept?: string
          label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_dept_capacity_backup_employee_id_fkey"
            columns: ["backup_employee_id"]
            isOneToOne: false
            referencedRelation: "film_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      film_employees: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          is_available: boolean
          job_types: string[]
          name: string
          phone: string | null
          position: string
          start_date: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_available?: boolean
          job_types?: string[]
          name: string
          phone?: string | null
          position: string
          start_date?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_available?: boolean
          job_types?: string[]
          name?: string
          phone?: string | null
          position?: string
          start_date?: string
        }
        Relationships: []
      }
      film_intake_form_tokens: {
        Row: {
          cancelled_at: string | null
          card_key: string | null
          channel_id: string | null
          channel_key: string
          created_at: string
          expires_at: string
          group_id: string
          id: string
          line_user_id: string
          order_id: string | null
          prefill: Json | null
          source: string
          source_message_id: string | null
          store_label: string | null
          token: string
          used_at: string | null
        }
        Insert: {
          cancelled_at?: string | null
          card_key?: string | null
          channel_id?: string | null
          channel_key: string
          created_at?: string
          expires_at?: string
          group_id: string
          id?: string
          line_user_id: string
          order_id?: string | null
          prefill?: Json | null
          source?: string
          source_message_id?: string | null
          store_label?: string | null
          token: string
          used_at?: string | null
        }
        Update: {
          cancelled_at?: string | null
          card_key?: string | null
          channel_id?: string | null
          channel_key?: string
          created_at?: string
          expires_at?: string
          group_id?: string
          id?: string
          line_user_id?: string
          order_id?: string | null
          prefill?: Json | null
          source?: string
          source_message_id?: string | null
          store_label?: string | null
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      film_invoices: {
        Row: {
          amount_due: number
          attachments: Json | null
          created_at: string
          created_via: string
          created_via_line_user_id: string | null
          customer_address: string | null
          customer_branch: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          customer_tax_id: string | null
          deposit: number
          discount: number
          document_date: string | null
          due_date: string | null
          header_text: string | null
          id: string
          invoice_number: string
          is_draft: boolean
          items: Json
          job_status: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          reference_doc: string | null
          sales_person: string | null
          source_job_request_id: string | null
          source_order_id: string | null
          status: string
          subtotal: number
          total: number
          type: string
        }
        Insert: {
          amount_due?: number
          attachments?: Json | null
          created_at?: string
          created_via?: string
          created_via_line_user_id?: string | null
          customer_address?: string | null
          customer_branch?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          customer_tax_id?: string | null
          deposit?: number
          discount?: number
          document_date?: string | null
          due_date?: string | null
          header_text?: string | null
          id?: string
          invoice_number: string
          is_draft?: boolean
          items?: Json
          job_status?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          reference_doc?: string | null
          sales_person?: string | null
          source_job_request_id?: string | null
          source_order_id?: string | null
          status?: string
          subtotal?: number
          total?: number
          type: string
        }
        Update: {
          amount_due?: number
          attachments?: Json | null
          created_at?: string
          created_via?: string
          created_via_line_user_id?: string | null
          customer_address?: string | null
          customer_branch?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          customer_tax_id?: string | null
          deposit?: number
          discount?: number
          document_date?: string | null
          due_date?: string | null
          header_text?: string | null
          id?: string
          invoice_number?: string
          is_draft?: boolean
          items?: Json
          job_status?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          reference_doc?: string | null
          sales_person?: string | null
          source_job_request_id?: string | null
          source_order_id?: string | null
          status?: string
          subtotal?: number
          total?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "film_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_invoices_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "film_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      film_job_requests: {
        Row: {
          attachments: Json
          category: string | null
          created_at: string
          created_by: string | null
          customer_name: string
          customer_phone: string | null
          description: string | null
          draft_reply: string | null
          due_date: string | null
          has_design: boolean | null
          id: string
          intake_status: string
          is_urgent: boolean
          job_no: string | null
          job_type: string | null
          length: number | null
          line_display_name: string | null
          line_event_id: string | null
          line_message_id: string | null
          line_update_count: number
          line_update_sent_at: string | null
          line_user_id: string | null
          linked_doc_type: string | null
          linked_invoice_id: string | null
          linked_order_id: string | null
          missing_fields: string[]
          notes: string | null
          parsed: Json
          pickup_method: string | null
          quantity: number | null
          raw_text: string | null
          received_at: string
          requested_due_at: string | null
          size_text: string | null
          source: string
          status: string
          title: string
          updated_at: string
          width: number | null
        }
        Insert: {
          attachments?: Json
          category?: string | null
          created_at?: string
          created_by?: string | null
          customer_name: string
          customer_phone?: string | null
          description?: string | null
          draft_reply?: string | null
          due_date?: string | null
          has_design?: boolean | null
          id?: string
          intake_status?: string
          is_urgent?: boolean
          job_no?: string | null
          job_type?: string | null
          length?: number | null
          line_display_name?: string | null
          line_event_id?: string | null
          line_message_id?: string | null
          line_update_count?: number
          line_update_sent_at?: string | null
          line_user_id?: string | null
          linked_doc_type?: string | null
          linked_invoice_id?: string | null
          linked_order_id?: string | null
          missing_fields?: string[]
          notes?: string | null
          parsed?: Json
          pickup_method?: string | null
          quantity?: number | null
          raw_text?: string | null
          received_at?: string
          requested_due_at?: string | null
          size_text?: string | null
          source?: string
          status?: string
          title: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          attachments?: Json
          category?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string
          customer_phone?: string | null
          description?: string | null
          draft_reply?: string | null
          due_date?: string | null
          has_design?: boolean | null
          id?: string
          intake_status?: string
          is_urgent?: boolean
          job_no?: string | null
          job_type?: string | null
          length?: number | null
          line_display_name?: string | null
          line_event_id?: string | null
          line_message_id?: string | null
          line_update_count?: number
          line_update_sent_at?: string | null
          line_user_id?: string | null
          linked_doc_type?: string | null
          linked_invoice_id?: string | null
          linked_order_id?: string | null
          missing_fields?: string[]
          notes?: string | null
          parsed?: Json
          pickup_method?: string | null
          quantity?: number | null
          raw_text?: string | null
          received_at?: string
          requested_due_at?: string | null
          size_text?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "film_job_requests_linked_invoice_id_fkey"
            columns: ["linked_invoice_id"]
            isOneToOne: false
            referencedRelation: "film_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_job_requests_linked_order_id_fkey"
            columns: ["linked_order_id"]
            isOneToOne: false
            referencedRelation: "film_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      film_job_schedule_history: {
        Row: {
          changed_by: string | null
          created_at: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          order_id: string | null
          order_job_id: string
          reason: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          order_id?: string | null
          order_job_id: string
          reason?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          order_id?: string | null
          order_job_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "film_job_schedule_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "film_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_job_schedule_history_order_job_id_fkey"
            columns: ["order_job_id"]
            isOneToOne: false
            referencedRelation: "film_order_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      film_job_type_durations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          job_type: string
          label: string | null
          minutes_per_unit: number
          setup_minutes: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          job_type: string
          label?: string | null
          minutes_per_unit?: number
          setup_minutes?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          job_type?: string
          label?: string | null
          minutes_per_unit?: number
          setup_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      film_job_type_totals_archived: {
        Row: {
          amount: number
          category_key: string
          created_at: string
          entry_date: string
          id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category_key: string
          created_at?: string
          entry_date?: string
          id?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_key?: string
          created_at?: string
          entry_date?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      film_line_intake_sessions: {
        Row: {
          attachments: Json
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          display_name: string | null
          due_at: string | null
          expires_at: string
          id: string
          is_test: boolean
          items: Json
          last_event_id: string | null
          line_room_id: string | null
          line_user_id: string
          notes: string | null
          order_id: string | null
          order_no: string | null
          source_type: string
          state: string
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          attachments?: Json
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          display_name?: string | null
          due_at?: string | null
          expires_at?: string
          id?: string
          is_test?: boolean
          items?: Json
          last_event_id?: string | null
          line_room_id?: string | null
          line_user_id: string
          notes?: string | null
          order_id?: string | null
          order_no?: string | null
          source_type?: string
          state?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Update: {
          attachments?: Json
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          display_name?: string | null
          due_at?: string | null
          expires_at?: string
          id?: string
          is_test?: boolean
          items?: Json
          last_event_id?: string | null
          line_room_id?: string | null
          line_user_id?: string
          notes?: string | null
          order_id?: string | null
          order_no?: string | null
          source_type?: string
          state?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_line_intake_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "film_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      film_line_notification_settings: {
        Row: {
          id: string
          include_doc_link: boolean
          notify_cash_advance_created: boolean
          notify_doc_created_invoice: boolean
          notify_doc_created_quotation: boolean
          notify_doc_created_receipt: boolean
          notify_job_status_completed: boolean
          notify_job_status_delivered: boolean
          notify_job_status_in_progress: boolean
          notify_job_status_pending: boolean
          notify_job_status_printing: boolean
          notify_payment_status_paid: boolean
          updated_at: string
        }
        Insert: {
          id?: string
          include_doc_link?: boolean
          notify_cash_advance_created?: boolean
          notify_doc_created_invoice?: boolean
          notify_doc_created_quotation?: boolean
          notify_doc_created_receipt?: boolean
          notify_job_status_completed?: boolean
          notify_job_status_delivered?: boolean
          notify_job_status_in_progress?: boolean
          notify_job_status_pending?: boolean
          notify_job_status_printing?: boolean
          notify_payment_status_paid?: boolean
          updated_at?: string
        }
        Update: {
          id?: string
          include_doc_link?: boolean
          notify_cash_advance_created?: boolean
          notify_doc_created_invoice?: boolean
          notify_doc_created_quotation?: boolean
          notify_doc_created_receipt?: boolean
          notify_job_status_completed?: boolean
          notify_job_status_delivered?: boolean
          notify_job_status_in_progress?: boolean
          notify_job_status_pending?: boolean
          notify_job_status_printing?: boolean
          notify_payment_status_paid?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      film_line_pending_actions: {
        Row: {
          action: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          line_user_id: string
          payload: Json
        }
        Insert: {
          action: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          line_user_id: string
          payload?: Json
        }
        Update: {
          action?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          line_user_id?: string
          payload?: Json
        }
        Relationships: []
      }
      film_line_rate_limits: {
        Row: {
          created_at: string
          hits: number
          id: string
          line_user_id: string
          updated_at: string
          window_start: string
        }
        Insert: {
          created_at?: string
          hits?: number
          id?: string
          line_user_id: string
          updated_at?: string
          window_start: string
        }
        Update: {
          created_at?: string
          hits?: number
          id?: string
          line_user_id?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      film_messages: {
        Row: {
          attachments: Json
          channel: string
          conversation_id: string
          created_at: string
          delivery_status: string
          direction: string
          error_code: string | null
          external_message_id: string | null
          id: string
          idempotency_key: string | null
          sender_user_id: string | null
          sent_at: string | null
          text: string | null
          updated_at: string
        }
        Insert: {
          attachments?: Json
          channel?: string
          conversation_id: string
          created_at?: string
          delivery_status?: string
          direction: string
          error_code?: string | null
          external_message_id?: string | null
          id?: string
          idempotency_key?: string | null
          sender_user_id?: string | null
          sent_at?: string | null
          text?: string | null
          updated_at?: string
        }
        Update: {
          attachments?: Json
          channel?: string
          conversation_id?: string
          created_at?: string
          delivery_status?: string
          direction?: string
          error_code?: string | null
          external_message_id?: string | null
          id?: string
          idempotency_key?: string | null
          sender_user_id?: string | null
          sent_at?: string | null
          text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "film_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      film_natta_quick_entries: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          default_amount: number | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
          tx_type: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          default_amount?: number | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          tx_type?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          default_amount?: number | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          tx_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      film_notification_prefs: {
        Row: {
          channels: Json
          created_at: string
          kinds: Json
          quiet_end: string | null
          quiet_start: string | null
          sound_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          channels?: Json
          created_at?: string
          kinds?: Json
          quiet_end?: string | null
          quiet_start?: string | null
          sound_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          channels?: Json
          created_at?: string
          kinds?: Json
          quiet_end?: string | null
          quiet_start?: string | null
          sound_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      film_ops_notifications: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          assignee_user_id: string | null
          body: string | null
          created_at: string
          dedup_key: string | null
          dept: string | null
          escalated_at: string | null
          group_no: number
          id: string
          job_id: string | null
          kind: string
          meta: Json
          order_id: string | null
          read_at: string | null
          severity: string
          snooze_until: string | null
          status: string
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assignee_user_id?: string | null
          body?: string | null
          created_at?: string
          dedup_key?: string | null
          dept?: string | null
          escalated_at?: string | null
          group_no?: number
          id?: string
          job_id?: string | null
          kind: string
          meta?: Json
          order_id?: string | null
          read_at?: string | null
          severity?: string
          snooze_until?: string | null
          status?: string
          store_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assignee_user_id?: string | null
          body?: string | null
          created_at?: string
          dedup_key?: string | null
          dept?: string | null
          escalated_at?: string | null
          group_no?: number
          id?: string
          job_id?: string | null
          kind?: string
          meta?: Json
          order_id?: string | null
          read_at?: string | null
          severity?: string
          snooze_until?: string | null
          status?: string
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_ops_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "film_order_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_ops_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "film_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      film_order_events: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          from_status: string | null
          id: string
          note: string | null
          order_id: string
          order_job_id: string | null
          to_status: string
        }
        Insert: {
          action?: string
          created_at?: string
          created_by?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          order_id: string
          order_job_id?: string | null
          to_status: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          order_id?: string
          order_job_id?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "film_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_order_events_order_job_id_fkey"
            columns: ["order_job_id"]
            isOneToOne: false
            referencedRelation: "film_order_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      film_order_items: {
        Row: {
          assigned_employee_id: string | null
          attachments: Json
          category: string | null
          cost_price: number
          created_at: string
          dept: string | null
          description: string
          due_at: string | null
          id: string
          is_outsourced: boolean
          notes: string | null
          order_id: string
          quantity: number
          size: string | null
          sort_order: number
          title: string | null
          total: number
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          assigned_employee_id?: string | null
          attachments?: Json
          category?: string | null
          cost_price?: number
          created_at?: string
          dept?: string | null
          description?: string
          due_at?: string | null
          id?: string
          is_outsourced?: boolean
          notes?: string | null
          order_id: string
          quantity?: number
          size?: string | null
          sort_order?: number
          title?: string | null
          total?: number
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          assigned_employee_id?: string | null
          attachments?: Json
          category?: string | null
          cost_price?: number
          created_at?: string
          dept?: string | null
          description?: string
          due_at?: string | null
          id?: string
          is_outsourced?: boolean
          notes?: string | null
          order_id?: string
          quantity?: number
          size?: string | null
          sort_order?: number
          title?: string | null
          total?: number
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_order_items_assigned_employee_id_fkey"
            columns: ["assigned_employee_id"]
            isOneToOne: false
            referencedRelation: "film_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "film_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      film_order_jobs: {
        Row: {
          accepted_at: string | null
          assign_reason: string | null
          assigned_at: string | null
          assigned_employee_id: string | null
          attachments: Json
          category: string | null
          cost_price: number
          created_at: string
          dept: string | null
          done_at: string | null
          due_at: string | null
          estimated_minutes: number | null
          id: string
          is_outsourced: boolean
          job_no: string | null
          job_type: string | null
          notes: string | null
          order_id: string
          order_item_id: string | null
          outsource_id: string | null
          pause_reason: string | null
          paused_at: string | null
          planned_finish_at: string | null
          planned_start_at: string | null
          priority: number
          priority_reason: string | null
          priority_score: number
          qc_status: string | null
          quantity: number
          queue_code: string | null
          queue_no: number | null
          requeue_count: number
          schedule_locked: boolean
          size: string | null
          sort_order: number
          stage: string
          stage_changed_at: string
          status: string
          title: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assign_reason?: string | null
          assigned_at?: string | null
          assigned_employee_id?: string | null
          attachments?: Json
          category?: string | null
          cost_price?: number
          created_at?: string
          dept?: string | null
          done_at?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          id?: string
          is_outsourced?: boolean
          job_no?: string | null
          job_type?: string | null
          notes?: string | null
          order_id: string
          order_item_id?: string | null
          outsource_id?: string | null
          pause_reason?: string | null
          paused_at?: string | null
          planned_finish_at?: string | null
          planned_start_at?: string | null
          priority?: number
          priority_reason?: string | null
          priority_score?: number
          qc_status?: string | null
          quantity?: number
          queue_code?: string | null
          queue_no?: number | null
          requeue_count?: number
          schedule_locked?: boolean
          size?: string | null
          sort_order?: number
          stage?: string
          stage_changed_at?: string
          status?: string
          title?: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assign_reason?: string | null
          assigned_at?: string | null
          assigned_employee_id?: string | null
          attachments?: Json
          category?: string | null
          cost_price?: number
          created_at?: string
          dept?: string | null
          done_at?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          id?: string
          is_outsourced?: boolean
          job_no?: string | null
          job_type?: string | null
          notes?: string | null
          order_id?: string
          order_item_id?: string | null
          outsource_id?: string | null
          pause_reason?: string | null
          paused_at?: string | null
          planned_finish_at?: string | null
          planned_start_at?: string | null
          priority?: number
          priority_reason?: string | null
          priority_score?: number
          qc_status?: string | null
          quantity?: number
          queue_code?: string | null
          queue_no?: number | null
          requeue_count?: number
          schedule_locked?: boolean
          size?: string | null
          sort_order?: number
          stage?: string
          stage_changed_at?: string
          status?: string
          title?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_order_jobs_assigned_employee_id_fkey"
            columns: ["assigned_employee_id"]
            isOneToOne: false
            referencedRelation: "film_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_order_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "film_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_order_jobs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "film_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_order_jobs_outsource_id_fkey"
            columns: ["outsource_id"]
            isOneToOne: false
            referencedRelation: "film_outsource_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      film_order_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          kind: string
          method: string
          note: string | null
          order_id: string
          paid_at: string
          receipt_invoice_id: string | null
          received_by: string | null
          reference: string | null
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          method?: string
          note?: string | null
          order_id: string
          paid_at?: string
          receipt_invoice_id?: string | null
          received_by?: string | null
          reference?: string | null
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          method?: string
          note?: string | null
          order_id?: string
          paid_at?: string
          receipt_invoice_id?: string | null
          received_by?: string | null
          reference?: string | null
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "film_order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "film_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      film_orders: {
        Row: {
          assignee: string | null
          attachments: Json
          channel: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          deposit: number
          discount: number
          due_at: string | null
          has_design: boolean
          id: string
          intake_request_id: string | null
          intake_source: string
          internal_job_no: string | null
          is_draft: boolean
          is_test: boolean
          is_urgent: boolean
          notes: string | null
          order_no: string
          org_name: string | null
          paid_amount: number
          payment_status: string
          prepare_receipt: boolean
          source_job_request_id: string | null
          status: string
          subtotal: number
          title: string
          total: number
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          assignee?: string | null
          attachments?: Json
          channel?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deposit?: number
          discount?: number
          due_at?: string | null
          has_design?: boolean
          id?: string
          intake_request_id?: string | null
          intake_source?: string
          internal_job_no?: string | null
          is_draft?: boolean
          is_test?: boolean
          is_urgent?: boolean
          notes?: string | null
          order_no: string
          org_name?: string | null
          paid_amount?: number
          payment_status?: string
          prepare_receipt?: boolean
          source_job_request_id?: string | null
          status?: string
          subtotal?: number
          title?: string
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          assignee?: string | null
          attachments?: Json
          channel?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deposit?: number
          discount?: number
          due_at?: string | null
          has_design?: boolean
          id?: string
          intake_request_id?: string | null
          intake_source?: string
          internal_job_no?: string | null
          is_draft?: boolean
          is_test?: boolean
          is_urgent?: boolean
          notes?: string | null
          order_no?: string
          org_name?: string | null
          paid_amount?: number
          payment_status?: string
          prepare_receipt?: boolean
          source_job_request_id?: string | null
          status?: string
          subtotal?: number
          title?: string
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "film_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "film_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_orders_source_job_request_id_fkey"
            columns: ["source_job_request_id"]
            isOneToOne: false
            referencedRelation: "film_job_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      film_outsource_items: {
        Row: {
          attachments: Json
          cost_price: number
          created_at: string
          finishing: string | null
          id: string
          job_id: string | null
          material: string | null
          note: string | null
          outsource_id: string
          quantity: number
          size: string | null
          title: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          attachments?: Json
          cost_price?: number
          created_at?: string
          finishing?: string | null
          id?: string
          job_id?: string | null
          material?: string | null
          note?: string | null
          outsource_id: string
          quantity?: number
          size?: string | null
          title: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          attachments?: Json
          cost_price?: number
          created_at?: string
          finishing?: string | null
          id?: string
          job_id?: string | null
          material?: string | null
          note?: string | null
          outsource_id?: string
          quantity?: number
          size?: string | null
          title?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_outsource_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "film_order_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_outsource_items_outsource_id_fkey"
            columns: ["outsource_id"]
            isOneToOne: false
            referencedRelation: "film_outsource_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      film_outsource_orders: {
        Row: {
          created_at: string
          created_by: string | null
          due_at: string | null
          id: string
          note: string | null
          order_id: string | null
          received_at: string | null
          sent_at: string | null
          status: string
          supplier_id: string | null
          total_cost: number
          updated_at: string
          wo_no: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          received_at?: string | null
          sent_at?: string | null
          status?: string
          supplier_id?: string | null
          total_cost?: number
          updated_at?: string
          wo_no: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          received_at?: string | null
          sent_at?: string | null
          status?: string
          supplier_id?: string | null
          total_cost?: number
          updated_at?: string
          wo_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_outsource_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "film_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_outsource_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      film_paper_withdrawals: {
        Row: {
          created_at: string
          id: string
          note: string | null
          paper_type: string
          purpose: string | null
          quantity: number
          unit: string
          withdrawn_at: string
          withdrawn_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          paper_type: string
          purpose?: string | null
          quantity: number
          unit?: string
          withdrawn_at?: string
          withdrawn_by: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          paper_type?: string
          purpose?: string | null
          quantity?: number
          unit?: string
          withdrawn_at?: string
          withdrawn_by?: string
        }
        Relationships: []
      }
      film_payment_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          doc_id: string
          doc_number: string
          doc_type: string
          id: string
          notes: string | null
          status_from: string | null
          status_to: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          doc_id: string
          doc_number: string
          doc_type: string
          id?: string
          notes?: string | null
          status_from?: string | null
          status_to: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          doc_id?: string
          doc_number?: string
          doc_type?: string
          id?: string
          notes?: string | null
          status_from?: string | null
          status_to?: string
        }
        Relationships: []
      }
      film_pos_products: {
        Row: {
          canonical_product_id: string | null
          category: string
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          canonical_product_id?: string | null
          category: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          price?: number
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          canonical_product_id?: string | null
          category?: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_pos_products_canonical_product_id_fkey"
            columns: ["canonical_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_pos_products_canonical_product_id_fkey"
            columns: ["canonical_product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_pos_products_canonical_product_id_fkey"
            columns: ["canonical_product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_pos_products_canonical_product_id_fkey"
            columns: ["canonical_product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
      film_pos_receipts: {
        Row: {
          cash_received: number | null
          change_amount: number | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          deposit: number
          id: string
          items: Json
          notes: string | null
          payment_status: string
          payment_type: string
          receipt_date: string
          receipt_number: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          cash_received?: number | null
          change_amount?: number | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          deposit?: number
          id?: string
          items?: Json
          notes?: string | null
          payment_status?: string
          payment_type?: string
          receipt_date?: string
          receipt_number: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          cash_received?: number | null
          change_amount?: number | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          deposit?: number
          id?: string
          items?: Json
          notes?: string | null
          payment_status?: string
          payment_type?: string
          receipt_date?: string
          receipt_number?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_pos_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "film_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      film_queue_counters: {
        Row: {
          day: string
          scope: string
          seq: number
        }
        Insert: {
          day: string
          scope: string
          seq?: number
        }
        Update: {
          day?: string
          scope?: string
          seq?: number
        }
        Relationships: []
      }
      film_queue_routing: {
        Row: {
          active: boolean
          category: string
          created_at: string
          dept: string
          id: string
          label: string
          outsource_default: boolean
          sla_hours: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          dept: string
          id?: string
          label: string
          outsource_default?: boolean
          sla_hours?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          dept?: string
          id?: string
          label?: string
          outsource_default?: boolean
          sla_hours?: number
          updated_at?: string
        }
        Relationships: []
      }
      film_queue_settings: {
        Row: {
          auto_assign: boolean
          buffer_minutes: number
          capacity: number
          close_time: string
          created_at: string
          escalate_after_minutes: number
          id: string
          open_time: string
          outsource_late_hours: number
          require_deposit_before_production: boolean
          stale_hours: number
          timezone: string
          updated_at: string
          warn_before_minutes: number
          working_days: number[]
        }
        Insert: {
          auto_assign?: boolean
          buffer_minutes?: number
          capacity?: number
          close_time?: string
          created_at?: string
          escalate_after_minutes?: number
          id?: string
          open_time?: string
          outsource_late_hours?: number
          require_deposit_before_production?: boolean
          stale_hours?: number
          timezone?: string
          updated_at?: string
          warn_before_minutes?: number
          working_days?: number[]
        }
        Update: {
          auto_assign?: boolean
          buffer_minutes?: number
          capacity?: number
          close_time?: string
          created_at?: string
          escalate_after_minutes?: number
          id?: string
          open_time?: string
          outsource_late_hours?: number
          require_deposit_before_production?: boolean
          stale_hours?: number
          timezone?: string
          updated_at?: string
          warn_before_minutes?: number
          working_days?: number[]
        }
        Relationships: []
      }
      film_quick_items: {
        Row: {
          active: boolean
          category: string
          created_at: string
          id: string
          name: string
          pinned: boolean
          price: number
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          name: string
          pinned?: boolean
          price?: number
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          name?: string
          pinned?: boolean
          price?: number
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      film_shop_managers: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string | null
          id: string
          is_active: boolean
          line_user_id: string
          note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          line_user_id: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          line_user_id?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      film_shop_settings: {
        Row: {
          created_at: string
          default_price_per_sqm: number
          google_sheets_auto_sync: boolean | null
          google_sheets_webhook_url: string | null
          id: string
          product_categories: Json | null
          product_labels: Json
          product_pricing: Json
          quotation_header_text: string | null
          receipt_footer: string | null
          receipt_header: string | null
          shop_address: string
          shop_logo: string | null
          shop_name: string
          shop_phone: string
          shop_tax_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_price_per_sqm?: number
          google_sheets_auto_sync?: boolean | null
          google_sheets_webhook_url?: string | null
          id?: string
          product_categories?: Json | null
          product_labels?: Json
          product_pricing?: Json
          quotation_header_text?: string | null
          receipt_footer?: string | null
          receipt_header?: string | null
          shop_address?: string
          shop_logo?: string | null
          shop_name?: string
          shop_phone?: string
          shop_tax_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_price_per_sqm?: number
          google_sheets_auto_sync?: boolean | null
          google_sheets_webhook_url?: string | null
          id?: string
          product_categories?: Json | null
          product_labels?: Json
          product_pricing?: Json
          quotation_header_text?: string | null
          receipt_footer?: string | null
          receipt_header?: string | null
          shop_address?: string
          shop_logo?: string | null
          shop_name?: string
          shop_phone?: string
          shop_tax_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      film_transactions: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          date: string
          description: string
          evidence: Json
          id: string
          invoice_id: string | null
          line_message_id: string | null
          line_user_id: string | null
          line_webhook_event_id: string | null
          payment_method: string | null
          source: string
          type: string
          updated_by: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          date?: string
          description: string
          evidence?: Json
          id?: string
          invoice_id?: string | null
          line_message_id?: string | null
          line_user_id?: string | null
          line_webhook_event_id?: string | null
          payment_method?: string | null
          source?: string
          type: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          evidence?: Json
          id?: string
          invoice_id?: string | null
          line_message_id?: string | null
          line_user_id?: string | null
          line_webhook_event_id?: string | null
          payment_method?: string | null
          source?: string
          type?: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "film_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "film_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      fs_share_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string
          last_used_at: string | null
          revoked: boolean
          token: string
          use_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string
          last_used_at?: string | null
          revoked?: boolean
          token: string
          use_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string
          last_used_at?: string | null
          revoked?: boolean
          token?: string
          use_count?: number
          user_id?: string
        }
        Relationships: []
      }
      group_prices: {
        Row: {
          created_at: string
          id: string
          price: number
          price_group_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          price: number
          price_group_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          price?: number
          price_group_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_prices_price_group_id_fkey"
            columns: ["price_group_id"]
            isOneToOne: false
            referencedRelation: "price_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
      guest_customers: {
        Row: {
          address: string | null
          created_at: string
          id: string
          last_seen_at: string
          line_user_id: string | null
          name: string | null
          phone: string | null
          tax_branch: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          line_user_id?: string | null
          name?: string | null
          phone?: string | null
          tax_branch?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          line_user_id?: string | null
          name?: string | null
          phone?: string | null
          tax_branch?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      guest_orders: {
        Row: {
          address: string | null
          created_at: string
          customer_branch: string | null
          customer_name: string
          customer_phone: string
          customer_snapshot: Json | null
          customer_tax_id: string | null
          customer_view_token: string | null
          customer_view_token_revoked_at: string | null
          customer_view_visibility: Json | null
          handled_at: string | null
          handled_by: string | null
          id: string
          items: Json
          kind: string
          line_display_name: string | null
          line_picture_url: string | null
          line_user_id: string | null
          line_verified: boolean
          note: string | null
          notes_to_customer: string | null
          order_no: string
          source: string
          status: string
          total: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          customer_branch?: string | null
          customer_name: string
          customer_phone: string
          customer_snapshot?: Json | null
          customer_tax_id?: string | null
          customer_view_token?: string | null
          customer_view_token_revoked_at?: string | null
          customer_view_visibility?: Json | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          items?: Json
          kind?: string
          line_display_name?: string | null
          line_picture_url?: string | null
          line_user_id?: string | null
          line_verified?: boolean
          note?: string | null
          notes_to_customer?: string | null
          order_no: string
          source?: string
          status?: string
          total?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          customer_branch?: string | null
          customer_name?: string
          customer_phone?: string
          customer_snapshot?: Json | null
          customer_tax_id?: string | null
          customer_view_token?: string | null
          customer_view_token_revoked_at?: string | null
          customer_view_visibility?: Json | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          items?: Json
          kind?: string
          line_display_name?: string | null
          line_picture_url?: string | null
          line_user_id?: string | null
          line_verified?: boolean
          note?: string | null
          notes_to_customer?: string | null
          order_no?: string
          source?: string
          status?: string
          total?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      import_jobs: {
        Row: {
          added: number
          deleted: number
          error: string | null
          failed: number
          file_hash: string | null
          file_size: number | null
          filename: string | null
          finished_at: string | null
          id: string
          message: string | null
          processed_rows: number
          stage: string
          started_at: string
          total_rows: number
          updated: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          added?: number
          deleted?: number
          error?: string | null
          failed?: number
          file_hash?: string | null
          file_size?: number | null
          filename?: string | null
          finished_at?: string | null
          id?: string
          message?: string | null
          processed_rows?: number
          stage?: string
          started_at?: string
          total_rows?: number
          updated?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          added?: number
          deleted?: number
          error?: string | null
          failed?: number
          file_hash?: string | null
          file_size?: number | null
          filename?: string | null
          finished_at?: string | null
          id?: string
          message?: string | null
          processed_rows?: number
          stage?: string
          started_at?: string
          total_rows?: number
          updated?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          added: number
          created_at: string
          deleted: number
          errors_count: number
          failed: number
          file_hash: string | null
          file_size: number | null
          filename: string | null
          id: string
          row_results: Json | null
          total_rows: number
          updated: number
          user_id: string | null
          validation: Json | null
          warnings_count: number
        }
        Insert: {
          added?: number
          created_at?: string
          deleted?: number
          errors_count?: number
          failed?: number
          file_hash?: string | null
          file_size?: number | null
          filename?: string | null
          id?: string
          row_results?: Json | null
          total_rows?: number
          updated?: number
          user_id?: string | null
          validation?: Json | null
          warnings_count?: number
        }
        Update: {
          added?: number
          created_at?: string
          deleted?: number
          errors_count?: number
          failed?: number
          file_hash?: string | null
          file_size?: number | null
          filename?: string | null
          id?: string
          row_results?: Json | null
          total_rows?: number
          updated?: number
          user_id?: string | null
          validation?: Json | null
          warnings_count?: number
        }
        Relationships: []
      }
      inbox_threads: {
        Row: {
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          last_event_type: string | null
          last_message_at: string | null
          last_message_text: string | null
          last_replied_at: string | null
          line_user_id: string
          pinned: boolean
          replied_by: string | null
          store_id: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          last_event_type?: string | null
          last_message_at?: string | null
          last_message_text?: string | null
          last_replied_at?: string | null
          line_user_id: string
          pinned?: boolean
          replied_by?: string | null
          store_id?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          last_event_type?: string | null
          last_message_at?: string | null
          last_message_text?: string | null
          last_replied_at?: string | null
          line_user_id?: string
          pinned?: boolean
          replied_by?: string | null
          store_id?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      internal_worker_tokens: {
        Row: {
          created_at: string
          name: string
          token: string
        }
        Insert: {
          created_at?: string
          name: string
          token?: string
        }
        Update: {
          created_at?: string
          name?: string
          token?: string
        }
        Relationships: []
      }
      line_account_links: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_source: string | null
          display_name: string | null
          last_seen_at: string
          line_user_id: string
          phone: string | null
          picture_url: string | null
          updated_at: string
          verified_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_source?: string | null
          display_name?: string | null
          last_seen_at?: string
          line_user_id: string
          phone?: string | null
          picture_url?: string | null
          updated_at?: string
          verified_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_source?: string | null
          display_name?: string | null
          last_seen_at?: string
          line_user_id?: string
          phone?: string | null
          picture_url?: string | null
          updated_at?: string
          verified_at?: string
        }
        Relationships: []
      }
      line_channel_admin_events: {
        Row: {
          action: string
          actor: string | null
          channel_id: string | null
          created_at: string
          id: string
          note: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          channel_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          channel_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "line_channel_admin_events_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_channel_admin_events_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "line_notification_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_channel_admin_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      line_channel_admins: {
        Row: {
          bound_at: string
          bound_by: string | null
          channel_id: string
          created_at: string
          id: string
          is_active: boolean
          note: string | null
          unbound_at: string | null
          unbound_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bound_at?: string
          bound_by?: string | null
          channel_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          note?: string | null
          unbound_at?: string | null
          unbound_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bound_at?: string
          bound_by?: string | null
          channel_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          note?: string | null
          unbound_at?: string | null
          unbound_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_channel_admins_bound_by_fkey"
            columns: ["bound_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_channel_admins_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "line_notification_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_channel_admins_unbound_by_fkey"
            columns: ["unbound_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_channel_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      line_credentials: {
        Row: {
          bot_basic_id: string | null
          bot_display_name: string | null
          channel_access_token: string | null
          channel_id: string | null
          channel_secret: string | null
          display_name: string | null
          id: string
          is_active: boolean
          secret_last4: string | null
          token_last4: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bot_basic_id?: string | null
          bot_display_name?: string | null
          channel_access_token?: string | null
          channel_id?: string | null
          channel_secret?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          secret_last4?: string | null
          token_last4?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bot_basic_id?: string | null
          bot_display_name?: string | null
          channel_access_token?: string | null
          channel_id?: string | null
          channel_secret?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          secret_last4?: string | null
          token_last4?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      line_delivery_logs: {
        Row: {
          attempts: number
          channel_id: string | null
          created_at: string
          error_code: string | null
          id: string
          idempotency_key: string | null
          kind: string
          notification_id: string | null
          provider_message_id: string | null
          sender_store_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          channel_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string
          notification_id?: string | null
          provider_message_id?: string | null
          sender_store_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          channel_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string
          notification_id?: string | null
          provider_message_id?: string | null
          sender_store_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_delivery_logs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "line_notification_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      line_doc_bot_actions: {
        Row: {
          action_key: string
          created_at: string
          result: Json
        }
        Insert: {
          action_key: string
          created_at?: string
          result?: Json
        }
        Update: {
          action_key?: string
          created_at?: string
          result?: Json
        }
        Relationships: []
      }
      line_doc_bot_approvals: {
        Row: {
          approved_at: string
          approved_by_line_user_id: string | null
          created_at: string
          group_id: string | null
          id: string
          quotation_no: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string
          approved_by_line_user_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          quotation_no: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string
          approved_by_line_user_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          quotation_no?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      line_doc_bot_audit: {
        Row: {
          action: string
          created_at: string
          detail: Json
          document_no: string | null
          draft_id: string | null
          group_id: string | null
          id: string
          line_user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json
          document_no?: string | null
          draft_id?: string | null
          group_id?: string | null
          id?: string
          line_user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json
          document_no?: string | null
          draft_id?: string | null
          group_id?: string | null
          id?: string
          line_user_id?: string | null
        }
        Relationships: []
      }
      line_doc_bot_drafts: {
        Row: {
          created_at: string
          document_id: string | null
          document_no: string | null
          group_id: string
          id: string
          line_user_id: string
          payload: Json
          shop_key: string
          status: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          document_no?: string | null
          group_id: string
          id?: string
          line_user_id: string
          payload?: Json
          shop_key: string
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          document_no?: string | null
          group_id?: string
          id?: string
          line_user_id?: string
          payload?: Json
          shop_key?: string
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      line_link_codes: {
        Row: {
          code: string
          consumed_at: string | null
          consumed_line_user_id: string | null
          created_at: string
          expires_at: string
          user_id: string
        }
        Insert: {
          code: string
          consumed_at?: string | null
          consumed_line_user_id?: string | null
          created_at?: string
          expires_at?: string
          user_id: string
        }
        Update: {
          code?: string
          consumed_at?: string | null
          consumed_line_user_id?: string | null
          created_at?: string
          expires_at?: string
          user_id?: string
        }
        Relationships: []
      }
      line_link_otps: {
        Row: {
          attempts: number
          code: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          line_user_id: string
          phone: string
        }
        Insert: {
          attempts?: number
          code: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          line_user_id: string
          phone: string
        }
        Update: {
          attempts?: number
          code?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          line_user_id?: string
          phone?: string
        }
        Relationships: []
      }
      line_login_diagnostics: {
        Row: {
          created_at: string
          detail: Json
          event: string
          id: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          event: string
          id?: string
        }
        Update: {
          created_at?: string
          detail?: Json
          event?: string
          id?: string
        }
        Relationships: []
      }
      line_notification_channels: {
        Row: {
          channel_type: string
          created_at: string
          display_name: string | null
          doc_commands_enabled: boolean
          id: string
          is_active: boolean
          is_hub: boolean
          last_test_at: string | null
          last_test_status: string | null
          last_verified_at: string | null
          line_destination_id: string
          linked_at: string
          linked_by: string | null
          queue_commands_enabled: boolean
          queue_require_admin: boolean
          store_id: string
          updated_at: string
        }
        Insert: {
          channel_type?: string
          created_at?: string
          display_name?: string | null
          doc_commands_enabled?: boolean
          id?: string
          is_active?: boolean
          is_hub?: boolean
          last_test_at?: string | null
          last_test_status?: string | null
          last_verified_at?: string | null
          line_destination_id: string
          linked_at?: string
          linked_by?: string | null
          queue_commands_enabled?: boolean
          queue_require_admin?: boolean
          store_id?: string
          updated_at?: string
        }
        Update: {
          channel_type?: string
          created_at?: string
          display_name?: string | null
          doc_commands_enabled?: boolean
          id?: string
          is_active?: boolean
          is_hub?: boolean
          last_test_at?: string | null
          last_test_status?: string | null
          last_verified_at?: string | null
          line_destination_id?: string
          linked_at?: string
          linked_by?: string | null
          queue_commands_enabled?: boolean
          queue_require_admin?: boolean
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_notification_channels_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      line_notifications: {
        Row: {
          created_at: string
          customer_id: string | null
          direction: string
          document_id: string | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          kind: string | null
          last_attempt_at: string | null
          message: string | null
          order_id: string | null
          recipient: string | null
          retry_count: number
          sent_at: string | null
          sent_status: string
          type: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          direction: string
          document_id?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string | null
          last_attempt_at?: string | null
          message?: string | null
          order_id?: string | null
          recipient?: string | null
          retry_count?: number
          sent_at?: string | null
          sent_status?: string
          type: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          direction?: string
          document_id?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string | null
          last_attempt_at?: string | null
          message?: string | null
          order_id?: string | null
          recipient?: string | null
          retry_count?: number
          sent_at?: string | null
          sent_status?: string
          type?: string
        }
        Relationships: []
      }
      line_oa_settings: {
        Row: {
          basic_id: string | null
          created_at: string
          default_reply_mode: string
          enabled: boolean
          id: string
          liff_callback_urls: string[]
          liff_endpoint_url: string | null
          liff_id: string | null
          liff_scopes: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          basic_id?: string | null
          created_at?: string
          default_reply_mode?: string
          enabled?: boolean
          id?: string
          liff_callback_urls?: string[]
          liff_endpoint_url?: string | null
          liff_id?: string | null
          liff_scopes?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          basic_id?: string | null
          created_at?: string
          default_reply_mode?: string
          enabled?: boolean
          id?: string
          liff_callback_urls?: string[]
          liff_endpoint_url?: string | null
          liff_id?: string | null
          liff_scopes?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      line_oauth_states: {
        Row: {
          code_verifier: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          handoff: string | null
          handoff_consumed_at: string | null
          handoff_payload: Json | null
          id: string
          link_user_id: string | null
          next_path: string
          nonce: string
          redirect_uri: string
          state: string
          trace_id: string | null
          updated_at: string
        }
        Insert: {
          code_verifier: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          handoff?: string | null
          handoff_consumed_at?: string | null
          handoff_payload?: Json | null
          id?: string
          link_user_id?: string | null
          next_path?: string
          nonce: string
          redirect_uri: string
          state: string
          trace_id?: string | null
          updated_at?: string
        }
        Update: {
          code_verifier?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          handoff?: string | null
          handoff_consumed_at?: string | null
          handoff_payload?: Json | null
          id?: string
          link_user_id?: string | null
          next_path?: string
          nonce?: string
          redirect_uri?: string
          state?: string
          trace_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      line_order_hints: {
        Row: {
          acted_by: string | null
          conversation_id: string | null
          converted_id: string | null
          converted_to: string | null
          created_at: string
          id: string
          message_id: string
          state: string
          updated_at: string
        }
        Insert: {
          acted_by?: string | null
          conversation_id?: string | null
          converted_id?: string | null
          converted_to?: string | null
          created_at?: string
          id?: string
          message_id: string
          state?: string
          updated_at?: string
        }
        Update: {
          acted_by?: string | null
          conversation_id?: string | null
          converted_id?: string | null
          converted_to?: string | null
          created_at?: string
          id?: string
          message_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      line_otp_codes: {
        Row: {
          attempts: number
          code: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          purpose: string
          sent_to_line_user_id: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          code: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          purpose?: string
          sent_to_line_user_id?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          code?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          sent_to_line_user_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      line_phone_bindings: {
        Row: {
          bound_at: string
          display_name: string | null
          line_user_id: string
          phone: string
          updated_at: string
        }
        Insert: {
          bound_at?: string
          display_name?: string | null
          line_user_id: string
          phone: string
          updated_at?: string
        }
        Update: {
          bound_at?: string
          display_name?: string | null
          line_user_id?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      line_store_customers: {
        Row: {
          created_at: string
          display_name: string | null
          last_seen_at: string
          line_user_id: string
          picture_url: string | null
          status_message: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          last_seen_at?: string
          line_user_id: string
          picture_url?: string | null
          status_message?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          last_seen_at?: string
          line_user_id?: string
          picture_url?: string | null
          status_message?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      line_webhook_dedup: {
        Row: {
          created_at: string
          store_id: string | null
          webhook_event_id: string
        }
        Insert: {
          created_at?: string
          store_id?: string | null
          webhook_event_id: string
        }
        Update: {
          created_at?: string
          store_id?: string | null
          webhook_event_id?: string
        }
        Relationships: []
      }
      line_webhook_events: {
        Row: {
          channel_id: string | null
          channel_label: string | null
          destination: string | null
          doc_type: string | null
          duration_ms: number | null
          event_type: string | null
          group_id: string | null
          handler_error: string | null
          handler_result: string | null
          id: string
          message_text: string | null
          processed_at: string | null
          raw: Json
          received_at: string
          ref_code: string | null
          reply_token: string | null
          signature_ok: boolean
          source_user_id: string | null
        }
        Insert: {
          channel_id?: string | null
          channel_label?: string | null
          destination?: string | null
          doc_type?: string | null
          duration_ms?: number | null
          event_type?: string | null
          group_id?: string | null
          handler_error?: string | null
          handler_result?: string | null
          id?: string
          message_text?: string | null
          processed_at?: string | null
          raw: Json
          received_at?: string
          ref_code?: string | null
          reply_token?: string | null
          signature_ok: boolean
          source_user_id?: string | null
        }
        Update: {
          channel_id?: string | null
          channel_label?: string | null
          destination?: string | null
          doc_type?: string | null
          duration_ms?: number | null
          event_type?: string | null
          group_id?: string | null
          handler_error?: string | null
          handler_result?: string | null
          id?: string
          message_text?: string | null
          processed_at?: string | null
          raw?: Json
          received_at?: string
          ref_code?: string | null
          reply_token?: string | null
          signature_ok?: boolean
          source_user_id?: string | null
        }
        Relationships: []
      }
      link_requests: {
        Row: {
          admin_note: string | null
          contact_name: string
          created_at: string
          error: string | null
          id: string
          ip: unknown
          matched_org_id: string | null
          matched_slug: string | null
          notified_at: string | null
          phone: string
          school_name: string
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          admin_note?: string | null
          contact_name: string
          created_at?: string
          error?: string | null
          id?: string
          ip?: unknown
          matched_org_id?: string | null
          matched_slug?: string | null
          notified_at?: string | null
          phone: string
          school_name: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          admin_note?: string | null
          contact_name?: string
          created_at?: string
          error?: string | null
          id?: string
          ip?: unknown
          matched_org_id?: string | null
          matched_slug?: string | null
          notified_at?: string | null
          phone?: string
          school_name?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "link_requests_matched_org_id_fkey"
            columns: ["matched_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      login_events: {
        Row: {
          city: string | null
          country: string | null
          device: string | null
          id: string
          ip: string | null
          occurred_at: string
          region: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          device?: string | null
          id?: string
          ip?: string | null
          occurred_at?: string
          region?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          city?: string | null
          country?: string | null
          device?: string | null
          id?: string
          ip?: string | null
          occurred_at?: string
          region?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      myshop_integrations: {
        Row: {
          api_key_last4: string | null
          auto_publish_enabled: boolean
          category_presets: Json
          channel_id: string
          created_at: string
          default_weight_kg: number
          enabled: boolean
          fallback_image_url: string | null
          id: string
          label: string | null
          last_error: string | null
          last_sync_at: string | null
          last_tested_at: string | null
          status: string
          sync_inventory: boolean
          sync_orders: boolean
          sync_products: boolean
          updated_at: string
          webhook_secret_last4: string | null
        }
        Insert: {
          api_key_last4?: string | null
          auto_publish_enabled?: boolean
          category_presets?: Json
          channel_id: string
          created_at?: string
          default_weight_kg?: number
          enabled?: boolean
          fallback_image_url?: string | null
          id?: string
          label?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          last_tested_at?: string | null
          status?: string
          sync_inventory?: boolean
          sync_orders?: boolean
          sync_products?: boolean
          updated_at?: string
          webhook_secret_last4?: string | null
        }
        Update: {
          api_key_last4?: string | null
          auto_publish_enabled?: boolean
          category_presets?: Json
          channel_id?: string
          created_at?: string
          default_weight_kg?: number
          enabled?: boolean
          fallback_image_url?: string | null
          id?: string
          label?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          last_tested_at?: string | null
          status?: string
          sync_inventory?: boolean
          sync_orders?: boolean
          sync_products?: boolean
          updated_at?: string
          webhook_secret_last4?: string | null
        }
        Relationships: []
      }
      myshop_orders: {
        Row: {
          channel_id: string | null
          created_at: string
          discount_amount: number
          id: string
          integration_id: string | null
          items_snapshot: Json
          last_event: string | null
          last_event_at: string | null
          needs_mapping: boolean
          order_id: string | null
          order_number: string
          order_status: string | null
          payment_status: string | null
          raw: Json | null
          shipment_price: number
          shipment_status: string | null
          shipping_address: Json | null
          stock_deducted: boolean
          stock_deducted_at: string | null
          stock_restored: boolean
          stock_restored_at: string | null
          total_price: number
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          discount_amount?: number
          id?: string
          integration_id?: string | null
          items_snapshot?: Json
          last_event?: string | null
          last_event_at?: string | null
          needs_mapping?: boolean
          order_id?: string | null
          order_number: string
          order_status?: string | null
          payment_status?: string | null
          raw?: Json | null
          shipment_price?: number
          shipment_status?: string | null
          shipping_address?: Json | null
          stock_deducted?: boolean
          stock_deducted_at?: string | null
          stock_restored?: boolean
          stock_restored_at?: string | null
          total_price?: number
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          discount_amount?: number
          id?: string
          integration_id?: string | null
          items_snapshot?: Json
          last_event?: string | null
          last_event_at?: string | null
          needs_mapping?: boolean
          order_id?: string | null
          order_number?: string
          order_status?: string | null
          payment_status?: string | null
          raw?: Json | null
          shipment_price?: number
          shipment_status?: string | null
          shipping_address?: Json | null
          stock_deducted?: boolean
          stock_deducted_at?: string | null
          stock_restored?: boolean
          stock_restored_at?: string | null
          total_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "myshop_orders_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "myshop_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "myshop_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      myshop_product_mappings: {
        Row: {
          barcode: string | null
          created_at: string
          id: string
          integration_id: string | null
          last_error: string | null
          last_price_synced_at: string | null
          last_stock_synced_at: string | null
          match_source: string | null
          myshop_inventory_id: string | null
          myshop_name: string | null
          myshop_product_id: string
          myshop_variant_id: string | null
          product_id: string | null
          sku: string | null
          sync_status: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          id?: string
          integration_id?: string | null
          last_error?: string | null
          last_price_synced_at?: string | null
          last_stock_synced_at?: string | null
          match_source?: string | null
          myshop_inventory_id?: string | null
          myshop_name?: string | null
          myshop_product_id: string
          myshop_variant_id?: string | null
          product_id?: string | null
          sku?: string | null
          sync_status?: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          barcode?: string | null
          created_at?: string
          id?: string
          integration_id?: string | null
          last_error?: string | null
          last_price_synced_at?: string | null
          last_stock_synced_at?: string | null
          match_source?: string | null
          myshop_inventory_id?: string | null
          myshop_name?: string | null
          myshop_product_id?: string
          myshop_variant_id?: string | null
          product_id?: string | null
          sku?: string | null
          sync_status?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "myshop_product_mappings_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "myshop_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "myshop_product_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "myshop_product_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "myshop_product_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "myshop_product_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "myshop_product_mappings_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      myshop_sync_logs: {
        Row: {
          action: string
          created_at: string
          error: string | null
          id: string
          integration_id: string | null
          meta: Json | null
          method: string | null
          oap_request_id: string | null
          ok: boolean
          request_id: string | null
          status_code: number | null
          url_path: string | null
        }
        Insert: {
          action: string
          created_at?: string
          error?: string | null
          id?: string
          integration_id?: string | null
          meta?: Json | null
          method?: string | null
          oap_request_id?: string | null
          ok?: boolean
          request_id?: string | null
          status_code?: number | null
          url_path?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          error?: string | null
          id?: string
          integration_id?: string | null
          meta?: Json | null
          method?: string | null
          oap_request_id?: string | null
          ok?: boolean
          request_id?: string | null
          status_code?: number | null
          url_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "myshop_sync_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "myshop_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      myshop_webhook_events: {
        Row: {
          error: string | null
          event_key: string
          event_name: string | null
          id: string
          order_number: string | null
          processed: boolean
          processed_at: string | null
          raw: Json | null
          received_at: string
          request_id: string | null
          signature_valid: boolean
          trace_id: string | null
        }
        Insert: {
          error?: string | null
          event_key: string
          event_name?: string | null
          id?: string
          order_number?: string | null
          processed?: boolean
          processed_at?: string | null
          raw?: Json | null
          received_at?: string
          request_id?: string | null
          signature_valid?: boolean
          trace_id?: string | null
        }
        Update: {
          error?: string | null
          event_key?: string
          event_name?: string | null
          id?: string
          order_number?: string | null
          processed?: boolean
          processed_at?: string | null
          raw?: Json | null
          received_at?: string
          request_id?: string | null
          signature_valid?: boolean
          trace_id?: string | null
        }
        Relationships: []
      }
      notification_dispatch_runs: {
        Row: {
          claimed: number
          created_at: string
          dead: number
          error: string | null
          failed: number
          finished_at: string | null
          id: string
          sent: number
          skipped: number
          started_at: string
          trigger_source: string
        }
        Insert: {
          claimed?: number
          created_at?: string
          dead?: number
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          sent?: number
          skipped?: number
          started_at?: string
          trigger_source?: string
        }
        Update: {
          claimed?: number
          created_at?: string
          dead?: number
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          sent?: number
          skipped?: number
          started_at?: string
          trigger_source?: string
        }
        Relationships: []
      }
      notification_outbox: {
        Row: {
          attempts: number
          binding_id: string | null
          channel: string
          claimed_at: string | null
          client_request_id: string | null
          created_at: string
          created_by: string | null
          deduplicated: boolean
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          lease_expires_at: string | null
          next_retry_at: string
          payload: Json
          provider_message_id: string | null
          recipient: string | null
          ref_id: string | null
          ref_type: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          binding_id?: string | null
          channel?: string
          claimed_at?: string | null
          client_request_id?: string | null
          created_at?: string
          created_by?: string | null
          deduplicated?: boolean
          event_type: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          lease_expires_at?: string | null
          next_retry_at?: string
          payload?: Json
          provider_message_id?: string | null
          recipient?: string | null
          ref_id?: string | null
          ref_type?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          binding_id?: string | null
          channel?: string
          claimed_at?: string | null
          client_request_id?: string | null
          created_at?: string
          created_by?: string | null
          deduplicated?: boolean
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          lease_expires_at?: string | null
          next_retry_at?: string
          payload?: Json
          provider_message_id?: string | null
          recipient?: string | null
          ref_id?: string | null
          ref_type?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedup_key: string | null
          for_staff: boolean
          id: string
          link: string | null
          read: boolean
          ref_id: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedup_key?: string | null
          for_staff?: boolean
          id?: string
          link?: string | null
          read?: boolean
          ref_id?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          dedup_key?: string | null
          for_staff?: boolean
          id?: string
          link?: string | null
          read?: boolean
          ref_id?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      order_customer_view_defaults: {
        Row: {
          created_at: string
          id: string
          shop_id: string | null
          show_attachments: boolean
          show_created_at: boolean
          show_delivery_due: boolean
          show_discount: boolean
          show_item_subtotal: boolean
          show_items: boolean
          show_notes_to_customer: boolean
          show_order_no: boolean
          show_payment_method: boolean
          show_payment_status: boolean
          show_production_status: boolean
          show_project_name: boolean
          show_qty: boolean
          show_quotation_link: boolean
          show_receipt_link: boolean
          show_shipping: boolean
          show_shipping_address: boolean
          show_shop_messages: boolean
          show_status: boolean
          show_status_history: boolean
          show_subtotal: boolean
          show_tax: boolean
          show_total: boolean
          show_tracking_no: boolean
          show_unit_price: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          shop_id?: string | null
          show_attachments?: boolean
          show_created_at?: boolean
          show_delivery_due?: boolean
          show_discount?: boolean
          show_item_subtotal?: boolean
          show_items?: boolean
          show_notes_to_customer?: boolean
          show_order_no?: boolean
          show_payment_method?: boolean
          show_payment_status?: boolean
          show_production_status?: boolean
          show_project_name?: boolean
          show_qty?: boolean
          show_quotation_link?: boolean
          show_receipt_link?: boolean
          show_shipping?: boolean
          show_shipping_address?: boolean
          show_shop_messages?: boolean
          show_status?: boolean
          show_status_history?: boolean
          show_subtotal?: boolean
          show_tax?: boolean
          show_total?: boolean
          show_tracking_no?: boolean
          show_unit_price?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          shop_id?: string | null
          show_attachments?: boolean
          show_created_at?: boolean
          show_delivery_due?: boolean
          show_discount?: boolean
          show_item_subtotal?: boolean
          show_items?: boolean
          show_notes_to_customer?: boolean
          show_order_no?: boolean
          show_payment_method?: boolean
          show_payment_status?: boolean
          show_production_status?: boolean
          show_project_name?: boolean
          show_qty?: boolean
          show_quotation_link?: boolean
          show_receipt_link?: boolean
          show_shipping?: boolean
          show_shipping_address?: boolean
          show_shop_messages?: boolean
          show_status?: boolean
          show_status_history?: boolean
          show_subtotal?: boolean
          show_tax?: boolean
          show_total?: boolean
          show_tracking_no?: boolean
          show_unit_price?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_customer_view_defaults_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_drive_files: {
        Row: {
          drive_file_id: string | null
          drive_file_url: string | null
          drive_thumbnail_url: string | null
          file_name: string
          id: string
          kind: string
          last_error_at: string | null
          last_error_code: string | null
          mime_type: string | null
          next_retry_at: string | null
          order_id: string
          payload_path: string | null
          retry_count: number
          shop_id: string | null
          size_bytes: number | null
          status: string
          store_slug: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          drive_file_id?: string | null
          drive_file_url?: string | null
          drive_thumbnail_url?: string | null
          file_name: string
          id?: string
          kind?: string
          last_error_at?: string | null
          last_error_code?: string | null
          mime_type?: string | null
          next_retry_at?: string | null
          order_id: string
          payload_path?: string | null
          retry_count?: number
          shop_id?: string | null
          size_bytes?: number | null
          status?: string
          store_slug?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          drive_file_id?: string | null
          drive_file_url?: string | null
          drive_thumbnail_url?: string | null
          file_name?: string
          id?: string
          kind?: string
          last_error_at?: string | null
          last_error_code?: string | null
          mime_type?: string | null
          next_retry_at?: string | null
          order_id?: string
          payload_path?: string | null
          retry_count?: number
          shop_id?: string | null
          size_bytes?: number | null
          status?: string
          store_slug?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_drive_files_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_drive_files_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_files: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_type: string | null
          id: string
          note: string | null
          order_id: string | null
          size_bytes: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_type?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          size_bytes?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_type?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          size_bytes?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_files_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_internal_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          order_id: string
          order_kind: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          order_id: string
          order_kind: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          order_id?: string
          order_kind?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          note: string | null
          order_id: string
          price: number
          product_code: string | null
          product_id: string | null
          product_name: string
          qty: number
          total: number
          unit: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          price?: number
          product_code?: string | null
          product_id?: string | null
          product_name: string
          qty: number
          total?: number
          unit?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          price?: number
          product_code?: string | null
          product_id?: string | null
          product_name?: string
          qty?: number
          total?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
      order_notification_logs: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          id: string
          notification_type: string
          order_id: string
          payload: Json
          recipient_type: string
          sent_at: string | null
          status: string
          target_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          notification_type?: string
          order_id: string
          payload?: Json
          recipient_type: string
          sent_at?: string | null
          status?: string
          target_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          notification_type?: string
          order_id?: string
          payload?: Json
          recipient_type?: string
          sent_at?: string | null
          status?: string
          target_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      order_replies: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          id: string
          line_message_id: string | null
          message: string
          order_id: string
          replied_by: string | null
          replied_by_name: string | null
          status: string
          template_id: string | null
          template_type: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          line_message_id?: string | null
          message: string
          order_id: string
          replied_by?: string | null
          replied_by_name?: string | null
          status?: string
          template_id?: string | null
          template_type?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          line_message_id?: string | null
          message?: string
          order_id?: string
          replied_by?: string | null
          replied_by_name?: string | null
          status?: string
          template_id?: string | null
          template_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_replies_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_replies_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "reply_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_events: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          order_id: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id: string
          status: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          created_at: string
          customer_branch: string | null
          customer_id: string | null
          customer_snapshot: Json | null
          customer_tax_id: string | null
          customer_view_token: string | null
          customer_view_token_revoked_at: string | null
          customer_view_visibility: Json | null
          deleted_at: string | null
          delivery_note_file: Json | null
          delivery_note_sent_at: string | null
          delivery_note_sent_by: string | null
          discount: number
          doc_intent: string
          drive_folder_id: string | null
          drive_folder_url: string | null
          drive_last_error: string | null
          drive_store_slug: string | null
          drive_synced_at: string | null
          external_order_no: string | null
          guest_id: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          idempotency_key: string | null
          is_guest: boolean
          line_link_token: string | null
          line_user_id: string | null
          note: string | null
          notes_to_customer: string | null
          order_no: string
          organization_id: string | null
          paid_at: string | null
          priced_at: string | null
          priced_by: string | null
          project_name: string | null
          quote_file: Json | null
          quote_sent_at: string | null
          quote_sent_by: string | null
          receipt_issued_at: string | null
          receipt_no: string | null
          reply_draft: string | null
          school_name: string | null
          shipping_fee: number
          shop_id: string | null
          source: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          customer_branch?: string | null
          customer_id?: string | null
          customer_snapshot?: Json | null
          customer_tax_id?: string | null
          customer_view_token?: string | null
          customer_view_token_revoked_at?: string | null
          customer_view_visibility?: Json | null
          deleted_at?: string | null
          delivery_note_file?: Json | null
          delivery_note_sent_at?: string | null
          delivery_note_sent_by?: string | null
          discount?: number
          doc_intent?: string
          drive_folder_id?: string | null
          drive_folder_url?: string | null
          drive_last_error?: string | null
          drive_store_slug?: string | null
          drive_synced_at?: string | null
          external_order_no?: string | null
          guest_id?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          idempotency_key?: string | null
          is_guest?: boolean
          line_link_token?: string | null
          line_user_id?: string | null
          note?: string | null
          notes_to_customer?: string | null
          order_no: string
          organization_id?: string | null
          paid_at?: string | null
          priced_at?: string | null
          priced_by?: string | null
          project_name?: string | null
          quote_file?: Json | null
          quote_sent_at?: string | null
          quote_sent_by?: string | null
          receipt_issued_at?: string | null
          receipt_no?: string | null
          reply_draft?: string | null
          school_name?: string | null
          shipping_fee?: number
          shop_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          customer_branch?: string | null
          customer_id?: string | null
          customer_snapshot?: Json | null
          customer_tax_id?: string | null
          customer_view_token?: string | null
          customer_view_token_revoked_at?: string | null
          customer_view_visibility?: Json | null
          deleted_at?: string | null
          delivery_note_file?: Json | null
          delivery_note_sent_at?: string | null
          delivery_note_sent_by?: string | null
          discount?: number
          doc_intent?: string
          drive_folder_id?: string | null
          drive_folder_url?: string | null
          drive_last_error?: string | null
          drive_store_slug?: string | null
          drive_synced_at?: string | null
          external_order_no?: string | null
          guest_id?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          idempotency_key?: string | null
          is_guest?: boolean
          line_link_token?: string | null
          line_user_id?: string | null
          note?: string | null
          notes_to_customer?: string | null
          order_no?: string
          organization_id?: string | null
          paid_at?: string | null
          priced_at?: string | null
          priced_by?: string | null
          project_name?: string | null
          quote_file?: Json | null
          quote_sent_at?: string | null
          quote_sent_by?: string | null
          receipt_issued_at?: string | null
          receipt_no?: string | null
          reply_draft?: string | null
          school_name?: string | null
          shipping_fee?: number
          shop_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          approved: boolean
          contact_name: string | null
          created_at: string
          created_by: string | null
          customer_code: string | null
          deleted_at: string | null
          drive_folder_id: string | null
          drive_sync_error: string | null
          drive_sync_last_at: string | null
          drive_sync_status: string | null
          email: string | null
          id: string
          line_id: string | null
          line_verified_at: string | null
          line_verified_by: string | null
          name: string
          phone: string | null
          price_group_id: string | null
          school_token: string | null
          slug: string | null
          type: Database["public"]["Enums"]["customer_type"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          approved?: boolean
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_code?: string | null
          deleted_at?: string | null
          drive_folder_id?: string | null
          drive_sync_error?: string | null
          drive_sync_last_at?: string | null
          drive_sync_status?: string | null
          email?: string | null
          id?: string
          line_id?: string | null
          line_verified_at?: string | null
          line_verified_by?: string | null
          name: string
          phone?: string | null
          price_group_id?: string | null
          school_token?: string | null
          slug?: string | null
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          approved?: boolean
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_code?: string | null
          deleted_at?: string | null
          drive_folder_id?: string | null
          drive_sync_error?: string | null
          drive_sync_last_at?: string | null
          drive_sync_status?: string | null
          email?: string | null
          id?: string
          line_id?: string | null
          line_verified_at?: string | null
          line_verified_by?: string | null
          name?: string
          phone?: string | null
          price_group_id?: string | null
          school_token?: string | null
          slug?: string | null
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_price_group_id_fkey"
            columns: ["price_group_id"]
            isOneToOne: false
            referencedRelation: "price_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      po_receipt_items: {
        Row: {
          base_product_id: string | null
          base_qty: number | null
          id: string
          po_item_id: string
          qty: number
          ratio_snapshot: number | null
          receipt_id: string
          unit_cost_snapshot: number
        }
        Insert: {
          base_product_id?: string | null
          base_qty?: number | null
          id?: string
          po_item_id: string
          qty: number
          ratio_snapshot?: number | null
          receipt_id: string
          unit_cost_snapshot?: number
        }
        Update: {
          base_product_id?: string | null
          base_qty?: number | null
          id?: string
          po_item_id?: string
          qty?: number
          ratio_snapshot?: number | null
          receipt_id?: string
          unit_cost_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_receipt_items_base_product_id_fkey"
            columns: ["base_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_receipt_items_base_product_id_fkey"
            columns: ["base_product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_receipt_items_base_product_id_fkey"
            columns: ["base_product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_receipt_items_base_product_id_fkey"
            columns: ["base_product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "po_receipt_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "po_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      po_receipts: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string | null
          note: string | null
          po_id: string
          received_at: string
          received_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key?: string | null
          note?: string | null
          po_id: string
          received_at?: string
          received_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string | null
          note?: string | null
          po_id?: string
          received_at?: string
          received_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "po_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      po_status_history: {
        Row: {
          actor: string | null
          at: string
          from_status: string | null
          id: string
          note: string | null
          po_id: string
          to_status: string
        }
        Insert: {
          actor?: string | null
          at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          po_id: string
          to_status: string
        }
        Update: {
          actor?: string | null
          at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          po_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_status_history_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_receipt_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          idem_key: string
          mime_type: string | null
          receipt_id: string | null
          receipt_number: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          idem_key: string
          mime_type?: string | null
          receipt_id?: string | null
          receipt_number?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          idem_key?: string
          mime_type?: string | null
          receipt_id?: string | null
          receipt_number?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      pos_receipt_items: {
        Row: {
          base_product_id: string | null
          base_ratio: number | null
          created_at: string
          id: string
          line_total: number
          name: string
          product_id: string | null
          qty: number
          receipt_id: string
          unit: string | null
          unit_price: number
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          base_product_id?: string | null
          base_ratio?: number | null
          created_at?: string
          id?: string
          line_total: number
          name: string
          product_id?: string | null
          qty: number
          receipt_id: string
          unit?: string | null
          unit_price: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          base_product_id?: string | null
          base_ratio?: number | null
          created_at?: string
          id?: string
          line_total?: number
          name?: string
          product_id?: string | null
          qty?: number
          receipt_id?: string
          unit?: string | null
          unit_price?: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_receipt_items_base_product_id_fkey"
            columns: ["base_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_receipt_items_base_product_id_fkey"
            columns: ["base_product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_receipt_items_base_product_id_fkey"
            columns: ["base_product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_receipt_items_base_product_id_fkey"
            columns: ["base_product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pos_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pos_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "pos_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_receipt_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_receipts: {
        Row: {
          branch: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          cash_received: number | null
          change_amount: number | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          delivery_address: string | null
          delivery_fee: number
          delivery_phone: string | null
          delivery_status: string | null
          discount: number
          id: string
          idempotency_key: string
          line_user_id: string | null
          notes: string | null
          payment_status: string
          payment_type: string
          receipt_number: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          branch?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          cash_received?: number | null
          change_amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          delivery_phone?: string | null
          delivery_status?: string | null
          discount?: number
          id?: string
          idempotency_key: string
          line_user_id?: string | null
          notes?: string | null
          payment_status?: string
          payment_type?: string
          receipt_number: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          branch?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          cash_received?: number | null
          change_amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          delivery_phone?: string | null
          delivery_status?: string | null
          discount?: number
          id?: string
          idempotency_key?: string
          line_user_id?: string | null
          notes?: string | null
          payment_status?: string
          payment_type?: string
          receipt_number?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_store_profile: {
        Row: {
          address: string | null
          email: string | null
          logo_url: string | null
          phone: string | null
          shop_name: string
          store_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          email?: string | null
          logo_url?: string | null
          phone?: string | null
          shop_name?: string
          store_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          email?: string | null
          logo_url?: string | null
          phone?: string | null
          shop_name?: string
          store_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      price_groups: {
        Row: {
          created_at: string
          id: string
          is_custom: boolean
          markup_percent: number
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_custom?: boolean
          markup_percent?: number
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_custom?: boolean
          markup_percent?: number
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      price_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_price: number | null
          old_price: number | null
          product_id: string
          ref_id: string | null
          scope: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_price?: number | null
          old_price?: number | null
          product_id: string
          ref_id?: string | null
          scope: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_price?: number | null
          old_price?: number | null
          product_id?: string
          ref_id?: string | null
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_attributes: {
        Row: {
          created_at: string
          id: string
          is_builtin: boolean
          key: string
          label_th: string
          sort_order: number
          updated_at: string
          values: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_builtin?: boolean
          key: string
          label_th: string
          sort_order?: number
          updated_at?: string
          values?: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_builtin?: boolean
          key?: string
          label_th?: string
          sort_order?: number
          updated_at?: string
          values?: Json
        }
        Relationships: []
      }
      product_bundles: {
        Row: {
          child_id: string
          conversion_qty: number | null
          created_at: string
          id: string
          parent_id: string
          ratio: number
          updated_at: string
        }
        Insert: {
          child_id: string
          conversion_qty?: number | null
          created_at?: string
          id?: string
          parent_id: string
          ratio: number
          updated_at?: string
        }
        Update: {
          child_id?: string
          conversion_qty?: number | null
          created_at?: string
          id?: string
          parent_id?: string
          ratio?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_bundles_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bundles_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bundles_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bundles_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_bundles_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bundles_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bundles_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bundles_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_costs: {
        Row: {
          cost_price: number
          product_id: string
          updated_at: string
        }
        Insert: {
          cost_price?: number
          product_id: string
          updated_at?: string
        }
        Update: {
          cost_price?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          note: string | null
          product_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          note?: string | null
          product_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          note?: string | null
          product_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          note: string | null
          product_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          note?: string | null
          product_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_notes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_notes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_notes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_notes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_shops: {
        Row: {
          active: boolean
          barcode: string | null
          created_at: string
          price: number | null
          product_id: string
          stock: number | null
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          created_at?: string
          price?: number | null
          product_id: string
          stock?: number | null
          store_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          barcode?: string | null
          created_at?: string
          price?: number | null
          product_id?: string
          stock?: number | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_shops_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_shops_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_shops_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_shops_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_shops_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_unit_links: {
        Row: {
          base_id: string
          created_at: string
          created_by: string | null
          disabled_at: string | null
          disabled_by: string | null
          enabled: boolean
          id: string
          ratio: number
          updated_at: string
          wrapper_id: string
        }
        Insert: {
          base_id: string
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          enabled?: boolean
          id?: string
          ratio: number
          updated_at?: string
          wrapper_id: string
        }
        Update: {
          base_id?: string
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          enabled?: boolean
          id?: string
          ratio?: number
          updated_at?: string
          wrapper_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_unit_links_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_unit_links_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_unit_links_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_unit_links_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_unit_links_wrapper_id_fkey"
            columns: ["wrapper_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_unit_links_wrapper_id_fkey"
            columns: ["wrapper_id"]
            isOneToOne: true
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_unit_links_wrapper_id_fkey"
            columns: ["wrapper_id"]
            isOneToOne: true
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_unit_links_wrapper_id_fkey"
            columns: ["wrapper_id"]
            isOneToOne: true
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_units: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          active: boolean
          archived_at: string | null
          attributes: Json
          barcode: string | null
          cost_override: number | null
          created_at: string
          id: string
          image_url: string | null
          low_stock_threshold: number | null
          name: string | null
          price: number | null
          price_override: number | null
          product_id: string
          sku: string | null
          stock: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          attributes?: Json
          barcode?: string | null
          cost_override?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          low_stock_threshold?: number | null
          name?: string | null
          price?: number | null
          price_override?: number | null
          product_id: string
          sku?: string | null
          stock?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          attributes?: Json
          barcode?: string | null
          cost_override?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          low_stock_threshold?: number | null
          name?: string | null
          price?: number | null
          price_override?: number | null
          product_id?: string
          sku?: string | null
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_view_logs: {
        Row: {
          browser: string | null
          created_at: string
          device: string | null
          first_at: string
          guest_id: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          ip: unknown
          last_at: string
          line_user_id: string | null
          path: string | null
          product_code: string | null
          product_id: string | null
          product_name: string | null
          referrer: string | null
          session_id: string
          source: string | null
          user_agent: string | null
          user_id: string | null
          view_count: number
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device?: string | null
          first_at?: string
          guest_id?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          ip?: unknown
          last_at?: string
          line_user_id?: string | null
          path?: string | null
          product_code?: string | null
          product_id?: string | null
          product_name?: string | null
          referrer?: string | null
          session_id: string
          source?: string | null
          user_agent?: string | null
          user_id?: string | null
          view_count?: number
        }
        Update: {
          browser?: string | null
          created_at?: string
          device?: string | null
          first_at?: string
          guest_id?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          ip?: unknown
          last_at?: string
          line_user_id?: string | null
          path?: string | null
          product_code?: string | null
          product_id?: string | null
          product_name?: string | null
          referrer?: string | null
          session_id?: string
          source?: string | null
          user_agent?: string | null
          user_id?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_view_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_view_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_view_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_view_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_wholesale_tiers: {
        Row: {
          created_at: string
          id: string
          min_qty: number
          product_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_qty: number
          product_id: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          min_qty?: number
          product_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_wholesale_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_wholesale_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_wholesale_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_wholesale_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          approved_at: string | null
          approved_by: string | null
          barcode: string | null
          category_id: string | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          has_variants: boolean
          id: string
          image_url: string | null
          is_watched: boolean
          low_stock_threshold: number
          name: string
          product_line: string
          standard_price: number
          status: Database["public"]["Enums"]["product_status"]
          stock: number
          storage_location: string | null
          unit: string
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          barcode?: string | null
          category_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          has_variants?: boolean
          id?: string
          image_url?: string | null
          is_watched?: boolean
          low_stock_threshold?: number
          name: string
          product_line?: string
          standard_price?: number
          status?: Database["public"]["Enums"]["product_status"]
          stock?: number
          storage_location?: string | null
          unit?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          barcode?: string | null
          category_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          has_variants?: boolean
          id?: string
          image_url?: string | null
          is_watched?: boolean
          low_stock_threshold?: number
          name?: string
          product_line?: string
          standard_price?: number
          status?: Database["public"]["Enums"]["product_status"]
          stock?: number
          storage_location?: string | null
          unit?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accepted_privacy_at: string | null
          accepted_privacy_version: string | null
          accepted_terms_at: string | null
          accepted_terms_version: string | null
          address: string | null
          cost_visible: boolean
          created_at: string
          customer_code: string | null
          email: string | null
          full_name: string | null
          id: string
          line_display_name: string | null
          line_picture_url: string | null
          line_user_id: string | null
          line_verified_at: string | null
          organization_id: string | null
          phone: string | null
          staff_active: boolean
          staff_disabled_at: string | null
          staff_disabled_by: string | null
          tax_branch: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_privacy_at?: string | null
          accepted_privacy_version?: string | null
          accepted_terms_at?: string | null
          accepted_terms_version?: string | null
          address?: string | null
          cost_visible?: boolean
          created_at?: string
          customer_code?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          line_display_name?: string | null
          line_picture_url?: string | null
          line_user_id?: string | null
          line_verified_at?: string | null
          organization_id?: string | null
          phone?: string | null
          staff_active?: boolean
          staff_disabled_at?: string | null
          staff_disabled_by?: string | null
          tax_branch?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_privacy_at?: string | null
          accepted_privacy_version?: string | null
          accepted_terms_at?: string | null
          accepted_terms_version?: string | null
          address?: string | null
          cost_visible?: boolean
          created_at?: string
          customer_code?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          line_display_name?: string | null
          line_picture_url?: string | null
          line_user_id?: string | null
          line_verified_at?: string | null
          organization_id?: string | null
          phone?: string | null
          staff_active?: boolean
          staff_disabled_at?: string | null
          staff_disabled_by?: string | null
          tax_branch?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          base_product_id: string | null
          base_ratio: number | null
          cost_price: number
          discount_amount: number
          discount_percent: number
          id: string
          line_total: number
          po_id: string
          product_id: string | null
          product_name: string
          qty: number
          received_qty: number
          snapshot_barcode: string | null
          snapshot_code: string | null
          snapshot_name: string | null
          snapshot_unit: string | null
          total: number
          unit_cost: number
          variant_id: string | null
        }
        Insert: {
          base_product_id?: string | null
          base_ratio?: number | null
          cost_price?: number
          discount_amount?: number
          discount_percent?: number
          id?: string
          line_total?: number
          po_id: string
          product_id?: string | null
          product_name: string
          qty: number
          received_qty?: number
          snapshot_barcode?: string | null
          snapshot_code?: string | null
          snapshot_name?: string | null
          snapshot_unit?: string | null
          total?: number
          unit_cost?: number
          variant_id?: string | null
        }
        Update: {
          base_product_id?: string | null
          base_ratio?: number | null
          cost_price?: number
          discount_amount?: number
          discount_percent?: number
          id?: string
          line_total?: number
          po_id?: string
          product_id?: string | null
          product_name?: string
          qty?: number
          received_qty?: number
          snapshot_barcode?: string | null
          snapshot_code?: string | null
          snapshot_name?: string | null
          snapshot_unit?: string | null
          total?: number
          unit_cost?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_base_product_id_fkey"
            columns: ["base_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_base_product_id_fkey"
            columns: ["base_product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_base_product_id_fkey"
            columns: ["base_product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_base_product_id_fkey"
            columns: ["base_product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cost_method: string
          created_at: string
          created_by: string | null
          discount_amount: number
          grand_total: number
          id: string
          note: string | null
          other_cost: number
          po_no: string
          received_at: string | null
          reference: string | null
          shipping_cost: number
          status: Database["public"]["Enums"]["po_status"]
          subtotal: number
          supplier_id: string | null
          supplier_name: string | null
          total: number
          updated_at: string
          updated_by: string | null
          vat_amount: number
          vat_enabled: boolean
          vat_included: boolean
          vat_rate: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cost_method?: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          grand_total?: number
          id?: string
          note?: string | null
          other_cost?: number
          po_no: string
          received_at?: string | null
          reference?: string | null
          shipping_cost?: number
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          supplier_id?: string | null
          supplier_name?: string | null
          total?: number
          updated_at?: string
          updated_by?: string | null
          vat_amount?: number
          vat_enabled?: boolean
          vat_included?: boolean
          vat_rate?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cost_method?: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          grand_total?: number
          id?: string
          note?: string | null
          other_cost?: number
          po_no?: string
          received_at?: string | null
          reference?: string | null
          shipping_cost?: number
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          supplier_id?: string | null
          supplier_name?: string | null
          total?: number
          updated_at?: string
          updated_by?: string | null
          vat_amount?: number
          vat_enabled?: boolean
          vat_included?: boolean
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          active: boolean
          app: string
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_error: string | null
          last_seen_at: string
          p256dh: string
          store_id: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          app?: string
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_error?: string | null
          last_seen_at?: string
          p256dh: string
          store_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          app?: string
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_error?: string | null
          last_seen_at?: string
          p256dh?: string
          store_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pwa_app_profiles: {
        Row: {
          app: string
          apple_icon_url: string | null
          created_at: string
          description: string | null
          icon_192_url: string | null
          icon_512_url: string | null
          name: string | null
          short_name: string | null
          theme_color: string | null
          updated_at: string
        }
        Insert: {
          app: string
          apple_icon_url?: string | null
          created_at?: string
          description?: string | null
          icon_192_url?: string | null
          icon_512_url?: string | null
          name?: string | null
          short_name?: string | null
          theme_color?: string | null
          updated_at?: string
        }
        Update: {
          app?: string
          apple_icon_url?: string | null
          created_at?: string
          description?: string | null
          icon_192_url?: string | null
          icon_512_url?: string | null
          name?: string | null
          short_name?: string | null
          theme_color?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rds_activity_logs: {
        Row: {
          action: string
          created_at: string
          detail: Json | null
          id: string
          store_id: string | null
          target_id: string | null
          target_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json | null
          id?: string
          store_id?: string | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json | null
          id?: string
          store_id?: string | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rds_activity_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rds_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rds_categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rds_customers: {
        Row: {
          address: string | null
          branch_name: string | null
          created_at: string
          email: string | null
          id: string
          line_user_id: string | null
          name: string
          org_id: string | null
          phone: string | null
          store_id: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          line_user_id?: string | null
          name: string
          org_id?: string | null
          phone?: string | null
          store_id: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          line_user_id?: string | null
          name?: string
          org_id?: string | null
          phone?: string | null
          store_id?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rds_customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rds_customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rds_document_items: {
        Row: {
          created_at: string
          description: string | null
          discount_amount: number
          discount_percent: number
          document_id: string
          id: string
          item_order: number
          line_total: number
          name: string
          price: number
          product_id: string | null
          quantity: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_amount?: number
          discount_percent?: number
          document_id: string
          id?: string
          item_order?: number
          line_total?: number
          name: string
          price?: number
          product_id?: string | null
          quantity?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_amount?: number
          discount_percent?: number
          document_id?: string
          id?: string
          item_order?: number
          line_total?: number
          name?: string
          price?: number
          product_id?: string | null
          quantity?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rds_document_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "rds_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rds_document_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "rds_products"
            referencedColumns: ["id"]
          },
        ]
      }
      rds_document_layouts: {
        Row: {
          accent_color: string | null
          base_template: string
          created_at: string
          doc_type: string | null
          footer_text: string | null
          header_text: string | null
          id: string
          is_default: boolean
          logo_align: string
          logo_scale: number
          margins: Json
          name: string
          page_gap_mm: number
          show_document_date: boolean
          show_document_no: boolean
          show_logo: boolean
          show_store_address: boolean
          show_tax_id: boolean
          store_id: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          base_template?: string
          created_at?: string
          doc_type?: string | null
          footer_text?: string | null
          header_text?: string | null
          id?: string
          is_default?: boolean
          logo_align?: string
          logo_scale?: number
          margins?: Json
          name: string
          page_gap_mm?: number
          show_document_date?: boolean
          show_document_no?: boolean
          show_logo?: boolean
          show_store_address?: boolean
          show_tax_id?: boolean
          store_id: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          base_template?: string
          created_at?: string
          doc_type?: string | null
          footer_text?: string | null
          header_text?: string | null
          id?: string
          is_default?: boolean
          logo_align?: string
          logo_scale?: number
          margins?: Json
          name?: string
          page_gap_mm?: number
          show_document_date?: boolean
          show_document_no?: boolean
          show_logo?: boolean
          show_store_address?: boolean
          show_tax_id?: boolean
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rds_document_layouts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rds_document_revisions: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          document_id: string
          id: string
          note: string | null
          revision_no: number
          snapshot: Json
          store_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          document_id: string
          id?: string
          note?: string | null
          revision_no?: number
          snapshot?: Json
          store_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          document_id?: string
          id?: string
          note?: string | null
          revision_no?: number
          snapshot?: Json
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rds_document_revisions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "rds_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rds_document_revisions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rds_document_settings: {
        Row: {
          created_at: string
          document_type: string
          id: string
          is_active: boolean
          next_number: number
          paper_size: string
          prefix: string
          running_format: string
          store_id: string
          template_name: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_type: string
          id?: string
          is_active?: boolean
          next_number?: number
          paper_size?: string
          prefix: string
          running_format?: string
          store_id: string
          template_name?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_type?: string
          id?: string
          is_active?: boolean
          next_number?: number
          paper_size?: string
          prefix?: string
          running_format?: string
          store_id?: string
          template_name?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rds_document_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rds_document_templates: {
        Row: {
          created_at: string
          footer_text: string | null
          header_text: string | null
          id: string
          store_id: string
          template_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          footer_text?: string | null
          header_text?: string | null
          id?: string
          store_id: string
          template_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          footer_text?: string | null
          header_text?: string | null
          id?: string
          store_id?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rds_document_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rds_documents: {
        Row: {
          amount_before_vat: number
          approved_at: string | null
          approved_by: string | null
          assigned_to: string | null
          auto_fit_a4: boolean
          cancelled_at: string | null
          consent_snapshot: Json | null
          created_at: string
          created_by: string | null
          created_source: string
          customer_address: string | null
          customer_branch: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_tax_id: string | null
          deleted_at: string | null
          discount_amount: number
          discount_percent: number
          discount_total: number
          document_date: string
          document_no: string
          document_type: string
          drive_folder_id: string | null
          drive_folder_url: string | null
          drive_last_error_at: string | null
          drive_last_error_code: string | null
          drive_next_retry_at: string | null
          drive_retry_count: number
          font_scale: number | null
          google_drive_file_id: string | null
          google_drive_sync_status: string | null
          google_drive_synced_at: string | null
          google_drive_url: string | null
          google_sheet_sync_status: string | null
          google_sheet_synced_at: string | null
          grand_total: number
          id: string
          idempotency_key: string | null
          internal_sale_type: string
          last_printed_at: string | null
          last_sync_error: string | null
          layout_id: string | null
          net_total: number
          notes: string | null
          paper_size: string
          payment_method: string | null
          payment_status: string
          pdf_url: string | null
          price_type: string
          print_mode: string
          print_scale: number | null
          print_status: string
          project_name: string | null
          related_document_no: string | null
          show_document_date: boolean
          show_footer_document_date: boolean
          show_payment_date: boolean
          show_payment_method: boolean
          source_document_id: string | null
          source_document_no: string | null
          status: string
          status_workflow: string
          store_id: string
          subtotal: number
          template: string
          updated_at: string
          vat_amount: number
          vat_mode: string
          vat_rate: number
          withholding_tax_amount: number
          withholding_tax_enabled: boolean
          withholding_tax_rate: number
        }
        Insert: {
          amount_before_vat?: number
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          auto_fit_a4?: boolean
          cancelled_at?: string | null
          consent_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          created_source?: string
          customer_address?: string | null
          customer_branch?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_tax_id?: string | null
          deleted_at?: string | null
          discount_amount?: number
          discount_percent?: number
          discount_total?: number
          document_date?: string
          document_no: string
          document_type: string
          drive_folder_id?: string | null
          drive_folder_url?: string | null
          drive_last_error_at?: string | null
          drive_last_error_code?: string | null
          drive_next_retry_at?: string | null
          drive_retry_count?: number
          font_scale?: number | null
          google_drive_file_id?: string | null
          google_drive_sync_status?: string | null
          google_drive_synced_at?: string | null
          google_drive_url?: string | null
          google_sheet_sync_status?: string | null
          google_sheet_synced_at?: string | null
          grand_total?: number
          id?: string
          idempotency_key?: string | null
          internal_sale_type?: string
          last_printed_at?: string | null
          last_sync_error?: string | null
          layout_id?: string | null
          net_total?: number
          notes?: string | null
          paper_size?: string
          payment_method?: string | null
          payment_status?: string
          pdf_url?: string | null
          price_type?: string
          print_mode?: string
          print_scale?: number | null
          print_status?: string
          project_name?: string | null
          related_document_no?: string | null
          show_document_date?: boolean
          show_footer_document_date?: boolean
          show_payment_date?: boolean
          show_payment_method?: boolean
          source_document_id?: string | null
          source_document_no?: string | null
          status?: string
          status_workflow?: string
          store_id: string
          subtotal?: number
          template?: string
          updated_at?: string
          vat_amount?: number
          vat_mode?: string
          vat_rate?: number
          withholding_tax_amount?: number
          withholding_tax_enabled?: boolean
          withholding_tax_rate?: number
        }
        Update: {
          amount_before_vat?: number
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          auto_fit_a4?: boolean
          cancelled_at?: string | null
          consent_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          created_source?: string
          customer_address?: string | null
          customer_branch?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_tax_id?: string | null
          deleted_at?: string | null
          discount_amount?: number
          discount_percent?: number
          discount_total?: number
          document_date?: string
          document_no?: string
          document_type?: string
          drive_folder_id?: string | null
          drive_folder_url?: string | null
          drive_last_error_at?: string | null
          drive_last_error_code?: string | null
          drive_next_retry_at?: string | null
          drive_retry_count?: number
          font_scale?: number | null
          google_drive_file_id?: string | null
          google_drive_sync_status?: string | null
          google_drive_synced_at?: string | null
          google_drive_url?: string | null
          google_sheet_sync_status?: string | null
          google_sheet_synced_at?: string | null
          grand_total?: number
          id?: string
          idempotency_key?: string | null
          internal_sale_type?: string
          last_printed_at?: string | null
          last_sync_error?: string | null
          layout_id?: string | null
          net_total?: number
          notes?: string | null
          paper_size?: string
          payment_method?: string | null
          payment_status?: string
          pdf_url?: string | null
          price_type?: string
          print_mode?: string
          print_scale?: number | null
          print_status?: string
          project_name?: string | null
          related_document_no?: string | null
          show_document_date?: boolean
          show_footer_document_date?: boolean
          show_payment_date?: boolean
          show_payment_method?: boolean
          source_document_id?: string | null
          source_document_no?: string | null
          status?: string
          status_workflow?: string
          store_id?: string
          subtotal?: number
          template?: string
          updated_at?: string
          vat_amount?: number
          vat_mode?: string
          vat_rate?: number
          withholding_tax_amount?: number
          withholding_tax_enabled?: boolean
          withholding_tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "rds_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "rds_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rds_documents_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "rds_document_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rds_documents_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "rds_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rds_documents_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rds_drafts: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rds_payment_methods: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rds_payment_methods_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rds_payments: {
        Row: {
          amount: number
          created_at: string
          document_id: string
          id: string
          note: string | null
          paid_at: string
          payment_method: string
          store_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          document_id: string
          id?: string
          note?: string | null
          paid_at?: string
          payment_method: string
          store_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          document_id?: string
          id?: string
          note?: string | null
          paid_at?: string
          payment_method?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rds_payments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "rds_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rds_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rds_products: {
        Row: {
          barcode: string | null
          canonical_product_id: string | null
          category_id: string | null
          cost: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          sku: string | null
          stock_qty: number | null
          store_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          canonical_product_id?: string | null
          category_id?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price?: number
          sku?: string | null
          stock_qty?: number | null
          store_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          canonical_product_id?: string | null
          category_id?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          sku?: string | null
          stock_qty?: number | null
          store_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rds_products_canonical_product_id_fkey"
            columns: ["canonical_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rds_products_canonical_product_id_fkey"
            columns: ["canonical_product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rds_products_canonical_product_id_fkey"
            columns: ["canonical_product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rds_products_canonical_product_id_fkey"
            columns: ["canonical_product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "rds_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "rds_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rds_products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rds_stores: {
        Row: {
          address: string | null
          attach_bankbook_url: string | null
          attach_biz_reg_url: string | null
          attach_id_copy_url: string | null
          brand_color: string | null
          created_at: string
          default_vat_rate: number
          doc_theme: Json
          drive_folder_map: Json
          drive_orders_folder_id: string | null
          drive_quotes_folder_id: string | null
          drive_receipts_folder_id: string | null
          drive_root_folder_id: string | null
          footer_text: string | null
          google_drive_folder_id: string | null
          google_sheet_id: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          sheet_tab_map: Json
          signature_url: string | null
          slug: string
          stamp_url: string | null
          tax_id: string | null
          updated_at: string
          vat_enabled: boolean
        }
        Insert: {
          address?: string | null
          attach_bankbook_url?: string | null
          attach_biz_reg_url?: string | null
          attach_id_copy_url?: string | null
          brand_color?: string | null
          created_at?: string
          default_vat_rate?: number
          doc_theme?: Json
          drive_folder_map?: Json
          drive_orders_folder_id?: string | null
          drive_quotes_folder_id?: string | null
          drive_receipts_folder_id?: string | null
          drive_root_folder_id?: string | null
          footer_text?: string | null
          google_drive_folder_id?: string | null
          google_sheet_id?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          sheet_tab_map?: Json
          signature_url?: string | null
          slug: string
          stamp_url?: string | null
          tax_id?: string | null
          updated_at?: string
          vat_enabled?: boolean
        }
        Update: {
          address?: string | null
          attach_bankbook_url?: string | null
          attach_biz_reg_url?: string | null
          attach_id_copy_url?: string | null
          brand_color?: string | null
          created_at?: string
          default_vat_rate?: number
          doc_theme?: Json
          drive_folder_map?: Json
          drive_orders_folder_id?: string | null
          drive_quotes_folder_id?: string | null
          drive_receipts_folder_id?: string | null
          drive_root_folder_id?: string | null
          footer_text?: string | null
          google_drive_folder_id?: string | null
          google_sheet_id?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          sheet_tab_map?: Json
          signature_url?: string | null
          slug?: string
          stamp_url?: string | null
          tax_id?: string | null
          updated_at?: string
          vat_enabled?: boolean
        }
        Relationships: []
      }
      rds_tax_rates: {
        Row: {
          created_at: string
          id: string
          label: string
          rate: number
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          rate: number
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          rate?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rds_tax_rates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rds_units: {
        Row: {
          created_at: string
          id: string
          name: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rds_units_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      reply_templates: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          quick_reply: boolean
          shortcut: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
          variables: Json
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          quick_reply?: boolean
          shortcut?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          quick_reply?: boolean
          shortcut?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Relationships: []
      }
      school_requisition_logs: {
        Row: {
          action: string
          changes: Json
          created_at: string
          id: string
          requisition_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json
          created_at?: string
          id?: string
          requisition_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json
          created_at?: string
          id?: string
          requisition_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_requisition_logs_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "school_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      school_requisitions: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          attachments: Json | null
          converted_at: string | null
          converted_po_id: string | null
          created_at: string
          customer_id: string | null
          delivery_note_file: Json | null
          delivery_note_sent_at: string | null
          delivery_note_sent_by: string | null
          desk_stage: string | null
          doc_date: string
          id: string
          items: Json
          line_user_id: string | null
          note: string | null
          prepared_by: string
          priced_at: string | null
          priced_by: string | null
          project_name: string
          quote_file: Json | null
          quote_sent_at: string | null
          quote_sent_by: string | null
          receive_method: string | null
          req_number: string | null
          school_name: string
          source_files: Json
          status: string
          submitted_at: string | null
          total: number
          updated_at: string
          user_id: string
          want_date: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          attachments?: Json | null
          converted_at?: string | null
          converted_po_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivery_note_file?: Json | null
          delivery_note_sent_at?: string | null
          delivery_note_sent_by?: string | null
          desk_stage?: string | null
          doc_date?: string
          id?: string
          items?: Json
          line_user_id?: string | null
          note?: string | null
          prepared_by?: string
          priced_at?: string | null
          priced_by?: string | null
          project_name?: string
          quote_file?: Json | null
          quote_sent_at?: string | null
          quote_sent_by?: string | null
          receive_method?: string | null
          req_number?: string | null
          school_name?: string
          source_files?: Json
          status?: string
          submitted_at?: string | null
          total?: number
          updated_at?: string
          user_id?: string
          want_date?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          attachments?: Json | null
          converted_at?: string | null
          converted_po_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivery_note_file?: Json | null
          delivery_note_sent_at?: string | null
          delivery_note_sent_by?: string | null
          desk_stage?: string | null
          doc_date?: string
          id?: string
          items?: Json
          line_user_id?: string | null
          note?: string | null
          prepared_by?: string
          priced_at?: string | null
          priced_by?: string | null
          project_name?: string
          quote_file?: Json | null
          quote_sent_at?: string | null
          quote_sent_by?: string | null
          receive_method?: string | null
          req_number?: string | null
          school_name?: string
          source_files?: Json
          status?: string
          submitted_at?: string | null
          total?: number
          updated_at?: string
          user_id?: string
          want_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_requisitions_converted_po_id_fkey"
            columns: ["converted_po_id"]
            isOneToOne: false
            referencedRelation: "customer_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_log: {
        Row: {
          actor_user_id: string | null
          created_at: string
          detail: Json
          event_type: string
          id: string
          ip: string | null
          severity: string
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          event_type: string
          id?: string
          ip?: string | null
          severity?: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          event_type?: string
          id?: string
          ip?: string | null
          severity?: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          address: string | null
          delivery_prefix: string
          drive_root_folder_id: string | null
          email: string | null
          id: number
          line_add_friend_url: string | null
          line_binding_policy: string
          line_url: string | null
          logo_url: string | null
          notify_signup_inapp: boolean
          notify_signup_line: boolean
          order_prefix: string
          phone: string | null
          po_prefix: string
          quote_prefix: string
          receipt_footer: string | null
          receipt_header: string | null
          receipt_line_template: string | null
          receipt_reply_template: string | null
          store_name: string
          tax_id: string | null
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          address?: string | null
          delivery_prefix?: string
          drive_root_folder_id?: string | null
          email?: string | null
          id?: number
          line_add_friend_url?: string | null
          line_binding_policy?: string
          line_url?: string | null
          logo_url?: string | null
          notify_signup_inapp?: boolean
          notify_signup_line?: boolean
          order_prefix?: string
          phone?: string | null
          po_prefix?: string
          quote_prefix?: string
          receipt_footer?: string | null
          receipt_header?: string | null
          receipt_line_template?: string | null
          receipt_reply_template?: string | null
          store_name?: string
          tax_id?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          address?: string | null
          delivery_prefix?: string
          drive_root_folder_id?: string | null
          email?: string | null
          id?: number
          line_add_friend_url?: string | null
          line_binding_policy?: string
          line_url?: string | null
          logo_url?: string | null
          notify_signup_inapp?: boolean
          notify_signup_line?: boolean
          order_prefix?: string
          phone?: string | null
          po_prefix?: string
          quote_prefix?: string
          receipt_footer?: string | null
          receipt_header?: string | null
          receipt_line_template?: string | null
          receipt_reply_template?: string | null
          store_name?: string
          tax_id?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      shop_feature_columns: {
        Row: {
          auto_source: string
          created_at: string
          icon_name: string
          id: string
          is_active: boolean
          key: string
          link_url: string | null
          sort_order: number
          subtitle: string | null
          title: string
          tone: string
          updated_at: string
        }
        Insert: {
          auto_source?: string
          created_at?: string
          icon_name?: string
          id?: string
          is_active?: boolean
          key: string
          link_url?: string | null
          sort_order?: number
          subtitle?: string | null
          title: string
          tone?: string
          updated_at?: string
        }
        Update: {
          auto_source?: string
          created_at?: string
          icon_name?: string
          id?: string
          is_active?: boolean
          key?: string
          link_url?: string | null
          sort_order?: number
          subtitle?: string | null
          title?: string
          tone?: string
          updated_at?: string
        }
        Relationships: []
      }
      shop_feature_items: {
        Row: {
          badge_text: string | null
          column_id: string
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          link_url: string | null
          price_text: string | null
          sort_order: number
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          badge_text?: string | null
          column_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          price_text?: string | null
          sort_order?: number
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          badge_text?: string | null
          column_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          price_text?: string | null
          sort_order?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_feature_items_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "shop_feature_columns"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_promos: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          link_url: string | null
          sort: number
          starts_at: string | null
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          sort?: number
          starts_at?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          sort?: number
          starts_at?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shop_service_shortcuts: {
        Row: {
          created_at: string
          icon_name: string | null
          icon_url: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          target_type: string
          target_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon_name?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          target_type?: string
          target_value?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon_name?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          target_type?: string
          target_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      shop_theme_settings: {
        Row: {
          accent_hsl: string
          font_scale: number
          gradient_strength: number
          icon_columns: number
          icon_size: string
          id: number
          primary_hsl: string
          sections: Json
          shop_line_id: string | null
          shop_logo_url: string | null
          shop_name: string | null
          updated_at: string
        }
        Insert: {
          accent_hsl?: string
          font_scale?: number
          gradient_strength?: number
          icon_columns?: number
          icon_size?: string
          id?: number
          primary_hsl?: string
          sections?: Json
          shop_line_id?: string | null
          shop_logo_url?: string | null
          shop_name?: string | null
          updated_at?: string
        }
        Update: {
          accent_hsl?: string
          font_scale?: number
          gradient_strength?: number
          icon_columns?: number
          icon_size?: string
          id?: number
          primary_hsl?: string
          sections?: Json
          shop_line_id?: string | null
          shop_logo_url?: string | null
          shop_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          config: Json
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      site_settings_internal: {
        Row: {
          config: Json
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          id: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      staff_line_bindings: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          display_name: string | null
          id: string
          line_user_id: string
          note: string | null
          picture_url: string | null
          requested_role: Database["public"]["Enums"]["app_role"] | null
          revoked_at: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          line_user_id: string
          note?: string | null
          picture_url?: string | null
          requested_role?: Database["public"]["Enums"]["app_role"] | null
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          line_user_id?: string
          note?: string | null
          picture_url?: string | null
          requested_role?: Database["public"]["Enums"]["app_role"] | null
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      staff_permissions: {
        Row: {
          can_history: boolean
          can_po: boolean
          can_pos: boolean
          can_stock: boolean
          created_at: string
          id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          can_history?: boolean
          can_po?: boolean
          can_pos?: boolean
          can_stock?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          can_history?: boolean
          can_po?: boolean
          can_pos?: boolean
          can_stock?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      staff_stores: {
        Row: {
          created_at: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          after_qty: number | null
          before_qty: number | null
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string | null
          move_type: Database["public"]["Enums"]["stock_move_type"]
          note: string | null
          product_id: string
          qty: number
          reason: Database["public"]["Enums"]["stock_reason"]
          ref_id: string | null
          ref_type: string | null
          reference: string | null
          variant_id: string | null
        }
        Insert: {
          after_qty?: number | null
          before_qty?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          move_type: Database["public"]["Enums"]["stock_move_type"]
          note?: string | null
          product_id: string
          qty: number
          reason?: Database["public"]["Enums"]["stock_reason"]
          ref_id?: string | null
          ref_type?: string | null
          reference?: string | null
          variant_id?: string | null
        }
        Update: {
          after_qty?: number | null
          before_qty?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          move_type?: Database["public"]["Enums"]["stock_move_type"]
          note?: string | null
          product_id?: string
          qty?: number
          reason?: Database["public"]["Enums"]["stock_reason"]
          ref_id?: string | null
          ref_type?: string | null
          reference?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_sync_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: string
          integration_id: string
          last_error: string | null
          last_synced_at: string | null
          mapping_id: string | null
          next_retry_at: string
          product_id: string
          status: string
          target_stock: number
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          integration_id: string
          last_error?: string | null
          last_synced_at?: string | null
          mapping_id?: string | null
          next_retry_at?: string
          product_id: string
          status?: string
          target_stock?: number
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          integration_id?: string
          last_error?: string | null
          last_synced_at?: string | null
          mapping_id?: string | null
          next_retry_at?: string
          product_id?: string
          status?: string
          target_stock?: number
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_sync_outbox_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "myshop_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sync_outbox_mapping_id_fkey"
            columns: ["mapping_id"]
            isOneToOne: false
            referencedRelation: "myshop_product_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sync_outbox_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sync_outbox_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sync_outbox_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sync_outbox_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
      stock_sync_worker_runs: {
        Row: {
          error: string | null
          failed: number
          finished_at: string | null
          id: string
          processed: number
          skipped: number
          started_at: string
          succeeded: number
        }
        Insert: {
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          processed?: number
          skipped?: number
          started_at?: string
          succeeded?: number
        }
        Update: {
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          processed?: number
          skipped?: number
          started_at?: string
          succeeded?: number
        }
        Relationships: []
      }
      store_invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          max_uses: number
          role: Database["public"]["Enums"]["app_role"]
          store_id: string
          use_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          max_uses?: number
          role?: Database["public"]["Enums"]["app_role"]
          store_id: string
          use_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          max_uses?: number
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_invite_codes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          archived_at: string | null
          branch: string | null
          code: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          note: string | null
          org_id: string | null
          phone: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          branch?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          org_id?: string | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          branch?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          org_id?: string | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tutorial_video_views: {
        Row: {
          created_at: string
          id: string
          path: string | null
          session_id: string
          step_key: string
          video_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          path?: string | null
          session_id: string
          step_key?: string
          video_key: string
        }
        Update: {
          created_at?: string
          id?: string
          path?: string | null
          session_id?: string
          step_key?: string
          video_key?: string
        }
        Relationships: []
      }
      user_coupons: {
        Row: {
          coupon_id: string
          created_at: string
          id: string
          order_id: string | null
          updated_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          id?: string
          order_id?: string | null
          updated_at?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          id?: string
          order_id?: string | null
          updated_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_coupons_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_coupons_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      product_shops_view: {
        Row: {
          active: boolean | null
          barcode: string | null
          price: number | null
          product_id: string | null
          stock: number | null
          store_id: string | null
          store_name: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_shops_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_shops_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_shops_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_shops_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_shops_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "rds_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products_public: {
        Row: {
          active: boolean | null
          barcode: string | null
          category_id: string | null
          code: string | null
          created_at: string | null
          description: string | null
          id: string | null
          image_url: string | null
          low_stock_threshold: number | null
          name: string | null
          standard_price: number | null
          status: Database["public"]["Enums"]["product_status"] | null
          stock: number | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          barcode?: string | null
          category_id?: string | null
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          low_stock_threshold?: number | null
          name?: string | null
          standard_price?: number | null
          status?: Database["public"]["Enums"]["product_status"] | null
          stock?: number | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          barcode?: string | null
          category_id?: string | null
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          low_stock_threshold?: number | null
          name?: string | null
          standard_price?: number | null
          status?: Database["public"]["Enums"]["product_status"] | null
          stock?: number | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_theme_settings_public: {
        Row: {
          accent_hsl: string | null
          font_scale: number | null
          gradient_strength: number | null
          icon_columns: number | null
          icon_size: string | null
          id: number | null
          primary_hsl: string | null
          sections: Json | null
          shop_logo_url: string | null
          shop_name: string | null
          updated_at: string | null
        }
        Insert: {
          accent_hsl?: string | null
          font_scale?: number | null
          gradient_strength?: number | null
          icon_columns?: number | null
          icon_size?: string | null
          id?: number | null
          primary_hsl?: string | null
          sections?: Json | null
          shop_logo_url?: string | null
          shop_name?: string | null
          updated_at?: string | null
        }
        Update: {
          accent_hsl?: string | null
          font_scale?: number | null
          gradient_strength?: number | null
          icon_columns?: number | null
          icon_size?: string | null
          id?: number | null
          primary_hsl?: string | null
          sections?: Json | null
          shop_logo_url?: string | null
          shop_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      site_settings_public: {
        Row: {
          config: Json | null
          id: number | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          id?: number | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          id?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      v_pos_catalog: {
        Row: {
          active: boolean | null
          barcode: string | null
          category_id: string | null
          category_name: string | null
          code: string | null
          has_variants: boolean | null
          id: string | null
          image_url: string | null
          low_stock_threshold: number | null
          name: string | null
          standard_price: number | null
          status: Database["public"]["Enums"]["product_status"] | null
          stock: number | null
          unit: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      v_product_effective_stock: {
        Row: {
          base_id: string | null
          base_remainder: number | null
          effective_stock: number | null
          own_stock: number | null
          product_id: string | null
          ratio: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_unit_links_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_unit_links_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_unit_links_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "v_pos_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_unit_links_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "v_product_effective_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
      v_unified_customers: {
        Row: {
          address: string | null
          created_at: string | null
          email: string | null
          line_display_name: string | null
          line_user_id: string | null
          name: string | null
          phone: string | null
          source: string | null
          source_id: string | null
          store_id: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _po_recalc_totals: { Args: { p_po_id: string }; Returns: undefined }
      _po_transition: {
        Args: {
          p_from: Database["public"]["Enums"]["po_status"][]
          p_note: string
          p_po_id: string
          p_to: Database["public"]["Enums"]["po_status"]
        }
        Returns: undefined
      }
      admin_backfill_customer_tax_ids: {
        Args: never
        Returns: {
          film_invoices_filled: number
          guest_orders_filled: number
          orders_filled: number
        }[]
      }
      admin_bind_line_customer: {
        Args: {
          p_customer_id: string
          p_force?: boolean
          p_line_user_id: string
        }
        Returns: Json
      }
      admin_cancel_order: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      admin_convert_excel_intake: {
        Args: { p_id: string; p_target: string }
        Returns: Json
      }
      admin_create_line_customer: {
        Args: {
          p_force?: boolean
          p_line_user_id: string
          p_name: string
          p_phone?: string
        }
        Returns: Json
      }
      admin_create_org: {
        Args: { p_name: string; p_price_group_id?: string }
        Returns: string
      }
      admin_customer_view_history: {
        Args: {
          p_limit?: number
          p_line_user_id?: string
          p_phone?: string
          p_user_id?: string
        }
        Returns: {
          device: string
          first_at: string
          id: string
          last_at: string
          product_code: string
          product_id: string
          product_name: string
          source: string
          view_count: number
        }[]
      }
      admin_decide_org_join: {
        Args: { p_approve: boolean; p_org_id: string; p_reason?: string }
        Returns: undefined
      }
      admin_delete_orphan_profile: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      admin_email_status: {
        Args: { p_emails: string[] }
        Returns: {
          created_at: string
          error_message: string
          recipient_email: string
          status: string
          template_name: string
        }[]
      }
      admin_get_price_matrix: {
        Args: {
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: {
          category_id: string
          code: string
          cost_price: number
          customer_price_count: number
          group_prices: Json
          id: string
          name: string
          standard_price: number
          stock: number
          unit: string
        }[]
      }
      admin_line_channel_queue_flags: {
        Args: {
          p_channel_id: string
          p_enabled: boolean
          p_require_admin?: boolean
        }
        Returns: undefined
      }
      admin_line_channel_set_hub: {
        Args: { p_channel_id: string; p_hub: boolean }
        Returns: undefined
      }
      admin_line_channel_toggle: {
        Args: { p_active: boolean; p_channel_id: string }
        Returns: undefined
      }
      admin_line_delivery_log: {
        Args: { p_limit?: number; p_type?: string }
        Returns: {
          attempts: number
          channel_id: string
          channel_type: string
          created_at: string
          error_code: string
          id: string
          kind: string
          notification_id: string
          order_id: string
          room_name: string
          sender_store_id: string
          status: string
          store_id: string
          title: string
        }[]
      }
      admin_line_group_notify_status: { Args: never; Returns: Json }
      admin_line_order_delivery_log: {
        Args: { p_order_id: string }
        Returns: {
          attempts: number
          channel_id: string
          channel_type: string
          created_at: string
          error_code: string
          id: string
          kind: string
          notification_id: string
          notification_kind: string
          notification_title: string
          room_name: string
          sender_store_id: string
          status: string
          store_id: string
        }[]
      }
      admin_line_route_exclusive: {
        Args: { p_channel_id: string }
        Returns: undefined
      }
      admin_line_routing_status: {
        Args: never
        Returns: {
          channel_ids: string[]
          channel_type: string
          destinations: string[]
          room_names: string[]
          source: string
          store_id: string
        }[]
      }
      admin_link_request_update_status: {
        Args: {
          p_error?: string
          p_id: string
          p_note?: string
          p_status: string
        }
        Returns: undefined
      }
      admin_list_orphan_profiles: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string
        }[]
      }
      admin_list_product_views: {
        Args: {
          p_from?: string
          p_identified?: string
          p_limit?: number
          p_offset?: number
          p_q?: string
          p_to?: string
        }
        Returns: {
          browser: string
          device: string
          first_at: string
          full_name: string
          guest_name: string
          guest_phone: string
          id: string
          ip: unknown
          last_at: string
          line_user_id: string
          path: string
          product_code: string
          product_id: string
          product_name: string
          referrer: string
          session_id: string
          source: string
          user_id: string
          view_count: number
        }[]
      }
      admin_list_staff: {
        Args: never
        Returns: {
          cost_visible: boolean
          created_at: string
          email: string
          full_name: string
          role: string
          staff_active: boolean
          user_id: string
        }[]
      }
      admin_org_reset_drive_folder: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      admin_product_usage: { Args: { p_id: string }; Returns: Json }
      admin_product_view_stats: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      admin_purge_line_credentials: {
        Args: { _ids?: string[] }
        Returns: number
      }
      admin_repair_user_org: {
        Args: {
          p_existing_org_id: string
          p_new_org_name: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      admin_restore_order: { Args: { p_id: string }; Returns: undefined }
      admin_restore_products: { Args: { p_ids: string[] }; Returns: number }
      admin_review_image: {
        Args: {
          p_approve: boolean
          p_image_id: string
          p_set_primary?: boolean
        }
        Returns: undefined
      }
      admin_review_product: {
        Args: { p_approve: boolean; p_note?: string; p_product_id: string }
        Returns: undefined
      }
      admin_set_cost: {
        Args: { p_cost: number; p_product_id: string }
        Returns: undefined
      }
      admin_set_cost_visible: {
        Args: { p_user_id: string; p_visible: boolean }
        Returns: undefined
      }
      admin_set_customer_price: {
        Args: { p_org_id: string; p_price: number; p_product_id: string }
        Returns: undefined
      }
      admin_set_group_price: {
        Args: { p_group_id: string; p_price: number; p_product_id: string }
        Returns: undefined
      }
      admin_set_line_store_profile: {
        Args: {
          p_basic_id?: string
          p_display_name?: string
          p_id: string
          p_is_active?: boolean
        }
        Returns: undefined
      }
      admin_set_order_status: {
        Args: { p_note?: string; p_order_id: string; p_status: string }
        Returns: undefined
      }
      admin_set_org_price_group: {
        Args: { p_org_id: string; p_price_group_id: string }
        Returns: undefined
      }
      admin_set_org_type: {
        Args: { p_org_id: string; p_type: string }
        Returns: undefined
      }
      admin_set_product_shops: {
        Args: { p_product_id: string; p_store_ids: string[] }
        Returns: undefined
      }
      admin_set_role_by_email: {
        Args: { p_email: string; p_role: string }
        Returns: Json
      }
      admin_set_staff_active: {
        Args: { p_active: boolean; p_user_id: string }
        Returns: undefined
      }
      admin_set_user_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      admin_soft_delete_org: { Args: { p_id: string }; Returns: undefined }
      admin_soft_delete_products: { Args: { p_ids: string[] }; Returns: number }
      admin_unbind_line_customer: {
        Args: { p_line_user_id: string; p_reason?: string }
        Returns: Json
      }
      assert_my_consent_current: { Args: never; Returns: undefined }
      bind_line_user_by_token: {
        Args: { p_line_user_id: string; p_token: string }
        Returns: {
          order_id: string
          order_no: string
        }[]
      }
      can_approve: { Args: { _uid: string }; Returns: boolean }
      can_edit_product: { Args: { _uid: string }; Returns: boolean }
      can_see_cost: { Args: { _uid: string }; Returns: boolean }
      check_line_binding_by_phone: {
        Args: { p_phone: string }
        Returns: boolean
      }
      cleanup_old_product_views: { Args: never; Returns: number }
      confirm_link_request: {
        Args: { p_id: string; p_slug: string }
        Returns: undefined
      }
      consume_line_link_code: {
        Args: {
          p_code: string
          p_display_name?: string
          p_line_user_id: string
        }
        Returns: string
      }
      cpo_customer_respond: {
        Args: { p_action: string; p_note?: string; p_token: string }
        Returns: Json
      }
      cpo_get_by_token: { Args: { p_token: string }; Returns: Json }
      cpo_review_link: { Args: { p_id: string }; Returns: string }
      customer_get_document_for_download: {
        Args: { p_doc_id: string }
        Returns: Json
      }
      customer_linked_store_ids: {
        Args: { _uid: string }
        Returns: {
          store_id: string
        }[]
      }
      customer_owns_customer_row: {
        Args: { _customer_id: string }
        Returns: boolean
      }
      customer_owns_document: { Args: { _doc_id: string }; Returns: boolean }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      disable_product_variants: { Args: { _product_id: string }; Returns: Json }
      document_command_finalize: {
        Args: { p_draft_id: string }
        Returns: {
          already: boolean
          doc_no: string
        }[]
      }
      document_command_finalize_bot: {
        Args: {
          p_actor_label?: string
          p_channel_id: string
          p_draft_id: string
          p_line_user_id: string
        }
        Returns: {
          already: boolean
          doc_no: string
        }[]
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enable_product_variants: {
        Args: { _allocations: Json; _product_id: string }
        Returns: Json
      }
      enqueue_app_notification: {
        Args: {
          p_body: string
          p_dedup_key: string
          p_for_staff: boolean
          p_link: string
          p_ref_id: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      excel_items_to_po: { Args: { p_items: Json }; Returns: Json }
      excel_items_to_requisition: { Args: { p_items: Json }; Returns: Json }
      film_cancel_document: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      film_close_order_from_inbox: {
        Args: { p_method?: string; p_note?: string; p_order_id: string }
        Returns: Json
      }
      film_confirm_order: { Args: { p_order_id: string }; Returns: Json }
      film_merge_customers: {
        Args: { p_source: string; p_target: string }
        Returns: Json
      }
      film_next_doc_no: {
        Args: { p_document_type: string; p_store_id: string }
        Returns: string
      }
      film_next_internal_job_no: { Args: never; Returns: string }
      film_next_job_order_number: { Args: never; Returns: string }
      film_next_order_number: { Args: never; Returns: string }
      film_next_outsource_no: { Args: never; Returns: string }
      film_next_queue_code: { Args: { p_dept: string }; Returns: string }
      film_next_receipt_number: { Args: never; Returns: string }
      film_priority_score: {
        Args: {
          p_blocked?: boolean
          p_created: string
          p_due: string
          p_urgent: boolean
        }
        Returns: Record<string, unknown>
      }
      film_purge_test_data: {
        Args: never
        Returns: {
          orders_deleted: number
          sessions_deleted: number
        }[]
      }
      film_queue_intake_confirm: { Args: { p_payload: Json }; Returns: Json }
      film_queue_issue_receipt: {
        Args: { p_order_id: string; p_payload?: Json }
        Returns: Json
      }
      film_raise_ops_notification: {
        Args: {
          p_assignee?: string
          p_body: string
          p_cooldown_minutes?: number
          p_dedup_key?: string
          p_dept?: string
          p_group_no?: number
          p_job_id?: string
          p_kind: string
          p_order_id?: string
          p_severity: string
          p_store_id?: string
          p_title: string
        }
        Returns: string
      }
      film_restore_documents: { Args: { p_ids: string[] }; Returns: number }
      film_restore_from_sheets: {
        Args: {
          p_document_no: string
          p_header: Json
          p_items: Json
          p_store_id: string
        }
        Returns: string
      }
      film_soft_delete_documents: { Args: { p_ids: string[] }; Returns: number }
      find_profile_by_phone_for_login: {
        Args: { p_phone: string }
        Returns: {
          email: string
          id: string
          line_display_name: string
          line_user_id: string
        }[]
      }
      generate_my_line_link_code: { Args: never; Returns: string }
      generate_org_slug: { Args: { p_name: string }; Returns: string }
      generate_school_token: { Args: never; Returns: string }
      get_current_consent_versions: {
        Args: never
        Returns: {
          privacy: string
          terms: string
        }[]
      }
      get_guest_order_detail: {
        Args: { p_guest_id: string; p_order_id: string; p_phone: string }
        Returns: Json
      }
      get_guest_order_receipt: {
        Args: { _order_id: string; _phone: string }
        Returns: Json
      }
      get_guest_orders: {
        Args: { p_guest_id: string; p_phone: string }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          created_at: string
          customer_branch: string | null
          customer_id: string | null
          customer_snapshot: Json | null
          customer_tax_id: string | null
          customer_view_token: string | null
          customer_view_token_revoked_at: string | null
          customer_view_visibility: Json | null
          deleted_at: string | null
          delivery_note_file: Json | null
          delivery_note_sent_at: string | null
          delivery_note_sent_by: string | null
          discount: number
          doc_intent: string
          drive_folder_id: string | null
          drive_folder_url: string | null
          drive_last_error: string | null
          drive_store_slug: string | null
          drive_synced_at: string | null
          external_order_no: string | null
          guest_id: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          idempotency_key: string | null
          is_guest: boolean
          line_link_token: string | null
          line_user_id: string | null
          note: string | null
          notes_to_customer: string | null
          order_no: string
          organization_id: string | null
          paid_at: string | null
          priced_at: string | null
          priced_by: string | null
          project_name: string | null
          quote_file: Json | null
          quote_sent_at: string | null
          quote_sent_by: string | null
          receipt_issued_at: string | null
          receipt_no: string | null
          reply_draft: string | null
          school_name: string | null
          shipping_fee: number
          shop_id: string | null
          source: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_prices: {
        Args: { p_product_ids: string[] }
        Returns: {
          price: number
          product_id: string
          source: string
        }[]
      }
      get_nw_work_order_public: { Args: { _id: string }; Returns: Json }
      get_order_activity_log: {
        Args: { _order_id: string }
        Returns: {
          action: string
          created_at: string
          detail: Json
          id: string
          user_email: string
          user_id: string
        }[]
      }
      get_order_by_customer_token: { Args: { _token: string }; Returns: Json }
      get_order_status_events: {
        Args: { p_link_token?: string; p_order_id: string }
        Returns: {
          created_at: string
          id: string
          note: string
          status: string
        }[]
      }
      get_order_visibility_effective: {
        Args: { _kind: string; _order_id: string }
        Returns: Json
      }
      get_prices_by_org: {
        Args: { p_org_id: string; p_product_ids: string[] }
        Returns: {
          price: number
          product_id: string
          source: string
        }[]
      }
      get_prices_by_token: {
        Args: { p_product_ids: string[]; p_token: string }
        Returns: {
          price: number
          product_id: string
          source: string
        }[]
      }
      get_public_liff_config: {
        Args: never
        Returns: {
          liff_endpoint_url: string
          liff_id: string
          liff_scopes: string[]
        }[]
      }
      get_public_settings: {
        Args: never
        Returns: {
          address: string
          line_add_friend_url: string
          line_url: string
          logo_url: string
          phone: string
          receipt_footer: string
          receipt_header: string
          receipt_line_template: string
          receipt_reply_template: string
          store_name: string
          tax_id: string
        }[]
      }
      guest_approve_order: {
        Args: { p_guest_id: string; p_order_id: string; p_phone: string }
        Returns: undefined
      }
      has_accepted_staff_invite:
        | {
            Args: {
              _actor_id: string
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_staff_perm: {
        Args: { _module: string; _user_id: string }
        Returns: boolean
      }
      is_admin_email: { Args: { _email: string }; Returns: boolean }
      is_allowed_staff_notification_type: {
        Args: { _type: string }
        Returns: boolean
      }
      is_plain_safe_text: { Args: { _t: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_staff_any: { Args: { _uid: string }; Returns: boolean }
      is_staff_of_store: {
        Args: { _store_id: string; _uid: string }
        Returns: boolean
      }
      is_staff_role: { Args: { _uid: string }; Returns: boolean }
      issue_order_receipt: { Args: { _order_id: string }; Returns: string }
      line_lookup_staff_binding: {
        Args: { _line_uid: string }
        Returns: {
          display_name: string
          has_staff_role: boolean
          id: string
          picture_url: string
          status: string
          user_id: string
        }[]
      }
      line_oauth_consume_handoff: {
        Args: { p_handoff: string }
        Returns: {
          handoff_payload: Json
          id: string
          next_path: string
          trace_id: string
        }[]
      }
      line_oauth_consume_state: {
        Args: { p_state: string }
        Returns: {
          code_verifier: string
          id: string
          link_user_id: string
          next_path: string
          nonce: string
          redirect_uri: string
          trace_id: string
        }[]
      }
      line_queue_command_allowed: {
        Args: { _channel_id: string; _line_user_id: string }
        Returns: Json
      }
      link_shared_catalog: { Args: never; Returns: Json }
      list_line_stores: {
        Args: never
        Returns: {
          display_name: string
          has_secret: boolean
          has_token: boolean
          id: string
          is_active: boolean
          line_basic_id: string
          line_channel_id: string
          updated_at: string
        }[]
      }
      log_line_link_event: {
        Args: { p_detail?: Json; p_event: string }
        Returns: string
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notification_read: { Args: { p_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      myshop_apply_order_stock: {
        Args: { p_direction: string; p_order_number: string }
        Returns: Json
      }
      myshop_get_secret: { Args: { p_name: string }; Returns: string }
      myshop_invisible_products: {
        Args: { p_limit?: number }
        Returns: {
          code: string
          last_error: string
          last_stock_synced_at: string
          mapping_id: string
          myshop_inventory_id: string
          myshop_product_id: string
          name: string
          product_id: string
          reason: string
          stock: number
          sync_status: string
        }[]
      }
      myshop_set_secret: {
        Args: { p_name: string; p_value: string }
        Returns: undefined
      }
      myshop_stock_claim: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          channel_id: string
          id: string
          integration_id: string
          mapping_id: string
          myshop_product_id: string
          myshop_variant_id: string
          product_id: string
          target_stock: number
          variant_id: string
        }[]
      }
      myshop_stock_complete: {
        Args: { p_error?: string; p_id: string; p_status: string }
        Returns: undefined
      }
      myshop_stock_enqueue_all: { Args: never; Returns: number }
      myshop_stock_enqueue_recent: {
        Args: { p_hours?: number }
        Returns: number
      }
      myshop_stock_problems: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          channel_id: string
          id: string
          last_error: string
          myshop_product_id: string
          myshop_variant_id: string
          product_code: string
          product_name: string
          status: string
          target_stock: number
          updated_at: string
        }[]
      }
      myshop_stock_retry_failed: { Args: never; Returns: number }
      myshop_stock_sync_status: { Args: never; Returns: Json }
      myshop_unmapped_products: {
        Args: { p_limit?: number }
        Returns: {
          barcode: string
          code: string
          name: string
          product_id: string
          status: string
          stock: number
          updated_at: string
        }[]
      }
      next_customer_po_number: { Args: never; Returns: string }
      next_fy_code: { Args: never; Returns: string }
      next_guest_order_no: { Args: never; Returns: string }
      next_requisition_number: { Args: never; Returns: string }
      normalize_phone: { Args: { p_phone: string }; Returns: string }
      notification_manual_rate_ok: {
        Args: { p_max?: number; p_user_id: string; p_window_seconds?: number }
        Returns: boolean
      }
      notification_outbox_claim: {
        Args: { p_lease_seconds?: number; p_limit?: number }
        Returns: {
          attempts: number
          binding_id: string | null
          channel: string
          claimed_at: string | null
          client_request_id: string | null
          created_at: string
          created_by: string | null
          deduplicated: boolean
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          lease_expires_at: string | null
          next_retry_at: string
          payload: Json
          provider_message_id: string | null
          recipient: string | null
          ref_id: string | null
          ref_type: string
          sent_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      notification_outbox_complete: {
        Args: {
          p_deduplicated?: boolean
          p_error?: string
          p_id: string
          p_ok: boolean
          p_permanent?: boolean
          p_provider_message_id?: string
          p_skipped?: boolean
        }
        Returns: undefined
      }
      notification_outbox_enqueue: {
        Args: {
          p_binding_id?: string
          p_channel?: string
          p_client_request_id?: string
          p_created_by?: string
          p_event_type: string
          p_idempotency_key: string
          p_payload: Json
          p_recipient: string
          p_ref_id: string
          p_ref_type: string
        }
        Returns: string
      }
      notify_staff: {
        Args: {
          p_body: string
          p_ref_id: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      notify_staff_alert: {
        Args: {
          p_body?: string
          p_dedupe_minutes?: number
          p_link?: string
          p_ref_id?: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      order_customer_user_id: {
        Args: { p_order: Database["public"]["Tables"]["orders"]["Row"] }
        Returns: string
      }
      order_has_line_user: { Args: { p_order_id: string }; Returns: boolean }
      org_by_slug: {
        Args: { p_slug: string }
        Returns: {
          approved: boolean
          id: string
          name: string
          type: string
        }[]
      }
      owner_approve_staff_line: {
        Args: {
          p_binding: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      owner_list_staff_permissions: {
        Args: never
        Returns: {
          can_history: boolean
          can_po: boolean
          can_pos: boolean
          can_stock: boolean
          user_id: string
        }[]
      }
      owner_revoke_staff_line: {
        Args: { p_binding: string }
        Returns: undefined
      }
      owner_set_staff_permissions: {
        Args: {
          _can_history: boolean
          _can_po: boolean
          _can_pos: boolean
          _can_stock: boolean
          _user_id: string
        }
        Returns: undefined
      }
      peek_next_fy_code: { Args: never; Returns: string }
      pos_adjust_stock: {
        Args: {
          p_idempotency_key?: string
          p_mode: string
          p_note?: string
          p_product_id: string
          p_qty: number
          p_reason?: string
          p_reference?: string
          p_variant_id: string
        }
        Returns: string
      }
      pos_cancel_receipt: {
        Args: { p_reason: string; p_receipt_id: string }
        Returns: Json
      }
      pos_cancel_receipt_core: {
        Args: { p_reason: string; p_receipt_id: string }
        Returns: Json
      }
      pos_cancel_sale: {
        Args: { p_reason: string; p_receipt_id: string }
        Returns: Json
      }
      pos_checkout: {
        Args: {
          p_branch?: string
          p_cash_received?: number
          p_customer_id?: string
          p_customer_name?: string
          p_discount?: number
          p_idempotency_key: string
          p_items: Json
          p_line_user_id?: string
          p_notes?: string
          p_payment_status?: string
          p_payment_type?: string
        }
        Returns: Json
      }
      pos_po_approve: { Args: { p_po_id: string }; Returns: undefined }
      pos_po_cancel: {
        Args: { p_note?: string; p_po_id: string }
        Returns: undefined
      }
      pos_po_create_and_receive: {
        Args: { p: Json; p_idempotency_key?: string }
        Returns: Json
      }
      pos_po_receive: {
        Args: {
          p_idempotency_key?: string
          p_lines: Json
          p_note?: string
          p_po_id: string
        }
        Returns: string
      }
      pos_po_submit_approval: { Args: { p_po_id: string }; Returns: undefined }
      pos_po_upsert: { Args: { p: Json }; Returns: string }
      pos_supplier_archive: { Args: { p_id: string }; Returns: undefined }
      pos_supplier_upsert: { Args: { p: Json }; Returns: string }
      preview_store_invite_code: {
        Args: { _code: string }
        Returns: {
          out_expires_at: string
          out_role: Database["public"]["Enums"]["app_role"]
          out_store_id: string
          out_store_name: string
          out_uses_left: number
        }[]
      }
      profile_staff_fields_unchanged: {
        Args: {
          _active: boolean
          _disabled_at: string
          _disabled_by: string
          _id: string
        }
        Returns: boolean
      }
      rds_apply_document_stock: {
        Args: { p_document_id: string }
        Returns: Json
      }
      rds_assert_quotation_source: {
        Args: {
          p_document_type: string
          p_source_id: string
          p_store_id: string
        }
        Returns: {
          amount_before_vat: number
          approved_at: string | null
          approved_by: string | null
          assigned_to: string | null
          auto_fit_a4: boolean
          cancelled_at: string | null
          consent_snapshot: Json | null
          created_at: string
          created_by: string | null
          created_source: string
          customer_address: string | null
          customer_branch: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_tax_id: string | null
          deleted_at: string | null
          discount_amount: number
          discount_percent: number
          discount_total: number
          document_date: string
          document_no: string
          document_type: string
          drive_folder_id: string | null
          drive_folder_url: string | null
          drive_last_error_at: string | null
          drive_last_error_code: string | null
          drive_next_retry_at: string | null
          drive_retry_count: number
          font_scale: number | null
          google_drive_file_id: string | null
          google_drive_sync_status: string | null
          google_drive_synced_at: string | null
          google_drive_url: string | null
          google_sheet_sync_status: string | null
          google_sheet_synced_at: string | null
          grand_total: number
          id: string
          idempotency_key: string | null
          internal_sale_type: string
          last_printed_at: string | null
          last_sync_error: string | null
          layout_id: string | null
          net_total: number
          notes: string | null
          paper_size: string
          payment_method: string | null
          payment_status: string
          pdf_url: string | null
          price_type: string
          print_mode: string
          print_scale: number | null
          print_status: string
          project_name: string | null
          related_document_no: string | null
          show_document_date: boolean
          show_footer_document_date: boolean
          show_payment_date: boolean
          show_payment_method: boolean
          source_document_id: string | null
          source_document_no: string | null
          status: string
          status_workflow: string
          store_id: string
          subtotal: number
          template: string
          updated_at: string
          vat_amount: number
          vat_mode: string
          vat_rate: number
          withholding_tax_amount: number
          withholding_tax_enabled: boolean
          withholding_tax_rate: number
        }
        SetofOptions: {
          from: "*"
          to: "rds_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rds_cancel_document: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      rds_create_doc_from_bot_draft:
        | {
            Args: {
              p_actor: string
              p_document_type: string
              p_draft_id: string
              p_related_doc_no?: string
              p_store_id: string
            }
            Returns: {
              doc_no: string
              document_id: string
            }[]
          }
        | {
            Args: {
              p_actor: string
              p_document_type: string
              p_draft_id: string
              p_related_doc_no?: string
              p_source_document_id?: string
              p_store_id: string
            }
            Returns: {
              doc_no: string
              document_id: string
            }[]
          }
      rds_create_next_doc_from_quotation: {
        Args: {
          p_actor?: string
          p_created_source?: string
          p_document_type: string
          p_source_id: string
          p_store_id?: string
        }
        Returns: {
          doc_no: string
          document_id: string
        }[]
      }
      rds_duplicate_document: { Args: { p_id: string }; Returns: string }
      rds_merge_customers: {
        Args: { p_source: string; p_target: string }
        Returns: Json
      }
      rds_next_doc_no: {
        Args: { p_document_type: string; p_store_id: string }
        Returns: string
      }
      rds_next_doc_no_internal: {
        Args: { p_document_type: string; p_store_id: string }
        Returns: string
      }
      rds_restore_documents: { Args: { p_ids: string[] }; Returns: number }
      rds_restore_from_sheets: {
        Args: {
          p_document_no: string
          p_header: Json
          p_items: Json
          p_store_id: string
        }
        Returns: string
      }
      rds_soft_delete_documents: { Args: { p_ids: string[] }; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      realtime_topic_allowed: {
        Args: { _topic: string; _uid: string }
        Returns: boolean
      }
      redeem_store_invite_code: {
        Args: { _code: string }
        Returns: {
          out_role: Database["public"]["Enums"]["app_role"]
          out_store_id: string
        }[]
      }
      regenerate_order_customer_token: {
        Args: { _kind: string; _order_id: string }
        Returns: string
      }
      resolve_org_slug: {
        Args: { p_slug: string }
        Returns: {
          approved: boolean
          id: string
          name: string
          price_group_id: string
        }[]
      }
      resolve_school_token: {
        Args: { p_token: string }
        Returns: {
          id: string
          name: string
          price_group_id: string
          slug: string
        }[]
      }
      revoke_order_customer_token: {
        Args: { _kind: string; _order_id: string }
        Returns: undefined
      }
      save_order_reply_draft: {
        Args: { _draft: string; _order_id: string }
        Returns: undefined
      }
      search_org_links: {
        Args: { q: string }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
      search_organizations: {
        Args: { q: string }
        Returns: {
          approved: boolean
          id: string
          name: string
          type: string
        }[]
      }
      set_product_unit_link: {
        Args: { _base_id: string; _ratio: number; _wrapper_id: string }
        Returns: {
          base_id: string
          created_at: string
          created_by: string | null
          disabled_at: string | null
          disabled_by: string | null
          enabled: boolean
          id: string
          ratio: number
          updated_at: string
          wrapper_id: string
        }
        SetofOptions: {
          from: "*"
          to: "product_unit_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_variant_cost: {
        Args: { p_cost: number; p_variant_id: string }
        Returns: undefined
      }
      signup_register_or_join_org: {
        Args: {
          p_address: string
          p_contact_name: string
          p_email: string
          p_existing_org_id: string
          p_line_id: string
          p_org_name: string
          p_phone: string
          p_type: string
        }
        Returns: string
      }
      staff_adjust_stock: {
        Args: {
          p_move_type: string
          p_note?: string
          p_product_id: string
          p_qty: number
          p_reason: string
        }
        Returns: string
      }
      staff_is_active: { Args: { _user_id: string }; Returns: boolean }
      staff_owns_storage_store: {
        Args: { _name: string; _uid: string }
        Returns: boolean
      }
      staff_request_role_change: {
        Args: {
          p_note?: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
      staff_shop_line_id: { Args: never; Returns: string }
      staff_submit_product_image: {
        Args: {
          p_note?: string
          p_product_id: string
          p_storage_path: string
          p_url: string
        }
        Returns: string
      }
      stock_reconciliation_report: {
        Args: { p_limit?: number }
        Returns: {
          code: string
          current_stock: number
          has_variants: boolean
          implied_opening: number
          movement_net: number
          name: string
          negative: boolean
          parent_mismatch: boolean
          product_id: string
          variant_sum: number
        }[]
      }
      stock_sync_enqueue: {
        Args: { p_product_id: string; p_variant_id?: string }
        Returns: number
      }
      storage_store_folder: { Args: { _name: string }; Returns: string }
      submit_guest_order_atomic: {
        Args: {
          p_idempotency_key: string
          p_items: Json
          p_line_user_id: string
          p_order: Json
        }
        Returns: {
          deduplicated: boolean
          line_link_token: string
          order_id: string
          order_no: string
        }[]
      }
      submit_link_request: {
        Args: { p_contact_name: string; p_phone: string; p_school_name: string }
        Returns: string
      }
      submit_link_request_v2: {
        Args: { p_contact_name: string; p_phone: string; p_school_name: string }
        Returns: Json
      }
      unlink_my_line: { Args: never; Returns: undefined }
      unset_product_unit_link: {
        Args: { _wrapper_id: string }
        Returns: undefined
      }
      upsert_unified_customer: {
        Args: {
          p_address?: string
          p_email?: string
          p_existing_id?: string
          p_line_user_id?: string
          p_name: string
          p_phone?: string
          p_source: string
          p_store_id?: string
          p_tax_branch?: string
          p_tax_id?: string
        }
        Returns: {
          source: string
          source_id: string
        }[]
      }
      variant_costs: {
        Args: { p_product_id: string }
        Returns: {
          cost_override: number
          id: string
        }[]
      }
      void_order_receipt: { Args: { _order_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "owner" | "admin" | "stock_staff" | "photo_staff" | "customer"
      customer_type: "school" | "office" | "general"
      doc_type: "quotation" | "purchase_order" | "delivery_note"
      order_status:
        | "pending_quote"
        | "quoted"
        | "approved"
        | "picking"
        | "ready"
        | "completed"
        | "cancelled"
      po_status:
        | "draft"
        | "ordered"
        | "received"
        | "pending_approval"
        | "approved_waiting_receipt"
        | "cancelled"
      product_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "published"
        | "unpublished"
        | "low_stock"
        | "out_of_stock"
      stock_move_type: "in" | "out" | "adjust"
      stock_reason:
        | "receive_in"
        | "sell_out"
        | "issue_use"
        | "damaged"
        | "recount"
        | "other"
        | "sell_out_linked"
        | "restock_linked"
        | "cancel_restock"
        | "cancel_restock_linked"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "stock_staff", "photo_staff", "customer"],
      customer_type: ["school", "office", "general"],
      doc_type: ["quotation", "purchase_order", "delivery_note"],
      order_status: [
        "pending_quote",
        "quoted",
        "approved",
        "picking",
        "ready",
        "completed",
        "cancelled",
      ],
      po_status: [
        "draft",
        "ordered",
        "received",
        "pending_approval",
        "approved_waiting_receipt",
        "cancelled",
      ],
      product_status: [
        "draft",
        "pending_review",
        "approved",
        "published",
        "unpublished",
        "low_stock",
        "out_of_stock",
      ],
      stock_move_type: ["in", "out", "adjust"],
      stock_reason: [
        "receive_in",
        "sell_out",
        "issue_use",
        "damaged",
        "recount",
        "other",
        "sell_out_linked",
        "restock_linked",
        "cancel_restock",
        "cancel_restock_linked",
      ],
    },
  },
} as const
