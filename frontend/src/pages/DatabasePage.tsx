import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchRepositoryById } from "../services/api";
import { StoredAnalysisResult } from "../types";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { Database, Table, Layers, HardDrive } from "lucide-react";

export const DatabasePage: React.FC = () => {
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
            setError(err?.message || "Failed to load database analysis");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [id]);

    if (loading) {
        return <LoadingState message="Inspecting database schemas and ORM entities..." />;
    }

    if (error || !analysis) {
        return <ErrorState message={error || "Could not load database analysis"} onRetry={loadData} />;
    }

    const { database } = analysis;
    const hasDatabase =
        Boolean(database?.provider || database?.orm || (database?.models && database.models.length > 0));

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Database Intelligence</h1>
                <p className="page-subtitle">
                    Schema architecture, data persistence layers, ORM models, and entity relationships
                </p>
            </div>

            {!hasDatabase ? (
                <EmptyState
                    title="No database schema detected"
                    description="CodeLens did not identify any Prisma schemas, Mongoose models, TypeORM entities, or SQL migration files in this repository."
                    icon={<Database size={32} />}
                />
            ) : (
                <div>
                    {/* Database Config Cards */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem", marginBottom: "1.5rem" }}>
                        <div className="metric-card">
                            <div>
                                <div className="metric-title">Database Provider</div>
                                <div className="metric-value" style={{ fontSize: "1.25rem" }}>
                                    {database.provider || "Generic / Unspecified"}
                                </div>
                                <div className="metric-subtitle">Persistence Engine</div>
                            </div>
                            <div className="metric-icon-box badge-emerald">
                                <Database size={20} />
                            </div>
                        </div>

                        <div className="metric-card">
                            <div>
                                <div className="metric-title">ORM / Query Builder</div>
                                <div className="metric-value" style={{ fontSize: "1.25rem" }}>
                                    {database.orm || "Native / None"}
                                </div>
                                <div className="metric-subtitle">Data Access Layer</div>
                            </div>
                            <div className="metric-icon-box badge-cyan">
                                <Layers size={20} />
                            </div>
                        </div>

                        <div className="metric-card">
                            <div>
                                <div className="metric-title">Detected Models</div>
                                <div className="metric-value">
                                    {database.models?.length || 0}
                                </div>
                                <div className="metric-subtitle">Entities / Tables</div>
                            </div>
                            <div className="metric-icon-box badge-purple">
                                <Table size={20} />
                            </div>
                        </div>
                    </div>

                    {/* Models & Entities Grid */}
                    {database.models && database.models.length > 0 && (
                        <div className="panel">
                            <div className="panel-header">
                                <h3 className="panel-title">
                                    <Table size={18} className="text-cyan-400" />
                                    <span>Schema Models & Tables</span>
                                </h3>
                                <span className="badge badge-gray">{database.models.length} Models</span>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
                                {database.models.map((model, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            backgroundColor: "var(--bg-card-subtle)",
                                            border: "1px solid var(--border-subtle)",
                                            borderRadius: "var(--radius-md)",
                                            padding: "1.25rem"
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                                            <HardDrive size={16} className="text-emerald-400" />
                                            <span style={{ fontWeight: 700, color: "var(--text-main)", fontSize: "1rem", fontFamily: "var(--font-mono)" }}>
                                                {model.name}
                                            </span>
                                        </div>

                                        {model.fields && model.fields.length > 0 ? (
                                            <div>
                                                <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "0.4rem" }}>
                                                    Fields / Columns
                                                </div>
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                                                    {model.fields.map((field, fIdx) => (
                                                        <span key={fIdx} className="badge badge-gray" style={{ fontSize: "0.75rem" }}>
                                                            {field}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                                                Entity definition detected in models directory.
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
