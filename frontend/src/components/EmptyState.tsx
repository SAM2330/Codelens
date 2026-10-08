import React from "react";
import { FolderGit2 } from "lucide-react";

interface EmptyStateProps {
    title: string;
    description: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    title,
    description,
    icon = <FolderGit2 size={32} />,
    action
}) => {
    return (
        <div className="state-box">
            <div
                style={{
                    color: "var(--text-dim)",
                    marginBottom: "1rem"
                }}
            >
                {icon}
            </div>
            <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--text-main)", marginBottom: "0.4rem" }}>
                {title}
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", maxWidth: "460px", marginBottom: action ? "1.5rem" : "0" }}>
                {description}
            </div>
            {action && <div>{action}</div>}
        </div>
    );
};
