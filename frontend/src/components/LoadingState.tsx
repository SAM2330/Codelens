import React from "react";

interface LoadingStateProps {
    message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
    message = "Loading repository data..."
}) => {
    return (
        <div className="state-box">
            <div className="spinner"></div>
            <div style={{ fontWeight: 600, color: "var(--text-main)", marginBottom: "0.25rem" }}>
                {message}
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                Fetching code analysis and intelligence from CodeLens backend
            </div>
        </div>
    );
};
