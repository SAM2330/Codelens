import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchRepositoryById } from "../services/api";
import { StoredAnalysisResult, APIEndpoint } from "../types";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { Network, Search, Globe, Filter } from "lucide-react";

export const APIsPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [analysis, setAnalysis] = useState<StoredAnalysisResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [methodFilter, setMethodFilter] = useState<string>("ALL");

    const loadData = async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            const data = await fetchRepositoryById(id);
            setAnalysis(data);
        } catch (err: any) {
            setError(err?.message || "Failed to load APIs");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [id]);

    if (loading) {
        return <LoadingState message="Extracting API endpoints and routes..." />;
    }

    if (error || !analysis) {
        return <ErrorState message={error || "Could not load API analysis"} onRetry={loadData} />;
    }

    const endpoints: APIEndpoint[] = analysis.api?.endpoints || [];
    const externalAPIs: string[] = analysis.api?.externalAPIs || [];

    const getMethodBadgeClass = (method: string) => {
        switch (method.toUpperCase()) {
            case "GET":
                return "method-get";
            case "POST":
                return "method-post";
            case "PUT":
                return "method-put";
            case "DELETE":
                return "method-delete";
            default:
                return "method-patch";
        }
    };

    const filteredEndpoints = endpoints.filter((ep) => {
        const matchesMethod =
            methodFilter === "ALL" ||
            ep.method.toUpperCase() === methodFilter.toUpperCase();
        const query = search.toLowerCase();
        const matchesSearch =
            ep.path.toLowerCase().includes(query) ||
            ep.file.toLowerCase().includes(query) ||
            (ep.handler && ep.handler.toLowerCase().includes(query));
        return matchesMethod && matchesSearch;
    });

    const uniqueMethods = ["ALL", ...Array.from(new Set(endpoints.map((e) => e.method.toUpperCase())))];

    return (
        <div>
            <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                    <h1 className="page-title">API Intelligence</h1>
                    <p className="page-subtitle">
                        Discovered HTTP endpoints, request handlers, and external cloud dependencies
                    </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                    {/* Method Filter */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", background: "var(--bg-card)", padding: "0.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                        {uniqueMethods.map((m) => (
                            <button
                                key={m}
                                onClick={() => setMethodFilter(m)}
                                style={{
                                    border: "none",
                                    background: methodFilter === m ? "var(--bg-card-hover)" : "transparent",
                                    color: methodFilter === m ? "var(--text-main)" : "var(--text-dim)",
                                    fontWeight: methodFilter === m ? 600 : 500,
                                    fontSize: "0.75rem",
                                    padding: "0.3rem 0.6rem",
                                    borderRadius: "var(--radius-sm)",
                                    cursor: "pointer"
                                }}
                            >
                                {m}
                            </button>
                        ))}
                    </div>

                    <div style={{ position: "relative" }}>
                        <Search
                            size={16}
                            style={{
                                position: "absolute",
                                left: "12px",
                                top: "50%",
                                transform: "translateY(-50%)",
                                color: "var(--text-dim)"
                            }}
                        />
                        <input
                            type="text"
                            placeholder="Filter routes or handlers..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="input-text"
                            style={{
                                margin: 0,
                                paddingLeft: "36px",
                                width: "240px"
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* External APIs Summary */}
            {externalAPIs.length > 0 && (
                <div className="panel" style={{ padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                        <Globe size={16} className="text-cyan-400" />
                        <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-main)" }}>
                            External Cloud & API Services
                        </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                        {externalAPIs.map((apiName, idx) => (
                            <span key={idx} className="badge badge-cyan">{apiName}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* Endpoints Table */}
            {filteredEndpoints.length === 0 ? (
                <EmptyState
                    title={endpoints.length === 0 ? "No API endpoints detected" : "No matching endpoints"}
                    description={
                        endpoints.length === 0
                            ? "CodeLens could not identify any Express, Next.js, or REST route endpoints in this codebase."
                            : "Try clearing your method or path filter."
                    }
                    icon={<Network size={32} />}
                />
            ) : (
                <div className="data-table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Route Path</th>
                                <th>Handler / Controller</th>
                                <th>Source File</th>
                                <th>Line</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEndpoints.map((ep, idx) => (
                                <tr key={idx}>
                                    <td>
                                        <span className={`method-badge ${getMethodBadgeClass(ep.method)}`}>
                                            {ep.method.toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-main)" }}>
                                            {ep.path}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="code-snippet">
                                            {ep.handler || "Anonymous Handler"}
                                        </span>
                                    </td>
                                    <td>
                                        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                                            {ep.file}
                                        </span>
                                    </td>
                                    <td>
                                        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", fontSize: "0.75rem" }}>
                                            :{ep.line}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
