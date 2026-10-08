import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchRepositoryById } from "../services/api";
import { StoredAnalysisResult, SecurityIssue, StaticIssue } from "../types";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { IssueCard } from "../components/IssueCard";
import { MetricCard } from "../components/MetricCard";
import { ShieldAlert, ShieldCheck, AlertCircle, AlertTriangle, Info, CheckCircle2 } from "lucide-react";

export const SecurityPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [analysis, setAnalysis] = useState<StoredAnalysisResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"security" | "static">("security");
    const [severityFilter, setSeverityFilter] = useState<string>("ALL");

    const loadData = async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            const data = await fetchRepositoryById(id);
            setAnalysis(data);
        } catch (err: any) {
            setError(err?.message || "Failed to load security analysis");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [id]);

    if (loading) {
        return <LoadingState message="Auditing security vulnerabilities and code quality..." />;
    }

    if (error || !analysis) {
        return <ErrorState message={error || "Could not load security analysis"} onRetry={loadData} />;
    }

    const securityIssues: SecurityIssue[] = analysis.security?.issues || [];
    const staticIssues: StaticIssue[] = analysis.static?.issues || [];

    const activeIssues = activeTab === "security" ? securityIssues : staticIssues;

    const filteredIssues = activeIssues.filter((issue) => {
        if (severityFilter === "ALL") return true;
        return issue.severity.toLowerCase() === severityFilter.toLowerCase();
    });

    const highCount = activeIssues.filter((i) => i.severity.toLowerCase() === "high").length;
    const mediumCount = activeIssues.filter((i) => i.severity.toLowerCase() === "medium").length;
    const lowCount = activeIssues.filter((i) => i.severity.toLowerCase() === "low").length;

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Security & Code Health</h1>
                <p className="page-subtitle">
                    Automated security vulnerability audit, credentials leak detection, and static code quality checks
                </p>
            </div>

            {/* Metrics */}
            <div className="grid-cards">
                <MetricCard
                    title="Total Findings"
                    value={activeIssues.length}
                    subtitle={`${activeTab === "security" ? "Security vulnerabilities" : "Code quality rules"}`}
                    icon={<ShieldAlert size={20} />}
                    color="blue"
                />
                <MetricCard
                    title="High Severity"
                    value={highCount}
                    subtitle="Requires immediate attention"
                    icon={<AlertCircle size={20} />}
                    color={highCount > 0 ? "rose" : "emerald"}
                />
                <MetricCard
                    title="Medium Severity"
                    value={mediumCount}
                    subtitle="Potential risks or smells"
                    icon={<AlertTriangle size={20} />}
                    color="amber"
                />
                <MetricCard
                    title="Low / Informational"
                    value={lowCount}
                    subtitle="Minor lint & style notices"
                    icon={<Info size={20} />}
                    color="cyan"
                />
            </div>

            {/* Tab & Filter Bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
                {/* Tabs */}
                <div style={{ display: "flex", gap: "0.5rem", background: "var(--bg-card)", padding: "0.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                    <button
                        onClick={() => { setActiveTab("security"); setSeverityFilter("ALL"); }}
                        style={{
                            border: "none",
                            background: activeTab === "security" ? "var(--bg-card-hover)" : "transparent",
                            color: activeTab === "security" ? "var(--text-main)" : "var(--text-dim)",
                            fontWeight: activeTab === "security" ? 600 : 500,
                            fontSize: "0.85rem",
                            padding: "0.4rem 0.85rem",
                            borderRadius: "var(--radius-sm)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.4rem"
                        }}
                    >
                        <ShieldAlert size={14} />
                        <span>Security ({securityIssues.length})</span>
                    </button>

                    <button
                        onClick={() => { setActiveTab("static"); setSeverityFilter("ALL"); }}
                        style={{
                            border: "none",
                            background: activeTab === "static" ? "var(--bg-card-hover)" : "transparent",
                            color: activeTab === "static" ? "var(--text-main)" : "var(--text-dim)",
                            fontWeight: activeTab === "static" ? 600 : 500,
                            fontSize: "0.85rem",
                            padding: "0.4rem 0.85rem",
                            borderRadius: "var(--radius-sm)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.4rem"
                        }}
                    >
                        <AlertCircle size={14} />
                        <span>Static Analysis ({staticIssues.length})</span>
                    </button>
                </div>

                {/* Severity Filter */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    {["ALL", "HIGH", "MEDIUM", "LOW"].map((sev) => (
                        <button
                            key={sev}
                            onClick={() => setSeverityFilter(sev)}
                            style={{
                                border: "none",
                                background: severityFilter === sev ? "var(--bg-card-hover)" : "transparent",
                                color: severityFilter === sev ? "var(--text-main)" : "var(--text-dim)",
                                fontWeight: severityFilter === sev ? 600 : 500,
                                fontSize: "0.75rem",
                                padding: "0.3rem 0.6rem",
                                borderRadius: "var(--radius-sm)",
                                cursor: "pointer"
                            }}
                        >
                            {sev}
                        </button>
                    ))}
                </div>
            </div>

            {/* Findings List */}
            {filteredIssues.length === 0 ? (
                <EmptyState
                    title={activeIssues.length === 0 ? "No issues detected" : "No issues match the selected severity"}
                    description={
                        activeIssues.length === 0
                            ? "Great job! CodeLens did not discover any security vulnerabilities or static lint violations in the analyzed files."
                            : "Try selecting ALL to view other severity categories."
                    }
                    icon={<CheckCircle2 size={32} className="text-emerald-400" />}
                />
            ) : (
                <div>
                    {filteredIssues.map((issue, idx) => (
                        <IssueCard
                            key={idx}
                            issue={issue}
                            isSecurity={activeTab === "security"}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
