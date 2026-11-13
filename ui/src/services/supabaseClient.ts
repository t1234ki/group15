import type { SupabaseClient } from '@supabase/supabase-js';

type LaundryTable = {
    Row: Record<string, unknown>;
    Insert: Record<string, unknown>;
    Update: Record<string, unknown>;
    Relationships: [];
};

type LaundrySchema = {
    Tables: Record<string, LaundryTable>;
    Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
};

type LaundryDatabase = { laundry: LaundrySchema };
type LaundryClient = SupabaseClient<LaundryDatabase, 'laundry'>;

const supabaseUrl = typeof __SUPABASE_URL__ === 'undefined' ? '' : __SUPABASE_URL__;
const supabasePublishableKey =
    typeof __SUPABASE_PUBLISHABLE_KEY__ === 'undefined' ? '' : __SUPABASE_PUBLISHABLE_KEY__;

const hasHttpUrl = (value: string) => {
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
        return false;
    }
};

export const isSupabaseConfigured =
    hasHttpUrl(supabaseUrl) && supabasePublishableKey.trim().length > 0;

let clientPromise: Promise<LaundryClient> | null = null;

export const getSupabaseClient = async (): Promise<LaundryClient> => {
    if (!isSupabaseConfigured) {
        throw new Error('Supabase is not configured for this environment.');
    }

    clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
        createClient<LaundryDatabase, 'laundry'>(supabaseUrl, supabasePublishableKey, {
            db: { schema: 'laundry' },
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
                flowType: 'pkce',
            },
        })
    );

    return clientPromise;
};
