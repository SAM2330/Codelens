import React, { useState } from "react";
import { X, Sparkles, AlertCircle } from "lucide-react";
import { analyzeRepository } from "../services/api";
import { useNavigate } from "react-router-dom";

interface AnalyzeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (repoId: string) => void;
}

export const AnalyzeModal: React.FC<AnalyzeModalProps> = ({
    isOpen,
    onClose,
    onSuccess
}) => {
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = url.trim();
        if (!trimmed) {
            setError("Please enter a valid GitHub repository URL");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const result = await analyzeRepository(trimmed);
            onClose();
            if (onSuccess && result.id) {
                onSuccess(result.id);
            } else if (result.id) {
                navigate(`/repositories/${result.id}`);
            }
        } catch (err: any) {
            setError(err?.message || "Failed to analyze repository");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Sparkles size={20} className="text-blue-400" />
                        <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-main)" }}>
                            Analyze GitHub Repository
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}
                    >
                        <X size={20} />
                    </button>
                </div>

                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                    Enter any public GitHub repository URL to download, analyze architecture, extract APIs, trace code flows, and detect security issues.
                </p>

                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        className="input-text"
                        placeholder="https://github.com/owner/repository"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        disabled={loading}
                        autoFocus
                    />

                    {error && (
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                color: "var(--accent-rose)",
                                fontSize: "0.85rem",
                                marginBottom: "1rem"
                            }}
                        >
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading || !url.trim()}
                        >
                            {loading ? "Analyzing Repository..." : "Start Analysis"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
