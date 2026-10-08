import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchRepositoryById } from "../services/api";
import { StoredAnalysisResult } from "../types";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { MetricCard } from "../components/MetricCard";
import { TechnologyBadge } from "../components/TechnologyBadge";
import { FlowCard } from "../components/FlowCard";
import { transformFlowToGraph } from "../services/codeFlowGraphService";
import {
    FileCode,
    Network,
    GitFork,
    ShieldAlert,
    Layers,
    ArrowRight,
    ExternalLink,
    Terminal
} from "lucide-react";

export const OverviewPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [analysis, setAnalysis] = useState<StoredAnalysisResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            const data = await fetchRepositoryById(id);
            setAnalysis(data);
        } catch (err: any) {
            setError(err?.message || "Failed to load repository overview");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [id]);

    if (loading) {
        return <LoadingState message="Analyzing repository architecture..." />;
    }

    if (error || !analysis) {
        return (
            <ErrorState
                title="Repository not found"
                message={error || "Could not load analysis details for this repository."}
                onRetry={loadData}
            />
        );
    }

    const {
        repository,
        project,
        architecture,
        api,
        database,
        codeFlows = [],
        security,
        files = [],
        dependencies = []
    } = analysis;

    const recentFlows = codeFlows.slice(0, 3).map((f) => transformFlowToGraph(f));

    // Gather tech badges safely
    const languages = project?.languages || (project?.language ? [project.language] : []);
    const frameworks = project?.frameworks || (project?.framework ? [project.framework] : []);
    const libraries = project?.libraries || [];
    const packageManagers = project?.packageManagers || (project?.packageManager ? [project.packageManager] : []);

    // Architecture styles & summary
    const styles = architecture?.style || (architecture?.type ? [architecture.type] : []);
    const patterns = architecture?.patterns || [];

    const ownerName =
        typeof repository?.owner === "string"
            ? repository.owner
            : (repository?.owner as any)?.login || "";

    return (
        <div>
            {/* Repository Header */}
            <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                        <h1 className="page-title" style={{ margin: 0 }}>
                            {repository.name}
                        </h1>
                        {ownerName && <span className="badge badge-gray">{ownerName}</span>}
                        {repository.default_branch && (
                            <span className="badge badge-blue">{repository.default_branch}</span>
                        )}
                    </div>
                    <p className="page-subtitle">
                        {repository.description || "No repository description available."}
                    </p>
                </div>

                {repository.html_url || repository.github_url ? (
                    <a
                        href={repository.html_url || repository.github_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary"
                    >
                        <span>View on GitHub</span>
                        <ExternalLink size={14} />
                    </a>
                ) : null}
            </div>

            {/* Metrics Grid */}
            <div className="grid-cards">
                <MetricCard
                    title="Analyzed Files"
                    value={files.length}
                    subtitle={`${dependencies.length} module dependencies`}
                    icon={<FileCode size={20} />}
                    color="blue"
                />
                <MetricCard
                    title="API Endpoints"
                    value={api?.endpoints?.length || 0}
                    subtitle={`${api?.externalAPIs?.length || 0} external services`}
                    icon={<Network size={20} />}
                    color="emerald"
                />
                <MetricCard
                    title="Code Flows"
                    value={codeFlows.length}
                    subtitle="End-to-end execution paths"
                    icon={<GitFork size={20} />}
                    color="purple"
                />
                <MetricCard
                    title="Security Issues"
                    value={security?.summary?.total || 0}
                    subtitle={`${security?.summary?.high || 0} high severity findings`}
                    icon={<ShieldAlert size={20} />}
                    color={security?.summary?.high ? "rose" : "amber"}
                />
            </div>

            {/* Tech Stack & Architecture Panel */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1.5rem", marginBottom: "1.5rem" }}>
                {/* Tech Stack */}
                <div className="panel" style={{ margin: 0 }}>
                    <div className="panel-header">
                        <h3 className="panel-title">
                            <Terminal size={18} className="text-cyan-400" />
                            <span>Technology Stack</span>
                        </h3>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.25rem" }}>
                        {languages.map((lang, idx) => (
                            <TechnologyBadge key={idx} name={lang} variant="blue" />
                        ))}
                        {frameworks.map((fw, idx) => (
                            <TechnologyBadge key={idx} name={fw} variant="cyan" />
                        ))}
                        {packageManagers.map((pm, idx) => (
                            <TechnologyBadge key={idx} name={pm} variant="emerald" />
                        ))}
                        {project?.buildTool && typeof project.buildTool === "string" && (
                            <TechnologyBadge name={project.buildTool} variant="purple" />
                        )}
                    </div>

                    {libraries.length > 0 && (
                        <div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                                Detected Libraries & Integrations
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                                {libraries.map((lib, idx) => (
                                    <span key={idx} className="badge badge-gray">{lib}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Architecture Summary */}
                <div className="panel" style={{ margin: 0 }}>
                    <div className="panel-header">
                        <h3 className="panel-title">
                            <Layers size={18} className="text-purple-400" />
                            <span>Architecture</span>
                        </h3>
                        <Link to={`/repositories/${id}/architecture`} className="btn btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}>
                            <span>Details</span>
                            <ArrowRight size={12} />
                        </Link>
                    </div>

                    <div style={{ marginBottom: "1rem" }}>
                        {styles.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                                {styles.map((st, idx) => (
                                    <div key={idx} style={{ fontSize: "0.85rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                        <span style={{ color: "#a855f7" }}>•</span>
                                        <span>{st}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                                {architecture?.summary || "Standard modular architecture."}
                            </p>
                        )}
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                        {patterns.map((p, i) => (
                            <span key={i} className="badge badge-blue">{p}</span>
                        ))}
                        {database?.provider && <span className="badge badge-emerald">DB: {database.provider}</span>}
                        {database?.orm && <span className="badge badge-cyan">ORM: {database.orm}</span>}
                    </div>
                </div>
            </div>

            {/* Recent Code Flows Preview */}
            <div className="panel">
                <div className="panel-header">
                    <h3 className="panel-title">
                        <GitFork size={18} className="text-emerald-400" />
                        <span>Recent Code Flows</span>
                    </h3>
                    <Link to={`/repositories/${id}/flows`} className="btn btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}>
                        <span>View All ({codeFlows.length})</span>
                        <ArrowRight size={12} />
                    </Link>
                </div>

                {recentFlows.length === 0 ? (
                    <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", padding: "1rem 0" }}>
                        No execution flows detected for this repository.
                    </div>
                ) : (
                    <div>
                        {recentFlows.map((flow) => (
                            <FlowCard key={flow.flowId} flow={flow} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
