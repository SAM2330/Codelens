import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
    title?: string;
    message?: string;
    onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
    title = "Failed to load data",
    message = "An unexpected error occurred while communicating with the server.",
    onRetry
}) => {
    return (
        <div className="state-box" style={{ borderColor: "rgba(244, 63, 94, 0.3)" }}>
            <div
                style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    backgroundColor: "var(--accent-rose-bg)",
                    color: "var(--accent-rose)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "1rem"
                }}
            >
                <AlertCircle size={24} />
            </div>
            <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--text-main)", marginBottom: "0.4rem" }}>
                {title}
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", maxWidth: "460px", marginBottom: "1.5rem" }}>
                {message}
            </div>
            {onRetry && (
                <button className="btn btn-secondary" onClick={onRetry}>
                    <RefreshCw size={14} />
                    <span>Try Again</span>
                </button>
            )}
        </div>
    );
};
