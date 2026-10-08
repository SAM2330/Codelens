import {
    CodeFlowGraph,
    CodeFlowNode,
    CodeFlowEdge,
    RawCodeFlow
} from "../types";

function determineEdgeType(
    sourceType: string,
    targetType: string
): "calls" | "routes_to" | "requests" | "queries" {
    if (sourceType === "route" && targetType === "controller") {
        return "routes_to";
    }
    if (targetType === "external_api") {
        return "requests";
    }
    if (targetType === "database") {
        return "queries";
    }
    return "calls";
}

function getNodeDetails(step: {
    type: string;
    name?: string;
    file?: string;
    line?: number;
    url?: string;
}): { id: string; type: any; name: string } {
    const rawType = step.type || "function";

    if (rawType === "external_api") {
        const name = step.url || step.name || "External API";
        return {
            id: `external:${name}`,
            type: "external_api",
            name
        };
    }

    if (rawType === "route") {
        const name = step.name || "Route";
        return {
            id: `route:${name}`,
            type: "route",
            name
        };
    }

    if (rawType === "controller") {
        const name = step.name || "Controller";
        return {
            id: `controller:${name}`,
            type: "controller",
            name
        };
    }

    if (rawType === "service") {
        const name = step.name || "Service";
        return {
            id: `service:${name}`,
            type: "service",
            name
        };
    }

    if (rawType === "database") {
        const name = step.name || "Database";
        return {
            id: `database:${name}`,
            type: "database",
            name
        };
    }

    const name = step.name || "Function";
    return {
        id: `function:${name}`,
        type: "function",
        name
    };
}

export function transformFlowToGraph(
    flow: RawCodeFlow | { id?: string; entryPoint: string; route: string; steps?: any[] }
): CodeFlowGraph {
    const flowId = (flow as any).id || `flow:${flow.route || flow.entryPoint}`;
    const entryPoint = flow.entryPoint || "";
    const route = flow.route || "";
    const steps = flow.steps || [];

    const nodesMap = new Map<string, CodeFlowNode>();
    const edgesMap = new Map<string, CodeFlowEdge>();

    if (steps.length === 0) {
        if (route || entryPoint) {
            const nodeName = route || entryPoint;
            const routeNode: CodeFlowNode = {
                id: `route:${nodeName}`,
                type: "route",
                name: nodeName,
                ...(entryPoint && { filePath: entryPoint })
            };
            nodesMap.set(routeNode.id, routeNode);
        }

        return {
            flowId,
            entryPoint,
            route,
            nodes: Array.from(nodesMap.values()),
            edges: []
        };
    }

    let previousNode: CodeFlowNode | null = null;

    for (const step of steps) {
        const { id: nodeId, type: nodeType, name: nodeName } = getNodeDetails(step);

        let node = nodesMap.get(nodeId);
        if (!node) {
            const newNode: CodeFlowNode = {
                id: nodeId,
                type: nodeType,
                name: nodeName,
                ...(step.file && { filePath: step.file }),
                ...(typeof step.line === "number" && { startLine: step.line })
            };
            nodesMap.set(nodeId, newNode);
            node = newNode;
        } else {
            if (!node.filePath && step.file) {
                node.filePath = step.file;
            }
            if (node.startLine === undefined && typeof step.line === "number") {
                node.startLine = step.line;
            }
        }

        const currentNode: CodeFlowNode = node;

        if (previousNode && previousNode.id !== currentNode.id) {
            const edgeType = determineEdgeType(previousNode.type, currentNode.type);
            const edgeId = `${previousNode.id}->${currentNode.id}`;

            if (!edgesMap.has(edgeId)) {
                edgesMap.set(edgeId, {
                    id: edgeId,
                    source: previousNode.id,
                    target: currentNode.id,
                    type: edgeType
                });
            }
        }

        previousNode = currentNode;
    }

    return {
        flowId,
        entryPoint,
        route,
        nodes: Array.from(nodesMap.values()),
        edges: Array.from(edgesMap.values())
    };
}
