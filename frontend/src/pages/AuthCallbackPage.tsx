import React, { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../services/supabase";
import { setAuthToken } from "../services/api";
import { CheckCircle2, AlertCircle, ArrowRight, Loader2 } from "lucide-react";

export const AuthCallbackPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState<string>("Verifying your email and establishing session...");

    useEffect(() => {
        let isMounted = true;

        async function handleAuthCallback() {
            if (!isSupabaseConfigured) {
                setStatus("error");
                setMessage("Supabase is not configured.");
                return;
            }

            try {
                // 1. Check for errors in URL params (e.g., expired or invalid link)
                const searchParams = new URLSearchParams(location.search);
                const hashParams = new URLSearchParams(location.hash.startsWith("#") ? location.hash.substring(1) : location.hash);

                const error = searchParams.get("error") || hashParams.get("error");
                const errorDescription = searchParams.get("error_description") || hashParams.get("error_description");

                if (error || errorDescription) {
                    if (isMounted) {
                        setStatus("error");
                        setMessage(errorDescription || error || "Failed to confirm email.");
                    }
                    return;
                }

                // 2. Handle token_hash verification (OTP / token verification flow)
                const tokenHash = searchParams.get("token_hash");
                const type = searchParams.get("type");

                if (tokenHash && type) {
                    const { data, error: otpError } = await supabase.auth.verifyOtp({
                        token_hash: tokenHash,
                        type: type as any
                    });

                    if (otpError) {
                        if (isMounted) {
                            setStatus("error");
                            setMessage(otpError.message);
                        }
                        return;
                    }

                    if (data?.session) {
                        setAuthToken(data.session.access_token);
                        if (isMounted) {
                            setStatus("success");
                            setMessage("Email confirmed successfully! Redirecting to your workspace...");
                            setTimeout(() => {
                                navigate("/repositories", { replace: true });
                            }, 1500);
                        }
                        return;
                    }
                }

                // 3. Handle code exchange (PKCE flow)
                const code = searchParams.get("code");
                if (code) {
                    const { data, error: codeError } = await supabase.auth.exchangeCodeForSession(code);
                    if (codeError) {
                        if (isMounted) {
                            setStatus("error");
                            setMessage(codeError.message);
                        }
                        return;
                    }

                    if (data?.session) {
                        setAuthToken(data.session.access_token);
                        if (isMounted) {
                            setStatus("success");
                            setMessage("Email confirmed successfully! Redirecting to your workspace...");
                            setTimeout(() => {
                                navigate("/repositories", { replace: true });
                            }, 1500);
                        }
                        return;
                    }
                }

                // 4. Fallback check for session already restored by client hash parsing
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    setAuthToken(session.access_token);
                    if (isMounted) {
                        setStatus("success");
                        setMessage("Email confirmed successfully! Redirecting to your workspace...");
                        setTimeout(() => {
                            navigate("/repositories", { replace: true });
                        }, 1500);
                    }
                    return;
                }

                // If no session found yet, wait for onAuthStateChange
                const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
                    if (newSession && isMounted) {
                        setAuthToken(newSession.access_token);
                        setStatus("success");
                        setMessage("Email confirmed successfully! Redirecting to your workspace...");
                        setTimeout(() => {
                            navigate("/repositories", { replace: true });
                        }, 1500);
                    }
                });

                // Safety timeout
                setTimeout(() => {
                    if (isMounted && status === "loading") {
                        setStatus("error");
                        setMessage("Could not establish a verified session. The confirmation link may be expired or already used.");
                    }
                    subscription.unsubscribe();
                }, 8000);
            } catch (err: any) {
                if (isMounted) {
                    setStatus("error");
                    setMessage(err?.message || "An unexpected error occurred during email verification.");
                }
            }
        }

        handleAuthCallback();

        return () => {
            isMounted = false;
        };
    }, [location, navigate]);

    return (
        <div style={{
            minHeight: "calc(100vh - 64px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem"
        }}>
            <div style={{
                width: "100%",
                maxWidth: "440px",
                backgroundColor: "var(--bg-card)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-medium)",
                padding: "2.5rem",
                boxShadow: "var(--shadow-lg)",
                textAlign: "center"
            }}>
                {status === "loading" && (
                    <div>
                        <div style={{
                            width: "56px",
                            height: "56px",
                            borderRadius: "16px",
                            backgroundColor: "var(--accent-blue-bg)",
                            color: "var(--accent-blue)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto 1.25rem auto"
                        }}>
                            <Loader2 size={32} className="spin" />
                        </div>
                        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "0.5rem" }}>
                            Confirming Email
                        </h2>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                            {message}
                        </p>
                    </div>
                )}

                {status === "success" && (
                    <div>
                        <div style={{
                            width: "56px",
                            height: "56px",
                            borderRadius: "16px",
                            backgroundColor: "var(--accent-emerald-bg)",
                            color: "var(--accent-emerald)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto 1.25rem auto"
                        }}>
                            <CheckCircle2 size={32} />
                        </div>
                        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "0.5rem" }}>
                            Email Confirmed!
                        </h2>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
                            {message}
                        </p>
                        <Link to="/repositories" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                            <span>Go to Workspace</span>
                            <ArrowRight size={16} />
                        </Link>
                    </div>
                )}

                {status === "error" && (
                    <div>
                        <div style={{
                            width: "56px",
                            height: "56px",
                            borderRadius: "16px",
                            backgroundColor: "var(--accent-rose-bg)",
                            color: "var(--accent-rose)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto 1.25rem auto"
                        }}>
                            <AlertCircle size={32} />
                        </div>
                        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "0.5rem" }}>
                            Confirmation Issue
                        </h2>
                        <p style={{ color: "var(--accent-rose)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
                            {message}
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            <Link to="/login" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                                <span>Sign In</span>
                                <ArrowRight size={16} />
                            </Link>
                            <Link to="/register" className="btn btn-secondary" style={{ width: "100%", justifyContent: "center" }}>
                                <span>Register Again</span>
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
