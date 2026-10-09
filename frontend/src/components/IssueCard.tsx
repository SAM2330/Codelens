import React from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, AlertTriangle, Info, ShieldAlert, ArrowUpRight, FileCode } from "lucide-react";
import { SecurityIssue, StaticIssue } from "../types";

interface IssueCardProps {
    issue: SecurityIssue | StaticIssue;
    isSecurity?: boolean;
    repositoryId?: string;
}

export const IssueCard: React.FC<IssueCardProps> = ({
    issue,
    isSecurity = false,
    repositoryId
}) => {
    const { id: paramRepoId } = useParams<{ id: string }>();
    const activeRepoId = repositoryId || paramRepoId;
    const severity = issue.severity.toLowerCase();

    const getSeverityBadge = () => {
        switch (severity) {
            case "high":
                return <span className="badge badge-rose">HIGH</span>;
            case "medium":
                return <span className="badge badge-amber">MEDIUM</span>;
            case "low":
                return <span className="badge badge-emerald">LOW</span>;
            default:
                return <span className="badge badge-gray">{issue.severity.toUpperCase()}</span>;
        }
    };

    const getIcon = () => {
        if (isSecurity) {
            return (
                <ShieldAlert
                    size={18}
                    className={
                        severity === "high"
                            ? "text-rose-400"
                            : severity === "medium"
                            ? "text-amber-400"
                            : "text-emerald-400"
                    }
                />
            );
        }
        if (severity === "high") return <AlertCircle size={18} className="text-rose-400" />;
        if (severity === "medium") return <AlertTriangle size={18} className="text-amber-400" />;
        return <Info size={18} className="text-blue-400" />;
    };

    const codeViewerUrl = activeRepoId
        ? `/repositories/${encodeURIComponent(activeRepoId)}/code?path=${encodeURIComponent(
              issue.file
          )}&line=${issue.line}`
        : null;

    return (
        <div
            style={{
                backgroundColor: "var(--bg-card-subtle)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
                marginBottom: "0.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem"
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    {getIcon()}
                    <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                        {issue.rule}
                    </span>
                </div>
                {getSeverityBadge()}
            </div>

            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {issue.message}
            </div>

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: "0.25rem"
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        fontSize: "0.75rem",
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-dim)"
                    }}
                >
                    <FileCode size={13} style={{ color: "#38bdf8" }} />
                    <span>File:</span>
                    <span style={{ color: "#38bdf8" }}>
                        {issue.file}:{issue.line}
                    </span>
                </div>

                {codeViewerUrl && (
                    <Link
                        to={codeViewerUrl}
                        className="source-nav-link"
                        title={`Open ${issue.file} at line ${issue.line} in Code Viewer`}
                    >
                        <span>View Source</span>
                        <ArrowUpRight size={13} />
                    </Link>
                )}
            </div>
        </div>
    );
};
