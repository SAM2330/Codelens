import { ImportInfo } from "../services/codeAnalyzer";
import { ASTAnalysis } from "../services/astAnalyzer";
import { Dependency } from "../services/dependencyAnalyzer";
import { ProjectAnalysis } from "../services/projectAnalyzer";
import { ArchitectureAnalysis } from "../services/architectureAnalyzer";
import { APIAnalysis } from "../services/apiAnalyzer";
import { DatabaseAnalysis } from "../services/databaseAnalyzer";
import { CodeFlow } from "../services/codeFlowAnalyzer";
import { GitAnalysis } from "../services/gitAnalyzer";
import { StaticAnalysis } from "../services/staticAnalyzer";
import { SecurityAnalysis } from "../services/securityAnalyzer";

export interface AnalyzedFileDTO {
    path: string;
    language: string;
    type: string;
    area: string;
    imports: ImportInfo[];
    structure: ASTAnalysis;
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
    message?: string;
}
