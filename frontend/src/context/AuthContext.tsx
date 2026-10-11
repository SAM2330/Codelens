import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session, AuthError } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "../services/supabase";
import { setAuthToken } from "../services/api";

interface SignUpResult {
    error: AuthError | null;
    needsConfirmation?: boolean;
    email?: string;
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    isConfigured: boolean;
    error: string | null;
    signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
    signUp: (email: string, password: string) => Promise<SignUpResult>;
    resendConfirmationEmail: (email: string) => Promise<{ error: AuthError | null }>;
    signOut: () => Promise<void>;
    clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        if (!isSupabaseConfigured) {
            setIsLoading(false);
            return;
        }

        // 1. Initial session restoration
        supabase.auth.getSession().then(({ data: { session: initialSession }, error: sessionError }) => {
            if (!mounted) return;
            if (sessionError) {
                console.error("Session restoration error:", sessionError);
            }
            setSession(initialSession);
            setUser(initialSession?.user ?? null);
            setAuthToken(initialSession?.access_token ?? null);
            setIsLoading(false);
        }).catch((err) => {
            if (!mounted) return;
            console.error("Failed to restore session:", err);
            setIsLoading(false);
        });

        // 2. Listen to auth state transitions
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, newSession) => {
                if (!mounted) return;
                setSession(newSession);
                setUser(newSession?.user ?? null);
                setAuthToken(newSession?.access_token ?? null);
                setIsLoading(false);
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const signIn = async (email: string, password: string) => {
        setError(null);
        if (!isSupabaseConfigured) {
            const err = {
                name: "ConfigurationError",
                message: "Supabase authentication is not configured yet. Set VITE_SUPABASE_ANON_KEY in frontend/.env to enable login."
            } as AuthError;
            setError(err.message);
            return { error: err };
        }

        const res = await supabase.auth.signInWithPassword({ email, password });
        if (res.error) {
            setError(res.error.message);
            return { error: res.error };
        }

        setSession(res.data.session);
        setUser(res.data.user);
        setAuthToken(res.data.session?.access_token ?? null);
        return { error: null };
    };

    const signUp = async (email: string, password: string): Promise<SignUpResult> => {
        setError(null);
        if (!isSupabaseConfigured) {
            const err = {
                name: "ConfigurationError",
                message: "Supabase authentication is not configured yet. Set VITE_SUPABASE_ANON_KEY in frontend/.env to enable registration."
            } as AuthError;
            setError(err.message);
            return { error: err, needsConfirmation: false };
        }

        const res = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`
            }
        });

        if (res.error) {
            setError(res.error.message);
            return { error: res.error, needsConfirmation: false };
        }

        // When email confirmation is enabled in Supabase, an unconfirmed user is created without a session
        if (!res.data.session) {
            setSession(null);
            setUser(null);
            setAuthToken(null);
            return { error: null, needsConfirmation: true, email };
        }

        // When email confirmation is disabled, session is returned immediately
        setSession(res.data.session);
        setUser(res.data.user);
        setAuthToken(res.data.session.access_token);
        return { error: null, needsConfirmation: false, email };
    };

    const resendConfirmationEmail = async (email: string): Promise<{ error: AuthError | null }> => {
        setError(null);
        if (!isSupabaseConfigured) {
            return { error: null };
        }

        const res = await supabase.auth.resend({
            type: "signup",
            email,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`
            }
        });

        if (res.error) {
            setError(res.error.message);
            return { error: res.error };
        }

        return { error: null };
    };

    const signOut = async () => {
        setError(null);
        if (isSupabaseConfigured) {
            try {
                await supabase.auth.signOut();
            } catch (err) {
                console.warn("Supabase signOut error:", err);
            }
        }

        // Immediately clean up any session/local storage chat messages
        try {
            Object.keys(sessionStorage).forEach((key) => {
                if (key.startsWith("codelens_chat_")) {
                    sessionStorage.removeItem(key);
                }
            });
            Object.keys(localStorage).forEach((key) => {
                if (key.startsWith("codelens_chat_")) {
                    localStorage.removeItem(key);
                }
            });
        } catch {}

        setSession(null);
        setUser(null);
        setAuthToken(null);
    };

    const clearError = () => setError(null);

    return (
        <AuthContext.Provider
            value={{
                user,
                session,
                isLoading,
                isConfigured: isSupabaseConfigured,
                error,
                signIn,
                signUp,
                resendConfirmationEmail,
                signOut,
                clearError
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
