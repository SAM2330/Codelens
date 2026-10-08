import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchRepositoryFlows } from "../services/api";
import { CodeFlowGraph } from "../types";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { FlowCard } from "../components/FlowCard";
import { GitFork, Search } from "lucide-react";

export const CodeFlowsPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [flows, setFlows] = useState<CodeFlowGraph[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");

    const loadData = async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            const data = await fetchRepositoryFlows(id);
            setFlows(data.flows || []);
        } catch (err: any) {
            setError(err?.message || "Failed to load code flows");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [id]);

    if (loading) {
        return <LoadingState message="Tracing end-to-end execution code flows..." />;
    }

    if (error) {
        return <ErrorState message={error} onRetry={loadData} />;
    }

    const filtered = flows.filter((f) => {
        const query = search.toLowerCase();
        return (
            (f.route && f.route.toLowerCase().includes(query)) ||
            (f.entryPoint && f.entryPoint.toLowerCase().includes(query)) ||
            f.nodes.some(
                (n) =>
                    n.name.toLowerCase().includes(query) ||
                    (n.filePath && n.filePath.toLowerCase().includes(query))
            )
        );
    });

    return (
        <div>
            <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                    <h1 className="page-title">Code Flows</h1>
                    <p className="page-subtitle">
                        Deep trace of API routes through controllers, services, and external integrations
                    </p>
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
                        placeholder="Search routes, services, APIs..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="input-text"
                        style={{
                            margin: 0,
                            paddingLeft: "36px",
                            width: "280px"
                        }}
                    />
                </div>
            </div>

            {filtered.length === 0 ? (
                <EmptyState
                    title={flows.length === 0 ? "No code flows detected" : "No matching code flows"}
                    description={
                        flows.length === 0
                            ? "CodeLens could not automatically map any route-to-service execution flows for this repository."
                            : "Try searching for a different route, controller, or service name."
                    }
                    icon={<GitFork size={32} />}
                />
            ) : (
                <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        <span>Showing {filtered.length} of {flows.length} detected flows</span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Click any flow to expand detailed execution nodes</span>
                    </div>

                    {filtered.map((flow) => (
                        <FlowCard key={flow.flowId} flow={flow} />
                    ))}
                </div>
            )}
        </div>
    );
};
