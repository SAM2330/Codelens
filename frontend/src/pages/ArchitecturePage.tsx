import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchRepositoryById } from "../services/api";
import { StoredAnalysisResult } from "../types";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import {
    Layers,
    Box,
    Terminal,
    GitCommit,
    FileCode,
    Flame,
    ArrowUpRight
} from "lucide-react";

export const ArchitecturePage: React.FC = () => {
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
            setError(err?.message || "Failed to load architecture");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [id]);

    if (loading) {
        return <LoadingState message="Analyzing architecture layers and components..." />;
    }

    if (error || !analysis) {
        return <ErrorState message={error || "Could not load architecture analysis"} onRetry={loadData} />;
    }

    const { architecture, git } = analysis;

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Architecture Analysis</h1>
                <p className="page-subtitle">
                    System topology, structural layers, entry points, and component hierarchy
                </p>
            </div>

            {/* Architecture Summary Panel */}
            <div className="panel">
                <div className="panel-header">
                    <h3 className="panel-title">
                        <Layers size={18} className="text-purple-400" />
                        <span>System Architecture Summary</span>
                    </h3>
                    <span className="badge badge-purple">{architecture?.type || "Monolith / Modular"}</span>
                </div>

                <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", lineHeight: 1.6, marginBottom: "1rem" }}>
                    {architecture?.summary || "No architecture summary generated."}
                </p>

                {architecture?.patterns && architecture.patterns.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase" }}>
                            Architectural Patterns:
                        </span>
                        {architecture.patterns.map((p, idx) => (
                            <span key={idx} className="badge badge-blue">{p}</span>
                        ))}
                    </div>
                )}
            </div>

            {/* Entry Points & Major Components Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1.5rem", marginBottom: "1.5rem" }}>
                {/* Entry Points */}
                <div className="panel" style={{ margin: 0 }}>
                    <div className="panel-header">
                        <h3 className="panel-title">
                            <Terminal size={18} className="text-emerald-400" />
                            <span>Application Entry Points</span>
                        </h3>
                    </div>

                    {!architecture?.entryPoints || architecture.entryPoints.length === 0 ? (
                        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
                            No specific entry point files identified.
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            {architecture.entryPoints.map((ep, idx) => (
                                <Link
                                    key={idx}
                                    to={`/repositories/${encodeURIComponent(id || "")}/code?path=${encodeURIComponent(
                                        ep
                                    )}`}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        backgroundColor: "var(--bg-card-subtle)",
                                        padding: "0.5rem 0.75rem",
                                        borderRadius: "var(--radius-sm)",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.8rem",
                                        color: "#34d399",
                                        border: "1px solid var(--border-subtle)",
                                        textDecoration: "none"
                                    }}
                                    title={`Open ${ep} in Code Viewer`}
                                    className="source-nav-link-box"
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                        <FileCode size={14} />
                                        <span>{ep}</span>
                                    </div>
                                    <ArrowUpRight size={13} style={{ color: "var(--text-dim)" }} />
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* Major Components */}
                <div className="panel" style={{ margin: 0 }}>
                    <div className="panel-header">
                        <h3 className="panel-title">
                            <Box size={18} className="text-cyan-400" />
                            <span>Major Components</span>
                        </h3>
                    </div>

                    {!architecture?.components || architecture.components.length === 0 ? (
                        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
                            No major components detected.
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            {architecture.components.map((comp, idx) => (
                                <Link
                                    key={idx}
                                    to={`/repositories/${encodeURIComponent(id || "")}/code?path=${encodeURIComponent(
                                        comp.path
                                    )}`}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        backgroundColor: "var(--bg-card-subtle)",
                                        padding: "0.5rem 0.75rem",
                                        borderRadius: "var(--radius-sm)",
                                        fontSize: "0.8rem",
                                        border: "1px solid var(--border-subtle)",
                                        textDecoration: "none"
                                    }}
                                    title={`Open ${comp.path} in Code Viewer`}
                                    className="source-nav-link-box"
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                        <span className="badge badge-cyan">{comp.type}</span>
                                        <span style={{ fontWeight: 600, color: "var(--text-main)" }}>{comp.name}</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                        <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                                            {comp.path}
                                        </span>
                                        <ArrowUpRight size={13} style={{ color: "var(--text-dim)" }} />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Architecture Layers */}
            <div className="panel">
                <div className="panel-header">
                    <h3 className="panel-title">
                        <Layers size={18} className="text-blue-400" />
                        <span>Architectural Layers</span>
                    </h3>
                </div>

                {!architecture?.layers || architecture.layers.length === 0 ? (
                    <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
                        No specific architectural layers mapped.
                    </div>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                        {architecture.layers.map((layer, idx) => (
                            <div
                                key={idx}
                                style={{
                                    backgroundColor: "var(--bg-card-subtle)",
                                    border: "1px solid var(--border-subtle)",
                                    borderRadius: "var(--radius-md)",
                                    padding: "1rem"
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                                    <span style={{ fontWeight: 700, color: "var(--text-main)", fontSize: "0.95rem" }}>
                                        {layer.name}
                                    </span>
                                    <span className="badge badge-gray">{layer.files?.length || 0} files</span>
                                </div>
                                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "#38bdf8", marginBottom: "0.5rem" }}>
                                    {layer.path}
                                </div>
                                {layer.description && (
                                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                                        {layer.description}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Hotspots & Churn */}
            {git?.hotspots && git.hotspots.length > 0 && (
                <div className="panel">
                    <div className="panel-header">
                        <h3 className="panel-title">
                            <Flame size={18} className="text-amber-400" />
                            <span>Code Hotspots & Churn</span>
                        </h3>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        {git.hotspots.slice(0, 5).map((hotspot, idx) => (
                            <Link
                                key={idx}
                                to={`/repositories/${encodeURIComponent(id || "")}/code?path=${encodeURIComponent(
                                    hotspot.file
                                )}`}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    backgroundColor: "var(--bg-card-subtle)",
                                    padding: "0.5rem 0.75rem",
                                    borderRadius: "var(--radius-sm)",
                                    fontSize: "0.8rem",
                                    border: "1px solid var(--border-subtle)",
                                    textDecoration: "none"
                                }}
                                title={`Open ${hotspot.file} in Code Viewer`}
                                className="source-nav-link-box"
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <FileCode size={14} className="text-amber-400" />
                                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-main)" }}>
                                        {hotspot.file}
                                    </span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <span className="badge badge-amber">{hotspot.changes} modifications</span>
                                    <ArrowUpRight size={13} style={{ color: "var(--text-dim)" }} />
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
