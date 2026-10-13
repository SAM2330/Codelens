import { ImportInfo } from "../services/codeAnalyzer";
import { ASTAnalysis } from "../services/astAnalyzer";
import { Dependency } from "../services/dependencyAnalyzer";
import { ProjectAnalysis } from "../services/projectAnalyzer";
import { ArchitectureAnalysis } from "../services/architectureAnalyzer";
import { APIAnalysis } from "../services/apiAnalyzer";
import { DatabaseAnalysis } from "../services/databaseAnalyzer";
import { CodeFlow } from "../services/codeFlowAnalyzer";
import { GitAnalysis } from "../services/gitAnalyzer";
export { GitAnalysis } from "../services/gitAnalyzer";
import { StaticAnalysis } from "../services/staticAnalyzer";
import { SecurityAnalysis } from "../services/securityAnalyzer";

export interface AnalyzedFileDTO {
    path: string;
    language: string;
    type: string;
    area: string;
    size?: number;
    content?: string;
    imports: ImportInfo[];
    structure: ASTAnalysis;
}

export interface AnalyzedFileSummaryDTO {
    path: string;
    language: string;
    size: number;
}

export interface AnalyzedFileContentDTO {
    path: string;
    language: string;
    content: string;
    size: number;
}

export interface FullAnalysisResult {
    repository: Record<string, any>;
    project: ProjectAnalysis;
    architecture: ArchitectureAnalysis;
    api: APIAnalysis;
    database: DatabaseAnalysis;
    codeFlows: CodeFlow[];
    git: GitAnalysis;
    static: StaticAnalysis;
    security: SecurityAnalysis;
    files: AnalyzedFileDTO[];
    dependencies: Dependency[];
}

export type CodeChunkSymbolType =
    | "file"
    | "function"
    | "class"
    | "method"
    | "interface"
    | "type";

export interface CodeChunk {
    id?: string;
    repositoryId?: string;
    analysisId?: string;
    filePath: string;
    language: string;
    symbol: string;
    symbolType: CodeChunkSymbolType;
    startLine: number;
    endLine: number;
    content: string;
    contentHash?: string;
    embedding?: number[];
    embeddingModel?: string;
    embeddedAt?: Date | string;
    createdAt?: Date | string;
    hasEmbedding?: boolean;
}

export interface StoredRepository {
    id: string;
    github_id: number;
    owner: string;
    name: string;
    full_name: string;
    github_url: string;
    default_branch: string;
    description: string | null;
    created_at: Date | string;
    updated_at: Date | string;
    last_analyzed_at?: Date | string | null;
}

export interface StoredAnalysisRecord {
    id: string;
    repository_id: string;
    project_analysis: ProjectAnalysis;
    architecture_analysis: ArchitectureAnalysis;
    database_analysis: DatabaseAnalysis;
    git_analysis: GitAnalysis;
    static_analysis: StaticAnalysis;
    security_analysis: SecurityAnalysis;
    raw_repository: Record<string, any>;
    analyzed_at: Date | string;
}

export interface EmbeddingSummary {
    repositoryId: string;
    totalChunks: number;
    embeddedChunks: number;
    skippedChunks: number;
    failedChunks: number;
    model: string;
    dimensions: number;
    status?: "completed" | "quota_exceeded" | "partial" | "failed";
    message?: string;
}

export interface ExactSearchResult {
    id: string;
    repositoryId: string;
    analysisId?: string;
    filePath: string;
    language: string;
    symbol: string;
    symbolType: string;
    startLine: number;
    endLine: number;
    content: string;
    similarity: number;
    matchType: "exact_symbol" | "exact_file" | "partial_symbol" | "partial_file";
}

export interface VectorSearchResult {
    id: string;
    repositoryId: string;
    analysisId?: string;
    filePath: string;
    language: string;
    symbol: string;
    symbolType: string;
    startLine: number;
    endLine: number;
    content: string;
    similarity: number;
}

export interface VectorSearchResponse {
    repositoryId: string;
    query: string;
    results: VectorSearchResult[];
    message?: string;
}

export interface KeywordSearchResult {
    id: string;
    repositoryId: string;
    analysisId?: string;
    filePath: string;
    language: string;
    symbol: string;
    symbolType: string;
    startLine: number;
    endLine: number;
    content: string;
    rank: number;
}

export interface RagSource {
    chunkId: string;
    filePath: string;
    symbol: string;
    symbolType: string;
    startLine: number;
    endLine: number;
    language: string;
    similarity: number;
    content: string;
    matchType?: "exact_symbol" | "exact_file" | "partial_symbol" | "partial_file" | "vector" | "keyword" | "hybrid";
    rrfScore?: number;
    matchLanes?: ("exact" | "keyword" | "vector")[];
}

export interface RagOptions {
    candidateLimit?: number;
    maxChunks?: number;
    similarityThreshold?: number;
    analysisId?: string;
    disableExactSearch?: boolean;
    disableVectorSearch?: boolean;
    disableKeywordSearch?: boolean;
    rrfK?: number;
}

export interface RagContextResult {
    repositoryId: string;
    query: string;
    context: string;
    sourceCount: number;
    sources: RagSource[];
    notFound?: boolean;
    hasNoEmbeddings?: boolean;
    quotaExceeded?: boolean;
    message?: string;
    analysisId?: string;
}

export interface Citation {
    id: number;
    chunkId: string;
    filePath: string;
    symbol: string | null;
    symbolType: string | null;
    startLine: number;
    endLine: number;
}

export interface LlmAnswer {
    answer: string;
    citations: Citation[];
    model?: string;
}

export type CodeFlowNodeType =
    | "route"
    | "controller"
    | "service"
    | "external_api"
    | "function"
    | "database";

export type CodeFlowEdgeType =
    | "calls"
    | "routes_to"
    | "requests"
    | "queries";

export interface CodeFlowNode {
    id: string;
    type: CodeFlowNodeType;
    name: string;
    filePath?: string;
    startLine?: number;
    endLine?: number;
}

export interface CodeFlowEdge {
    id: string;
    source: string;
    target: string;
    type: CodeFlowEdgeType;
}

export interface CodeFlowGraph {
    flowId: string;
    entryPoint: string;
    route?: string;
    nodes: CodeFlowNode[];
    edges: CodeFlowEdge[];
}

export interface StoredCodeFlow {
    id: string;
    repositoryId: string;
    analysisId: string;
    entryPoint: string;
    route: string;
    handler?: string | null;
    steps: {
        type: "route" | "controller" | "service" | "external_api" | "function" | "database";
        name?: string;
        file?: string;
        line?: number;
        url?: string;
    }[];
    createdAt?: Date | string;
}

export interface CodeFlowsResponse {
    repositoryId: string;
    flows: CodeFlowGraph[];
}



