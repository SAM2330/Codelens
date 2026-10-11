export interface StoredRepository {
    id: string;
    github_id: number;
    owner: string;
    name: string;
    full_name: string;
    github_url: string;
    default_branch: string;
    description: string | null;
    created_at: string;
    updated_at: string;
    last_analyzed_at?: string | null;
    is_private?: boolean;
    isPrivate?: boolean;
    userRole?: string;
}

export interface ProjectAnalysis {
    framework?: string;
    language?: string;
    languages?: string[];
    frameworks?: string[];
    libraries?: string[];
    packageManagers?: string[];
    architecture?: {
        backend?: boolean;
        database?: boolean;
        frontend?: boolean;
    };
    buildTool?: string;
    packageManager?: string;
    runtime?: string;
    type?: string;
}

export interface ArchitectureLayer {
    name: string;
    path?: string;
    description?: string;
    files?: string[];
}

export interface ArchitectureComponent {
    name: string;
    type: string;
    path: string;
}

export interface ArchitectureAnalysis {
    type?: string;
    style?: string[];
    patterns?: string[];
    layers?: ArchitectureLayer[];
    entryPoints?: string[];
    components?: ArchitectureComponent[];
    hotspots?: {
        file: string;
        dependencyCount: number;
    }[];
    database?: string | null;
    externalAPIs?: string[];
    summary?: string;
}

export interface APIEndpoint {
    method: string;
    path: string;
    file: string;
    line: number;
    framework: string;
    handler?: string | null;
}

export interface APIAnalysis {
    endpoints: APIEndpoint[];
    externalAPIs: string[];
}

export interface DatabaseModel {
    name: string;
    fields?: string[];
}

export interface DatabaseAnalysis {
    provider: string | null;
    orm: string | null;
    models: DatabaseModel[];
    totalTables?: number;
}

export interface CodeFlowStep {
    type: "route" | "controller" | "service" | "external_api" | "function" | "database";
    name?: string;
    file?: string;
    line?: number;
    url?: string;
}

export interface RawCodeFlow {
    entryPoint: string;
    route: string;
    handler?: string;
    steps?: CodeFlowStep[];
}

export interface CodeFlowNode {
    id: string;
    type: "route" | "controller" | "service" | "external_api" | "function" | "database";
    name: string;
    filePath?: string;
    startLine?: number;
    endLine?: number;
}

export interface CodeFlowEdge {
    id: string;
    source: string;
    target: string;
    type: "calls" | "routes_to" | "requests" | "queries";
}

export interface CodeFlowGraph {
    flowId: string;
    entryPoint: string;
    route?: string;
    nodes: CodeFlowNode[];
    edges: CodeFlowEdge[];
}

export interface CodeFlowsResponse {
    repositoryId: string;
    flows: CodeFlowGraph[];
}

export interface StaticIssue {
    rule: string;
    severity: "low" | "medium" | "high" | string;
    message: string;
    file: string;
    line: number;
}

export interface SecurityIssue {
    rule: string;
    severity: "low" | "medium" | "high" | string;
    message: string;
    file: string;
    line: number;
}

export interface GitAnalysis {
    totalCommits: number;
    authors: { name: string; commits: number }[];
    hotspots: { file: string; changes: number }[];
}

export interface AnalyzedFileItem {
    path: string;
    language: string;
    type: string;
    area: string;
}

export interface AnalyzedFileSummary {
    path: string;
    language: string;
    size: number;
}

export interface AnalyzedFileContent {
    path: string;
    language: string;
    content: string;
    size: number;
}

export interface FileTreeNode {
    name: string;
    path: string;
    isDirectory: boolean;
    children: FileTreeNode[];
    file?: AnalyzedFileSummary;
}

export interface Citation {
    id: number;
    filePath: string;
    startLine: number;
    endLine: number;
    chunkId?: string;
    symbol?: string | null;
    symbolType?: string | null;
}

export interface DependencyItem {
    from: string;
    to: string;
    source: string;
}

export interface StoredAnalysisResult {
    id: string;
    repository: {
        id?: number;
        owner: string;
        name: string;
        full_name: string;
        html_url?: string;
        github_url?: string;
        default_branch: string;
        description: string | null;
        last_analyzed_at?: string | null;
    };
    project: ProjectAnalysis;
    architecture: ArchitectureAnalysis;
    api: APIAnalysis;
    database: DatabaseAnalysis;
    codeFlows: RawCodeFlow[];
    git: GitAnalysis;
    static: {
        issues: StaticIssue[];
        summary: {
            total: number;
            low: number;
            medium: number;
            high: number;
        };
    };
    security: {
        issues: SecurityIssue[];
        summary: {
            total: number;
            low: number;
            medium: number;
            high: number;
        };
    };
    files: AnalyzedFileItem[];
    dependencies: DependencyItem[];
    message?: string;
    cached?: boolean;
    commitSha?: string;
    isPrivate?: boolean;
}

export interface AskRepositoryResponse {
    repositoryId: string;
    query: string;
    answer: string;
    citations: Citation[];
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    citations?: Citation[];
    timestamp: Date;
    error?: boolean;
    errorMessage?: string;
}

export interface PersistedChatMessage {
    id: string;
    userId: string;
    repositoryId: string;
    role: "user" | "assistant";
    content: string;
    citations?: Citation[];
    createdAt: string;
}

