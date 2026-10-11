import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseAnonKey !== "your_supabase_anon_key_here" &&
    !supabaseAnonKey.includes("[YOUR-")
);

if (!isSupabaseConfigured) {
    console.warn(
        "[CodeLens Auth] Supabase anon key is not set or is using placeholder in frontend/.env. " +
        "Please provide your public anon key in VITE_SUPABASE_ANON_KEY from Supabase Dashboard (Settings -> API)."
    );
}

export const supabase: SupabaseClient = createClient(
    supabaseUrl || "https://lmjuyavkcizucuwuqdpc.supabase.co",
    supabaseAnonKey || "placeholder-anon-key",
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: window.localStorage
        }
    }
);
