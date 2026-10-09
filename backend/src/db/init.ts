import fs from "fs";
import path from "path";
import { getPool } from "./client";

export async function initializeDatabase(): Promise<void> {
    try {
        const schemaPath = path.join(__dirname, "schema.sql");
        let sql = "";

        if (fs.existsSync(schemaPath)) {
            sql = fs.readFileSync(schemaPath, "utf-8");
        } else {
            // Fallback DDL if running from transpiled dist where sql file might not be copied
            sql = `
                CREATE EXTENSION IF NOT EXISTS "pgcrypto";
                CREATE EXTENSION IF NOT EXISTS vector;

                CREATE TABLE IF NOT EXISTS repositories (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    github_id BIGINT UNIQUE NOT NULL,
                    owner TEXT NOT NULL,
                    name TEXT NOT NULL,
                    full_name TEXT UNIQUE NOT NULL,
                    github_url TEXT NOT NULL,
                    default_branch TEXT NOT NULL,
                    description TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_repositories_github_id ON repositories(github_id);
                CREATE INDEX IF NOT EXISTS idx_repositories_full_name ON repositories(full_name);

                CREATE TABLE IF NOT EXISTS analysis_results (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
                    project_analysis JSONB,
                    architecture_analysis JSONB,
                    database_analysis JSONB,
                    git_analysis JSONB,
                    static_analysis JSONB,
                    security_analysis JSONB,
                    raw_repository JSONB,
                    analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_analysis_results_repo_id ON analysis_results(repository_id);
                CREATE INDEX IF NOT EXISTS idx_analysis_results_analyzed_at ON analysis_results(analyzed_at DESC);

                CREATE TABLE IF NOT EXISTS analyzed_files (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
                    analysis_id UUID NOT NULL REFERENCES analysis_results(id) ON DELETE CASCADE,
                    path TEXT NOT NULL,
                    language TEXT NOT NULL,
                    type TEXT NOT NULL,
                    area TEXT NOT NULL,
                    imports JSONB NOT NULL DEFAULT '[]'::jsonb,
                    structure JSONB NOT NULL DEFAULT '{}'::jsonb,
                    content TEXT,
                    size INTEGER,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_analyzed_files_repo_id ON analyzed_files(repository_id);
                CREATE INDEX IF NOT EXISTS idx_analyzed_files_analysis_id ON analyzed_files(analysis_id);
                CREATE INDEX IF NOT EXISTS idx_analyzed_files_path ON analyzed_files(repository_id, path);

                CREATE TABLE IF NOT EXISTS dependencies (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
                    analysis_id UUID NOT NULL REFERENCES analysis_results(id) ON DELETE CASCADE,
                    from_file TEXT NOT NULL,
                    to_file TEXT NOT NULL,
                    source TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_dependencies_repo_id ON dependencies(repository_id);
                CREATE INDEX IF NOT EXISTS idx_dependencies_analysis_id ON dependencies(analysis_id);

                CREATE TABLE IF NOT EXISTS api_endpoints (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
                    analysis_id UUID NOT NULL REFERENCES analysis_results(id) ON DELETE CASCADE,
                    method TEXT NOT NULL,
                    path TEXT NOT NULL,
                    file TEXT NOT NULL,
                    line INTEGER NOT NULL,
                    framework TEXT NOT NULL,
                    handler TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_api_endpoints_repo_id ON api_endpoints(repository_id);
                CREATE INDEX IF NOT EXISTS idx_api_endpoints_analysis_id ON api_endpoints(analysis_id);

                CREATE TABLE IF NOT EXISTS code_flows (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
                    analysis_id UUID NOT NULL REFERENCES analysis_results(id) ON DELETE CASCADE,
                    entry_point TEXT NOT NULL,
                    route TEXT NOT NULL,
                    handler TEXT,
                    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_code_flows_repo_id ON code_flows(repository_id);
                CREATE INDEX IF NOT EXISTS idx_code_flows_analysis_id ON code_flows(analysis_id);

                CREATE TABLE IF NOT EXISTS static_issues (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
                    analysis_id UUID NOT NULL REFERENCES analysis_results(id) ON DELETE CASCADE,
                    rule TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    message TEXT NOT NULL,
                    file TEXT NOT NULL,
                    line INTEGER NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_static_issues_repo_id ON static_issues(repository_id);
                CREATE INDEX IF NOT EXISTS idx_static_issues_analysis_id ON static_issues(analysis_id);

                CREATE TABLE IF NOT EXISTS security_issues (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
                    analysis_id UUID NOT NULL REFERENCES analysis_results(id) ON DELETE CASCADE,
                    rule TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    message TEXT NOT NULL,
                    file TEXT NOT NULL,
                    line INTEGER NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_security_issues_repo_id ON security_issues(repository_id);
                CREATE INDEX IF NOT EXISTS idx_security_issues_analysis_id ON security_issues(analysis_id);

                CREATE TABLE IF NOT EXISTS code_chunks (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
                    analysis_id UUID NOT NULL REFERENCES analysis_results(id) ON DELETE CASCADE,
                    file_path TEXT NOT NULL,
                    language TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    symbol_type TEXT NOT NULL,
                    start_line INTEGER NOT NULL,
                    end_line INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    content_hash TEXT,
                    embedding vector(1536),
                    embedding_model TEXT,
                    embedded_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT uq_code_chunks_analysis_file_symbol_lines UNIQUE (analysis_id, file_path, symbol, symbol_type, start_line, end_line)
                );

                CREATE INDEX IF NOT EXISTS idx_code_chunks_analysis_id ON code_chunks(analysis_id);
                CREATE INDEX IF NOT EXISTS idx_code_chunks_file_path ON code_chunks(analysis_id, file_path);
                CREATE INDEX IF NOT EXISTS idx_code_chunks_repo_id ON code_chunks(repository_id);
                CREATE INDEX IF NOT EXISTS idx_code_chunks_embedding_cosine ON code_chunks USING hnsw (embedding vector_cosine_ops);
            `;
        }

        const pool = getPool();
        await pool.query(sql);

        // Migrations / column checks for existing deployments
        await pool.query(`
            CREATE EXTENSION IF NOT EXISTS vector;
            ALTER TABLE code_chunks ADD COLUMN IF NOT EXISTS content_hash TEXT;
            ALTER TABLE code_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536);
            ALTER TABLE code_chunks ADD COLUMN IF NOT EXISTS embedding_model TEXT;
            ALTER TABLE code_chunks ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;
            ALTER TABLE analyzed_files ADD COLUMN IF NOT EXISTS content TEXT;
            ALTER TABLE analyzed_files ADD COLUMN IF NOT EXISTS size INTEGER;
            CREATE UNIQUE INDEX IF NOT EXISTS uq_code_chunks_analysis_file_symbol_lines ON code_chunks (analysis_id, file_path, symbol, symbol_type, start_line, end_line);
            CREATE INDEX IF NOT EXISTS idx_code_chunks_embedding_cosine ON code_chunks USING hnsw (embedding vector_cosine_ops);
        `);

        console.log("Database schema initialized successfully.");
    } catch (error) {
        console.error("Database initialization failed:", error);
    }
}
