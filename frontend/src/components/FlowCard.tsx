import React, { useState } from "react";
import { CodeFlowGraph } from "../types";
import { ArrowRight, ChevronDown, ChevronRight, Globe, Layers, Server, Terminal } from "lucide-react";

interface FlowCardProps {
    flow: CodeFlowGraph;
    onClick?: () => void;
}

export const FlowCard: React.FC<FlowCardProps> = ({ flow }) => {
    const [expanded, setExpanded] = useState(false);

    const getMethodBadgeClass = (route: string) => {
        const method = route.split(" ")[0]?.toUpperCase();
        switch (method) {
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

    const getNodeIcon = (type: string) => {
        switch (type) {
            case "route":
                return <Terminal size={14} className="text-emerald-400" />;
            case "controller":
                return <Layers size={14} className="text-blue-400" />;
            case "service":
                return <Server size={14} className="text-purple-400" />;
            case "external_api":
                return <Globe size={14} className="text-cyan-400" />;
            default:
                return <Terminal size={14} />;
        }
    };

    const method = flow.route ? flow.route.split(" ")[0] : "";
    const path = flow.route ? flow.route.substring(method.length).trim() : flow.entryPoint;

    return (
        <div className="flow-card">
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer"
                }}
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flow-route-title">
                    {method && (
                        <span className={`method-badge ${getMethodBadgeClass(flow.route || "")}`}>
                            {method}
                        </span>
                    )}
                    <span>{path}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)" }}>
                    <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
                        {flow.nodes.length} nodes
                    </span>
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
            </div>

            {/* Steps Chain Preview */}
            <div className="flow-steps-chain" style={{ marginTop: "0.5rem" }}>
                {flow.nodes.map((node, idx) => (
                    <React.Fragment key={node.id}>
                        <div className="flow-step-item">
                            {getNodeIcon(node.type)}
                            <span>{node.name}</span>
                        </div>
                        {idx < flow.nodes.length - 1 && (
                            <ArrowRight size={14} className="flow-arrow" />
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Detailed Nodes Breakdown (Expanded) */}
            {expanded && (
                <div
                    style={{
                        marginTop: "1rem",
                        paddingTop: "1rem",
                        borderTop: "1px solid var(--border-subtle)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.6rem"
                    }}
                >
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase" }}>
                        Detailed Execution Path
                    </div>
                    {flow.nodes.map((node, idx) => (
                        <div
                            key={node.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                backgroundColor: "var(--bg-card)",
                                padding: "0.5rem 0.75rem",
                                borderRadius: "var(--radius-sm)",
                                fontSize: "0.8rem",
                                border: "1px solid var(--border-subtle)"
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                <span style={{ color: "var(--text-dim)", fontWeight: 600, width: "16px" }}>
                                    {idx + 1}.
                                </span>
                                <span className={`badge badge-${node.type === "external_api" ? "cyan" : node.type === "route" ? "emerald" : node.type === "controller" ? "blue" : "purple"}`}>
                                    {node.type}
                                </span>
                                <span style={{ fontWeight: 600, color: "var(--text-main)", fontFamily: "var(--font-mono)" }}>
                                    {node.name}
                                </span>
                            </div>
                            {node.filePath && (
                                <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                                    {node.filePath}{typeof node.startLine === "number" ? `:${node.startLine}` : ""}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
