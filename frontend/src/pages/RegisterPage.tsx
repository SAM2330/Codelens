import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
    UserPlus,
    Key,
    Mail,
    AlertCircle,
    ArrowRight,
    Terminal,
    CheckCircle2,
    MailCheck,
    RefreshCw
} from "lucide-react";

export const RegisterPage: React.FC = () => {
    const { signUp, resendConfirmationEmail, isConfigured, error: authError, clearError } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    // Confirmation email states
    const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
    const [confirmedEmail, setConfirmedEmail] = useState("");
    const [resendStatus, setResendStatus] = useState<string | null>(null);
    const [isResending, setIsResending] = useState(false);

    // Direct registration success (if email confirmation is turned off in Supabase)
    const [registeredSuccess, setRegisteredSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);
        clearError();

        if (!email.trim() || !password) {
            setLocalError("Please fill in all required fields.");
            return;
        }

        if (password.length < 6) {
            setLocalError("Password must be at least 6 characters long.");
            return;
        }

        if (password !== confirmPassword) {
            setLocalError("Passwords do not match.");
            return;
        }

        setIsLoading(true);
        try {
            const result = await signUp(email.trim(), password);
            if (result.error) {
                setLocalError(result.error.message);
            } else if (result.needsConfirmation) {
                setConfirmedEmail(email.trim());
                setAwaitingConfirmation(true);
            } else {
                setRegisteredSuccess(true);
                setTimeout(() => {
                    navigate("/repositories", { replace: true });
                }, 1500);
            }
        } catch (err: any) {
            setLocalError(err.message || "An unexpected error occurred during registration.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleResend = async () => {
        if (!confirmedEmail || isResending) return;
        setIsResending(true);
        setResendStatus(null);
        try {
            const { error } = await resendConfirmationEmail(confirmedEmail);
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
                maxWidth: "460px",
                backgroundColor: "var(--bg-card)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-medium)",
                padding: "2.5rem",
                boxShadow: "var(--shadow-lg)"
            }}>
                {awaitingConfirmation ? (
                    <div style={{ textAlign: "center" }}>
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
                            <MailCheck size={32} />
                        </div>

                        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "0.5rem" }}>
                            Check Your Email
                        </h1>

                        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.5rem" }}>
                            We have sent a verification link to <strong style={{ color: "var(--text-main)" }}>{confirmedEmail}</strong>.
                            Please open your email and click the confirmation link to activate your CodeLens account.
                        </p>

                        <div style={{
                            backgroundColor: "var(--bg-card-subtle)",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border-subtle)",
                            padding: "1rem",
                            fontSize: "0.8125rem",
                            color: "var(--text-dim)",
                            textAlign: "left",
                            marginBottom: "1.5rem"
                        }}>
                            <p style={{ margin: 0, marginBottom: "0.25rem", fontWeight: 600, color: "var(--text-muted)" }}>
                                Didn't receive the email?
                            </p>
                            <ul style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 1.4 }}>
                                <li>Check your spam or junk folder.</li>
                                <li>Make sure the email address is spelled correctly.</li>
                                <li>Click the button below to request another confirmation link.</li>
                            </ul>
                        </div>

                        {resendStatus && (
                            <div style={{
                                backgroundColor: resendStatus.startsWith("Failed") ? "var(--accent-rose-bg)" : "var(--accent-emerald-bg)",
                                border: `1px solid ${resendStatus.startsWith("Failed") ? "rgba(244, 63, 94, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
                                borderRadius: "var(--radius-md)",
                                padding: "0.75rem",
                                marginBottom: "1.25rem",
                                color: resendStatus.startsWith("Failed") ? "var(--accent-rose)" : "var(--accent-emerald)",
                                fontSize: "0.85rem",
                                textAlign: "left"
                            }}>
                                {resendStatus}
                            </div>
                        )}

                        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            <button
                                type="button"
                                onClick={handleResend}
                                disabled={isResending}
                                className="btn btn-secondary"
                                style={{ width: "100%", justifyContent: "center" }}
                            >
                                <RefreshCw size={15} className={isResending ? "spin" : ""} />
                                <span>{isResending ? "Sending..." : "Resend Confirmation Email"}</span>
                            </button>

                            <Link
                                to="/login"
                                className="btn btn-primary"
                                style={{ width: "100%", justifyContent: "center" }}
                            >
                                <span>Go to Sign In</span>
                                <ArrowRight size={16} />
                            </Link>
                        </div>
                    </div>
                ) : (
                    <>
                        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                            <div style={{
                                width: "48px",
                                height: "48px",
                                borderRadius: "12px",
                                backgroundColor: "var(--accent-emerald-bg)",
                                color: "var(--accent-emerald)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                margin: "0 auto 1rem auto"
                            }}>
                                <UserPlus size={28} />
                            </div>
                            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "0.5rem" }}>
                                Create an Account
                            </h1>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                                Start analyzing codebases with persistent sessions and shared cache
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
                                        To register with live Supabase Auth, set your public key in <code>VITE_SUPABASE_ANON_KEY</code> in <code>frontend/.env</code> from the Supabase Dashboard.
                                    </p>
                                </div>
                            </div>
                        )}

                        {registeredSuccess && (
                            <div style={{
                                backgroundColor: "var(--accent-emerald-bg)",
                                border: "1px solid rgba(16, 185, 129, 0.3)",
                                borderRadius: "var(--radius-md)",
                                padding: "1rem",
                                marginBottom: "1.5rem",
                                color: "var(--accent-emerald)",
                                fontSize: "0.875rem",
                                display: "flex",
                                gap: "0.75rem",
                                alignItems: "center"
                            }}>
                                <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
                                <span>Account created successfully! Redirecting to dashboard...</span>
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
                                        placeholder="At least 6 characters"
                                        required
                                        minLength={6}
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
                                    Confirm Password
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
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Repeat password"
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
                                disabled={isLoading || registeredSuccess}
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
                                    <span>Registering...</span>
                                ) : (
                                    <>
                                        <span>Create Account</span>
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
                            Already have an account?{" "}
                            <Link to="/login" style={{ color: "var(--accent-blue)", fontWeight: 500 }}>
                                Sign in here
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
