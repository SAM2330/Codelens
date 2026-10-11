import React, { useState } from "react";
import { Code2, Plus, Terminal, User, LogOut, LogIn, UserPlus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AnalyzeModal } from "./AnalyzeModal";
import { useAuth } from "../context/AuthContext";

export const Header: React.FC = () => {
    const [isAnalyzeOpen, setIsAnalyzeOpen] = useState(false);
    const { user, signOut } = useAuth();
    const navigate = useNavigate();

    const handleSignOut = async () => {
        await signOut();
        navigate("/login");
    };

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <Link to="/repositories" className="brand-logo">
                        <div className="brand-icon">
                            <Code2 size={18} />
                        </div>
                        <span>CodeLens</span>
                    </Link>
                    <div className="header-meta">
                        <Terminal size={14} />
                        <span>Repository Code Intelligence</span>
                    </div>
                </div>

                <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <button
                        className="btn btn-primary"
                        onClick={() => setIsAnalyzeOpen(true)}
                    >
                        <Plus size={16} />
                        <span>Analyze Repo</span>
                    </button>

                    {user ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginLeft: "0.5rem" }}>
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                padding: "0.375rem 0.75rem",
                                backgroundColor: "var(--bg-card)",
                                border: "1px solid var(--border-subtle)",
                                borderRadius: "var(--radius-md)",
                                fontSize: "0.8125rem",
                                color: "var(--text-muted)"
                            }}>
                                <User size={14} style={{ color: "var(--accent-blue)" }} />
                                <span style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {user.email}
                                </span>
                            </div>
                            <button
                                onClick={handleSignOut}
                                className="btn"
                                title="Sign Out"
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.375rem",
                                    padding: "0.375rem 0.75rem",
                                    backgroundColor: "transparent",
                                    border: "1px solid var(--border-subtle)",
                                    borderRadius: "var(--radius-md)",
                                    color: "var(--text-muted)",
                                    fontSize: "0.8125rem",
                                    cursor: "pointer"
                                }}
                            >
                                <LogOut size={14} />
                                <span>Sign Out</span>
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "0.5rem" }}>
                            <Link
                                to="/login"
                                className="btn"
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.375rem",
                                    padding: "0.375rem 0.75rem",
                                    backgroundColor: "transparent",
                                    border: "1px solid var(--border-subtle)",
                                    borderRadius: "var(--radius-md)",
                                    color: "var(--text-main)",
                                    fontSize: "0.8125rem"
                                }}
                            >
                                <LogIn size={14} />
                                <span>Sign In</span>
                            </Link>
                            <Link
                                to="/register"
                                className="btn"
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.375rem",
                                    padding: "0.375rem 0.75rem",
                                    backgroundColor: "var(--bg-card)",
                                    border: "1px solid var(--border-subtle)",
                                    borderRadius: "var(--radius-md)",
                                    color: "var(--text-main)",
                                    fontSize: "0.8125rem"
                                }}
                            >
                                <UserPlus size={14} />
                                <span>Register</span>
                            </Link>
                        </div>
                    )}
                </div>
            </header>

            <AnalyzeModal
                isOpen={isAnalyzeOpen}
                onClose={() => setIsAnalyzeOpen(false)}
            />
        </>
    );
};
