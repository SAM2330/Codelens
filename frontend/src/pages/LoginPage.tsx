import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
    LogIn,
    Key,
    Mail,
    AlertCircle,
    ArrowRight,
    ShieldCheck,
    Terminal,
    RefreshCw,
    MailCheck
} from "lucide-react";

export const LoginPage: React.FC = () => {
    const { signIn, resendConfirmationEmail, isConfigured, error: authError, clearError } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const [isUnconfirmed, setIsUnconfirmed] = useState(false);
    const [resendStatus, setResendStatus] = useState<string | null>(null);
    const [isResending, setIsResending] = useState(false);

    const from = (location.state as any)?.from?.pathname || "/repositories";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);
        clearError();
        setIsUnconfirmed(false);
        setResendStatus(null);

        if (!email.trim() || !password) {
            setLocalError("Please enter both email and password.");
            return;
        }

        setIsLoading(true);
        try {
            const { error } = await signIn(email.trim(), password);
            if (error) {
                const msg = error.message;
                setLocalError(msg);
                if (msg.toLowerCase().includes("email not confirmed") || msg.toLowerCase().includes("unconfirmed")) {
                    setIsUnconfirmed(true);
                }
            } else {
                navigate(from, { replace: true });
            }
        } catch (err: any) {
            setLocalError(err.message || "An unexpected error occurred during sign in.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleResend = async () => {
        if (!email.trim() || isResending) return;
        setIsResending(true);
        setResendStatus(null);
        try {
            const { error } = await resendConfirmationEmail(email.trim());
            if (error) {
                setResendStatus(`Failed to resend: ${error.message}`);
            } else {
                setResendStatus("Confirmation email resent! Please check your inbox and spam folder.");
            }
        } catch (err: any) {
            setResendStatus(`Failed to resend: ${err.message || "Unknown error"}`);
        } finally {
            setIsResending(false);
        }
    };

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
                boxShadow: "var(--shadow-lg)"
            }}>
                <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                    <div style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "12px",
                        backgroundColor: "var(--accent-blue-bg)",
                        color: "var(--accent-blue)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 1rem auto"
                    }}>
                        <ShieldCheck size={28} />
                    </div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "0.5rem" }}>
                        Sign in to CodeLens
                    </h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                        Access your repository intelligence and shared analysis
                    </p>
                </div>

                {!isConfigured && (
                    <div style={{
                        backgroundColor: "rgba(245, 158, 11, 0.12)",
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                        borderRadius: "var(--radius-md)",
                        padding: "1rem",
                        marginBottom: "1.5rem",
                        color: "#fbbf24",
                        fontSize: "0.85rem",
                        display: "flex",
                        gap: "0.75rem",
                        alignItems: "flex-start"
                    }}>
                        <Terminal size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
                        <div>
                            <strong>Supabase Key Required:</strong>
                            <p style={{ marginTop: "0.25rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                                To log in with live Supabase Auth, set your public key in <code>VITE_SUPABASE_ANON_KEY</code> in <code>frontend/.env</code> from the Supabase Dashboard.
                            </p>
                        </div>
                    </div>
                )}

                {(localError || authError) && (
                    <div style={{
                        backgroundColor: "var(--accent-rose-bg)",
                        border: "1px solid rgba(244, 63, 94, 0.3)",
                        borderRadius: "var(--radius-md)",
                        padding: "0.875rem",
                        marginBottom: "1.5rem",
                        color: "var(--accent-rose)",
                        fontSize: "0.875rem",
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center"
                    }}>
                        <AlertCircle size={18} style={{ flexShrink: 0 }} />
                        <span>{localError || authError}</span>
                    </div>
                )}

                {isUnconfirmed && (
                    <div style={{
                        backgroundColor: "var(--bg-card-subtle)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-md)",
                        padding: "1rem",
                        marginBottom: "1.5rem"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent-amber)", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                            <MailCheck size={16} />
                            <span>Email Confirmation Required</span>
                        </div>
                        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.4, margin: 0, marginBottom: "0.75rem" }}>
                            Your account is not confirmed yet. Click below to resend the confirmation email to {email || "your address"}.
                        </p>
                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={isResending}
                            className="btn btn-secondary"
                            style={{ width: "100%", justifyContent: "center", fontSize: "0.8125rem", padding: "0.45rem" }}
                        >
                            <RefreshCw size={13} className={isResending ? "spin" : ""} />
                            <span>{isResending ? "Sending..." : "Resend Confirmation Link"}</span>
                        </button>
                        {resendStatus && (
                            <p style={{ fontSize: "0.75rem", color: resendStatus.startsWith("Failed") ? "var(--accent-rose)" : "var(--accent-emerald)", marginTop: "0.5rem", margin: 0 }}>
                                {resendStatus}
                            </p>
                        )}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                    <div>
                        <label style={{
                            display: "block",
                            fontSize: "0.875rem",
                            fontWeight: 500,
                            color: "var(--text-muted)",
                            marginBottom: "0.5rem"
                        }}>
                            Email Address
                        </label>
                        <div style={{ position: "relative" }}>
                            <Mail size={16} style={{
                                position: "absolute",
                                left: "1rem",
                                top: "50%",
                                transform: "translateY(-50%)",
                                color: "var(--text-dim)"
                            }} />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Your email"
                                required
                                style={{
                                    width: "100%",
                                    padding: "0.75rem 1rem 0.75rem 2.5rem",
                                    backgroundColor: "var(--bg-input)",
                                    border: "1px solid var(--border-subtle)",
                                    borderRadius: "var(--radius-md)",
                                    color: "var(--text-main)",
                                    fontSize: "0.9375rem",
                                    outline: "none"
                                }}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{
                            display: "block",
                            fontSize: "0.875rem",
                            fontWeight: 500,
                            color: "var(--text-muted)",
                            marginBottom: "0.5rem"
                        }}>
                            Password
                        </label>
                        <div style={{ position: "relative" }}>
                            <Key size={16} style={{
                                position: "absolute",
                                left: "1rem",
                                top: "50%",
                                transform: "translateY(-50%)",
                                color: "var(--text-dim)"
                            }} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                style={{
                                    width: "100%",
                                    padding: "0.75rem 1rem 0.75rem 2.5rem",
                                    backgroundColor: "var(--bg-input)",
                                    border: "1px solid var(--border-subtle)",
                                    borderRadius: "var(--radius-md)",
                                    color: "var(--text-main)",
                                    fontSize: "0.9375rem",
                                    outline: "none"
                                }}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="btn btn-primary"
                        style={{
                            width: "100%",
                            padding: "0.875rem",
                            fontSize: "0.9375rem",
                            fontWeight: 600,
                            justifyContent: "center",
                            marginTop: "0.5rem"
                        }}
                    >
                        {isLoading ? (
                            <span>Signing In...</span>
                        ) : (
                            <>
                                <span>Sign In</span>
                                <ArrowRight size={16} />
                            </>
                        )}
                    </button>
                </form>

                <div style={{
                    marginTop: "2rem",
                    paddingTop: "1.5rem",
                    borderTop: "1px solid var(--border-subtle)",
                    textAlign: "center",
                    fontSize: "0.875rem",
                    color: "var(--text-muted)"
                }}>
                    Don't have an account?{" "}
                    <Link to="/register" style={{ color: "var(--accent-blue)", fontWeight: 500 }}>
                        Create one here
                    </Link>
                </div>
            </div>
        </div>
    );
};
