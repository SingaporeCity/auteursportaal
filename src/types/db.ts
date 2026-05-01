/**
 * Database-types voor het productie-Supabase project (`qcqjurglmrhdiuhawfee`).
 *
 * Handgeschreven op basis van `supabase/migrations/*.sql`. Wanneer het schema
 * verandert, regenereer via:
 *
 *   npx supabase gen types typescript --project-id qcqjurglmrhdiuhawfee --schema public > src/types/db.ts
 *
 * (Vereist `supabase` CLI en `supabase login`.)
 *
 * @module types/db
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type PaymentType = 'royalty' | 'subsidiary' | 'foreign' | 'jaaropgave';
export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected';
export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'paid';
export type ExpenseType = 'onkosten' | 'idc';

export interface Database {
  public: {
    Tables: {
      authors: {
        Row: {
          id: string;
          netsuite_vendor_id: string | null;
          netsuite_internal_id: number | null;
          alliant_id: string | null;
          email: string;
          first_name: string;
          last_name: string;
          initials: string | null;
          bsn: string | null;
          birth_date: string | null;
          phone: string | null;
          street: string | null;
          house_number: string | null;
          postcode: string | null;
          city: string | null;
          country: string;
          bank_account: string | null;
          bic: string | null;
          is_admin: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          activated_at: string | null;
        };
        Insert: {
          id?: string;
          netsuite_vendor_id?: string | null;
          netsuite_internal_id?: number | null;
          alliant_id?: string | null;
          email: string;
          first_name: string;
          last_name: string;
          initials?: string | null;
          bsn?: string | null;
          birth_date?: string | null;
          phone?: string | null;
          street?: string | null;
          house_number?: string | null;
          postcode?: string | null;
          city?: string | null;
          country?: string;
          bank_account?: string | null;
          bic?: string | null;
          is_admin?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          activated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['authors']['Insert']>;
        Relationships: [];
      };
      contracts: {
        Row: {
          id: string;
          author_id: string;
          contract_number: string;
          contract_name: string | null;
          royalty_percentage: number | null;
          start_date: string | null;
          end_date: string | null;
          file_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          contract_number: string;
          contract_name?: string | null;
          royalty_percentage?: number | null;
          start_date?: string | null;
          end_date?: string | null;
          file_path?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['contracts']['Insert']>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          author_id: string;
          year: number;
          type: PaymentType;
          amount: number;
          currency: string;
          title_nl: string | null;
          title_en: string | null;
          payment_date: string | null;
          file_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          year: number;
          type: PaymentType;
          amount?: number;
          currency?: string;
          title_nl?: string | null;
          title_en?: string | null;
          payment_date?: string | null;
          file_path?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['payments']['Insert']>;
        Relationships: [];
      };
      forecasts: {
        Row: {
          id: string;
          author_id: string;
          year: number;
          min_amount: number;
          max_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          year: number;
          min_amount?: number;
          max_amount?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['forecasts']['Insert']>;
        Relationships: [];
      };
      change_requests: {
        Row: {
          id: string;
          author_id: string;
          field_name: string;
          old_value: string | null;
          new_value: string | null;
          status: ChangeRequestStatus;
          requested_at: string;
          processed_at: string | null;
          processed_by: string | null;
          rejection_reason: string | null;
        };
        Insert: {
          id?: string;
          author_id: string;
          field_name: string;
          old_value?: string | null;
          new_value?: string | null;
          status?: ChangeRequestStatus;
          requested_at?: string;
          processed_at?: string | null;
          processed_by?: string | null;
          rejection_reason?: string | null;
        };
        Update: Partial<Database['public']['Tables']['change_requests']['Insert']>;
        Relationships: [];
      };
      login_history: {
        Row: {
          id: string;
          author_id: string;
          logged_in_at: string;
          ip_address: string | null;
        };
        Insert: {
          id?: string;
          author_id: string;
          logged_in_at?: string;
          ip_address?: string | null;
        };
        Update: Partial<Database['public']['Tables']['login_history']['Insert']>;
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          author_id: string;
          description: string;
          amount: number;
          currency: string;
          expense_type: ExpenseType;
          receipt_path: string | null;
          status: ExpenseStatus;
          submitted_at: string;
          processed_at: string | null;
          processed_by: string | null;
          rejection_reason: string | null;
          paid_at: string | null;
        };
        Insert: {
          id?: string;
          author_id: string;
          description: string;
          amount: number;
          currency?: string;
          expense_type?: ExpenseType;
          receipt_path?: string | null;
          status?: ExpenseStatus;
          submitted_at?: string;
          processed_at?: string | null;
          processed_by?: string | null;
          rejection_reason?: string | null;
          paid_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['expenses']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
