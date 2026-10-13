import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseAuthClient: SupabaseClient | null = null;

export interface AuthUser {
    id: string;
    email?: string;
    role?: string;
}

/**
 * Returns the initialized Supabase client for server-side operations,
 * or null if environment variables are not configured or contain placeholder values.
 */
export function getSupabaseAuthClient(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL?.trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)?.trim();

    if (!url || !key || key === "your_supabase_anon_key_here") {
        return null;
    }

    if (!supabaseAuthClient) {
        let wsTransport: any = undefined;
        if (typeof globalThis.WebSocket !== "undefined") {
            wsTransport = globalThis.WebSocket;
        } else {
            try {
                // In Node.js runtimes prior to Node 22, native WebSocket is not global.
                // Provide ws as the transport implementation for @supabase/realtime-js.
                wsTransport = require("ws");
            } catch {
                // Runtime does not have ws installed
            }
        }

        supabaseAuthClient = createClient(url, key, {
            auth: {
                persistSession: false,
                autoRefreshToken: false
            },
            ...(wsTransport ? { realtime: { transport: wsTransport } } : {})
        });
    }

    return supabaseAuthClient;
}

/**
 * Verifies a Supabase JWT access token on the backend.
 * Uses official Supabase auth.getUser(token) verification.
 * Also supports secure mock test tokens in test environment for integration tests.
 */
export async function verifySupabaseToken(token: string): Promise<AuthUser | null> {
    if (!token) {
        return null;
    }

    // 1. Integration test token parsing (used in automated integration tests)
    if (process.env.NODE_ENV === "test" && token.startsWith("test-token:")) {
        const parts = token.split(":");
        // format: test-token:<uuid>:<email>
        const id = parts[1];
        const email = parts[2] || "test@codelens.dev";
        if (id && id.length >= 8) {
            return { id, email, role: "authenticated" };
        }
        return null;
    }

    // 2. Try real Supabase auth if configured
    try {
        const client = getSupabaseAuthClient();
        if (client) {
            const { data, error } = await client.auth.getUser(token);
            if (error || !data?.user) {
                return null;
            }
            return {
                id: data.user.id,
                email: data.user.email,
                role: data.user.role
            };
        }
    } catch (err) {
        console.warn("[Auth] Token verification failed:", err instanceof Error ? err.message : err);
        return null;
    }

    return null;
}

