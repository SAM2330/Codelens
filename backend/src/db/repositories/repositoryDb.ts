import { getPool } from "../client";
import {
    FullAnalysisResult,
    StoredRepository,
    AnalyzedFileDTO,
    AnalyzedFileSummaryDTO,
    AnalyzedFileContentDTO,
    CodeChunk,
    VectorSearchResult,
    ExactSearchResult,
    KeywordSearchResult,
    StoredCodeFlow,
    GitAnalysis
} from "../../types/database";
import {
    computeContentHash,
    formatChunkForEmbedding
} from "../../services/embeddingService";
import {
    extractExactSearchTerms,
    scoreAndRankExactCandidates
} from "../../services/exactSearchService";

export interface UpsertRepositoryInput {
    githubId: number;
    owner: string;
    name: string;
    fullName: string;
    githubUrl: string;
    defaultBranch: string;
    description: string | null;
}

export async function upsertRepository(
    input: UpsertRepositoryInput
): Promise<StoredRepository> {
    const pool = getPool();
    const query = `
        INSERT INTO repositories (
            github_id,
            owner,
            name,
            full_name,
            github_url,
            default_branch,
            description,
            created_at,
            updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (github_id) DO UPDATE SET
            owner = EXCLUDED.owner,
            name = EXCLUDED.name,
            full_name = EXCLUDED.full_name,
            github_url = EXCLUDED.github_url,
            default_branch = EXCLUDED.default_branch,
            description = EXCLUDED.description,
            updated_at = NOW()
        RETURNING
            id,
            github_id,
            owner,
            name,
            full_name,
            github_url,
            default_branch,
            description,
            created_at,
            updated_at;
    `;

    const values = [
        input.githubId,
        input.owner,
        input.name,
        input.fullName,
        input.githubUrl,
        input.defaultBranch,
        input.description
    ];

    const result = await pool.query<StoredRepository>(query, values);
    return result.rows[0];
}

export async function saveAnalysis(
    repositoryId: string,
    analysis: FullAnalysisResult,
    chunks?: CodeChunk[],
    metadata?: {
        commitSha?: string;
        status?: string;
        indexingVersion?: string;
    }
): Promise<string> {
    const pool = getPool();
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const commitSha =
            metadata?.commitSha ||
            (analysis.git as any)?.commits?.[0]?.sha ||
            (analysis.repository as any)?.default_branch_sha ||
            "head";
        const status = metadata?.status || "completed";
        const indexingVersion = metadata?.indexingVersion || "1.0";

        // 1. Insert analysis result record
        const analysisResultQuery = `
            INSERT INTO analysis_results (
                repository_id,
                project_analysis,
                architecture_analysis,
                database_analysis,
                git_analysis,
                static_analysis,
                security_analysis,
                raw_repository,
                commit_sha,
                status,
                indexing_version,
                analyzed_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            RETURNING id;
        `;

        const analysisValues = [
            repositoryId,
            JSON.stringify(analysis.project),
            JSON.stringify(analysis.architecture),
            JSON.stringify(analysis.database),
            JSON.stringify(analysis.git),
            JSON.stringify(analysis.static),
            JSON.stringify(analysis.security),
            JSON.stringify(analysis.repository),
            commitSha,
            status,
            indexingVersion
        ];

        const analysisRes = await client.query<{ id: string }>(
            analysisResultQuery,
            analysisValues
        );
        const analysisId = analysisRes.rows[0].id;

        // 2. Insert analyzed files
        if (analysis.files && analysis.files.length > 0) {
            for (const file of analysis.files) {
                const fileSize =
                    typeof file.size === "number"
                        ? file.size
                        : file.content
                        ? Buffer.byteLength(file.content, "utf-8")
                        : 0;

                await client.query(
                    `INSERT INTO analyzed_files (
                        repository_id,
                        analysis_id,
                        path,
                        language,
                        type,
                        area,
                        imports,
                        structure,
                        content,
                        size
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [
                        repositoryId,
                        analysisId,
                        file.path,
                        file.language,
                        file.type,
                        file.area,
                        JSON.stringify(file.imports || []),
                        JSON.stringify(file.structure || {}),
                        file.content || null,
                        fileSize
                    ]
                );
            }
        }

        // 3. Insert dependencies
        if (analysis.dependencies && analysis.dependencies.length > 0) {
            for (const dep of analysis.dependencies) {
                await client.query(
                    `INSERT INTO dependencies (
                        repository_id,
                        analysis_id,
                        from_file,
                        to_file,
                        source
                    ) VALUES ($1, $2, $3, $4, $5)`,
                    [
                        repositoryId,
                        analysisId,
                        dep.from,
                        dep.to,
                        dep.source
                    ]
                );
            }
        }

        // 4. Insert API endpoints
        if (analysis.api?.endpoints && analysis.api.endpoints.length > 0) {
            for (const ep of analysis.api.endpoints) {
                await client.query(
                    `INSERT INTO api_endpoints (
                        repository_id,
                        analysis_id,
                        method,
                        path,
                        file,
                        line,
                        framework,
                        handler
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        repositoryId,
                        analysisId,
                        ep.method,
                        ep.path,
                        ep.file,
                        ep.line,
                        ep.framework,
                        ep.handler || null
                    ]
                );
            }
        }

        // 5. Insert code flows
        if (analysis.codeFlows && analysis.codeFlows.length > 0) {
            for (const flow of analysis.codeFlows) {
                await client.query(
                    `INSERT INTO code_flows (
                        repository_id,
                        analysis_id,
                        entry_point,
                        route,
                        handler,
                        steps
                    ) VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        repositoryId,
                        analysisId,
                        flow.entryPoint,
                        flow.route,
                        flow.handler || null,
                        JSON.stringify(flow.steps || [])
                    ]
                );
            }
        }

        // 6. Insert static issues
        if (analysis.static?.issues && analysis.static.issues.length > 0) {
            for (const issue of analysis.static.issues) {
                await client.query(
                    `INSERT INTO static_issues (
                        repository_id,
                        analysis_id,
                        rule,
                        severity,
                        message,
                        file,
                        line
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        repositoryId,
                        analysisId,
                        issue.rule,
                        issue.severity,
                        issue.message,
                        issue.file,
                        issue.line
                    ]
                );
            }
        }

        // 7. Insert security issues
        if (analysis.security?.issues && analysis.security.issues.length > 0) {
            for (const issue of analysis.security.issues) {
                await client.query(
                    `INSERT INTO security_issues (
                        repository_id,
                        analysis_id,
                        rule,
                        severity,
                        message,
                        file,
                        line
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        repositoryId,
                        analysisId,
                        issue.rule,
                        issue.severity,
                        issue.message,
                        issue.file,
                        issue.line
                    ]
                );
            }
        }

        // 8. Insert code chunks
        if (chunks && chunks.length > 0) {
            for (const chunk of chunks) {
                const contentHash =
                    chunk.contentHash ||
                    computeContentHash(
                        formatChunkForEmbedding({
                            filePath: chunk.filePath,
                            symbol: chunk.symbol,
                            symbolType: chunk.symbolType,
                            content: chunk.content
                        })
                    );

                await client.query(
                    `INSERT INTO code_chunks (
                        repository_id,
                        analysis_id,
                        file_path,
                        language,
                        symbol,
                        symbol_type,
                        start_line,
                        end_line,
                        content,
                        content_hash
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (analysis_id, file_path, symbol, symbol_type, start_line, end_line)
                    DO UPDATE SET
                        content = EXCLUDED.content,
                        content_hash = EXCLUDED.content_hash,
                        language = EXCLUDED.language`,
                    [
                        repositoryId,
                        analysisId,
                        chunk.filePath,
                        chunk.language,
                        chunk.symbol,
                        chunk.symbolType,
                        chunk.startLine,
                        chunk.endLine,
                        chunk.content,
                        contentHash
                    ]
                );
            }
        }

        // 9. Update repository timestamp
        await client.query(
            "UPDATE repositories SET updated_at = NOW() WHERE id = $1",
            [repositoryId]
        );

        await client.query("COMMIT");
        return analysisId;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function getAllRepositories(): Promise<any[]> {
    const pool = getPool();
    const query = `
        SELECT 
            r.id,
            r.github_id as "githubId",
            r.owner,
            r.name,
            r.full_name as "fullName",
            r.github_url as "githubUrl",
            r.default_branch as "defaultBranch",
            r.description,
            r.created_at as "createdAt",
            r.updated_at as "updatedAt",
            MAX(a.analyzed_at) as "lastAnalyzedAt"
        FROM repositories r
        LEFT JOIN analysis_results a ON r.id = a.repository_id
        GROUP BY r.id
        ORDER BY r.updated_at DESC;
    `;

    const result = await pool.query(query);
    return result.rows;
}

export async function getStoredAnalysisByRepositoryId(
    id: string
): Promise<any | null> {
    const pool = getPool();

    // Check if ID is UUID or github repo id / full name
    const repoRes = await pool.query(
        `SELECT * FROM repositories 
         WHERE id::text = $1 OR full_name = $1 OR github_id::text = $1
         LIMIT 1`,
        [id]
    );

    if (repoRes.rows.length === 0) {
        return null;
    }

    const repository = repoRes.rows[0];
    const repositoryId = repository.id;

    // Get latest completed analysis record
    const analysisRes = await pool.query(
        `SELECT * FROM analysis_results 
         WHERE repository_id = $1 AND (status IS NULL OR status = 'completed')
         ORDER BY analyzed_at DESC 
         LIMIT 1`,
        [repositoryId]
    );

    if (analysisRes.rows.length === 0) {
        return {
            id: repository.id,
            repository: {
                id: repository.github_id,
                owner: repository.owner,
                name: repository.name,
                full_name: repository.full_name,
                html_url: repository.github_url,
                default_branch: repository.default_branch,
                description: repository.description
            },
            message: "Repository found, but no analysis results available."
        };
    }

    const latestAnalysis = analysisRes.rows[0];
    const analysisId = latestAnalysis.id;

    // Fetch related rows for this analysis
    const [
        filesRes,
        dependenciesRes,
        apiEndpointsRes,
        codeFlowsRes,
        staticIssuesRes,
        securityIssuesRes
    ] = await Promise.all([
        pool.query(
            `SELECT path, language, type, area, imports, structure 
             FROM analyzed_files 
             WHERE analysis_id = $1 
             ORDER BY path ASC`,
            [analysisId]
        ),
        pool.query(
            `SELECT from_file as "from", to_file as "to", source 
             FROM dependencies 
             WHERE analysis_id = $1`,
            [analysisId]
        ),
        pool.query(
            `SELECT method, path, file, line, framework, handler 
             FROM api_endpoints 
             WHERE analysis_id = $1`,
            [analysisId]
        ),
        pool.query(
            `SELECT entry_point as "entryPoint", route, handler, steps 
             FROM code_flows 
             WHERE analysis_id = $1`,
            [analysisId]
        ),
        pool.query(
            `SELECT rule, severity, message, file, line 
             FROM static_issues 
             WHERE analysis_id = $1`,
            [analysisId]
        ),
        pool.query(
            `SELECT rule, severity, message, file, line 
             FROM security_issues 
             WHERE analysis_id = $1`,
            [analysisId]
        )
    ]);

    const apiAnalysis = {
        endpoints: apiEndpointsRes.rows,
        externalAPIs: latestAnalysis.project_analysis?.libraries || []
    };

    const staticAnalysis = {
        issues: staticIssuesRes.rows,
        summary: latestAnalysis.static_analysis?.summary || {
            total: staticIssuesRes.rows.length,
            low: staticIssuesRes.rows.filter((i: any) => i.severity === "low").length,
            medium: staticIssuesRes.rows.filter((i: any) => i.severity === "medium").length,
            high: staticIssuesRes.rows.filter((i: any) => i.severity === "high").length
        }
    };

    const securityAnalysis = {
        issues: securityIssuesRes.rows,
        summary: latestAnalysis.security_analysis?.summary || {
            total: securityIssuesRes.rows.length,
            low: securityIssuesRes.rows.filter((i: any) => i.severity === "low").length,
            medium: securityIssuesRes.rows.filter((i: any) => i.severity === "medium").length,
            high: securityIssuesRes.rows.filter((i: any) => i.severity === "high").length
        }
    };

    return {
        id: repository.id,
        analyzedAt: latestAnalysis.analyzed_at,
        repository: latestAnalysis.raw_repository || {
            id: repository.github_id,
            owner: repository.owner,
            name: repository.name,
            full_name: repository.full_name,
            html_url: repository.github_url,
            default_branch: repository.default_branch,
            description: repository.description
        },
        project: latestAnalysis.project_analysis,
        architecture: latestAnalysis.architecture_analysis,
        api: apiAnalysis,
        database: latestAnalysis.database_analysis,
        codeFlows: codeFlowsRes.rows,
        git: latestAnalysis.git_analysis,
        static: staticAnalysis,
        security: securityAnalysis,
        files: filesRes.rows,
        dependencies: dependenciesRes.rows,
        commitSha: latestAnalysis.commit_sha || null,
        status: latestAnalysis.status || "completed",
        indexingVersion: latestAnalysis.indexing_version || "1.0",
        isPrivate: repository.is_private || false
    };
}

export async function getStoredGitAnalysisByRepositoryId(
    id: string
): Promise<{ repositoryId: string; git: GitAnalysis | null } | null> {
    const pool = getPool();

    const repoRes = await pool.query(
        `SELECT id FROM repositories 
         WHERE id::text = $1 OR full_name = $1 OR github_id::text = $1
         LIMIT 1`,
        [id]
    );

    if (repoRes.rows.length === 0) {
        return null;
    }

    const repositoryId = repoRes.rows[0].id;

    const analysisRes = await pool.query(
        `SELECT git_analysis FROM analysis_results 
         WHERE repository_id = $1 AND (status IS NULL OR status = 'completed')
         ORDER BY analyzed_at DESC 
         LIMIT 1`,
        [repositoryId]
    );

    if (analysisRes.rows.length === 0) {
        return { repositoryId, git: null };
    }

    return {
        repositoryId,
        git: analysisRes.rows[0].git_analysis || null
    };
}

export async function getChunksByRepositoryId(
    id: string
): Promise<CodeChunk[] | null> {
    const pool = getPool();

    const repoRes = await pool.query(
        `SELECT id FROM repositories 
         WHERE id::text = $1 OR full_name = $1 OR github_id::text = $1
         LIMIT 1`,
        [id]
    );

    if (repoRes.rows.length === 0) {
        return null;
    }

    const repositoryId = repoRes.rows[0].id;

    const analysisRes = await pool.query(
        `SELECT id FROM analysis_results 
         WHERE repository_id = $1 
         ORDER BY analyzed_at DESC 
         LIMIT 1`,
        [repositoryId]
    );

    if (analysisRes.rows.length === 0) {
        return [];
    }

    const analysisId = analysisRes.rows[0].id;

    const chunksRes = await pool.query(
        `SELECT 
            id,
            repository_id as "repositoryId",
            analysis_id as "analysisId",
            file_path as "filePath",
            language,
            symbol,
            symbol_type as "symbolType",
            start_line as "startLine",
            end_line as "endLine",
            content,
            content_hash as "contentHash",
            embedding_model as "embeddingModel",
            embedded_at as "embeddedAt",
            (embedding IS NOT NULL) as "hasEmbedding",
            created_at as "createdAt"
         FROM code_chunks
         WHERE analysis_id = $1
         ORDER BY file_path ASC, start_line ASC`,
        [analysisId]
    );

    return chunksRes.rows;
}

export async function getChunksWithoutEmbeddings(
    repositoryId: string
): Promise<CodeChunk[]> {
    const pool = getPool();

    // Check if ID is UUID or github repo id / full name
    const repoRes = await pool.query(
        `SELECT id FROM repositories 
         WHERE id::text = $1 OR full_name = $1 OR github_id::text = $1
         LIMIT 1`,
        [repositoryId]
    );

    if (repoRes.rows.length === 0) {
        return [];
    }

    const resolvedRepoId = repoRes.rows[0].id;

    const analysisRes = await pool.query(
        `SELECT id FROM analysis_results 
         WHERE repository_id = $1 
         ORDER BY analyzed_at DESC 
         LIMIT 1`,
        [resolvedRepoId]
    );

    if (analysisRes.rows.length === 0) {
        return [];
    }

    const analysisId = analysisRes.rows[0].id;

    const chunksRes = await pool.query(
        `SELECT 
            id,
            repository_id as "repositoryId",
            analysis_id as "analysisId",
            file_path as "filePath",
            language,
            symbol,
            symbol_type as "symbolType",
            start_line as "startLine",
            end_line as "endLine",
            content,
            content_hash as "contentHash",
            created_at as "createdAt"
         FROM code_chunks
         WHERE analysis_id = $1 AND embedding IS NULL
         ORDER BY file_path ASC, start_line ASC`,
        [analysisId]
    );

    return chunksRes.rows;
}

export async function saveChunkEmbeddings(
    embeddings: {
        id: string;
        embedding: number[];
        contentHash: string;
        model: string;
    }[]
): Promise<number> {
    if (embeddings.length === 0) {
        return 0;
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        for (const item of embeddings) {
            const vectorStr = `[${item.embedding.join(",")}]`;
            await client.query(
                `UPDATE code_chunks 
                 SET embedding = $1::vector,
                     embedding_model = $2,
                     content_hash = $3,
                     embedded_at = NOW()
                 WHERE id = $4`,
                [vectorStr, item.model, item.contentHash, item.id]
            );
        }

        await client.query("COMMIT");
        return embeddings.length;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function getActiveAnalysisId(
    repositoryId: string
): Promise<string | null> {
    const pool = getPool();

    const repoRes = await pool.query(
        `SELECT id FROM repositories 
         WHERE id::text = $1 OR full_name = $1 OR github_id::text = $1
         LIMIT 1`,
        [repositoryId]
    );

    if (repoRes.rows.length === 0) {
        return null;
    }

    const resolvedRepoId = repoRes.rows[0].id;

    // Get latest completed analysis record
    const analysisRes = await pool.query(
        `SELECT id FROM analysis_results 
         WHERE repository_id = $1 AND (status IS NULL OR status = 'completed')
         ORDER BY analyzed_at DESC 
         LIMIT 1`,
        [resolvedRepoId]
    );

    if (analysisRes.rows.length > 0) {
        return analysisRes.rows[0].id;
    }

    // Fallback: any analysis result for this repo if none has status completed
    const fallbackRes = await pool.query(
        `SELECT id FROM analysis_results 
         WHERE repository_id = $1 
         ORDER BY analyzed_at DESC 
         LIMIT 1`,
        [resolvedRepoId]
    );

    return fallbackRes.rows[0]?.id || null;
}

export async function searchChunksByExactMetadata(
    repositoryId: string,
    query: string,
    options?: {
        limit?: number;
        analysisId?: string;
    }
): Promise<ExactSearchResult[]> {
    const pool = getPool();

    const repoRes = await pool.query(
        `SELECT id FROM repositories 
         WHERE id::text = $1 OR full_name = $1 OR github_id::text = $1
         LIMIT 1`,
        [repositoryId]
    );

    if (repoRes.rows.length === 0) {
        return [];
    }

    const resolvedRepoId = repoRes.rows[0].id;
    const terms = extractExactSearchTerms(query);

    if (terms.symbols.length === 0 && terms.filePaths.length === 0) {
        return [];
    }

    const activeAnalysisId =
        options?.analysisId || (await getActiveAnalysisId(resolvedRepoId));

    // Prepare search patterns
    const exactSymbols = terms.symbols.map((s) => s.toLowerCase());
    const methodPatterns = terms.symbols.map((s) => `%.${s.toLowerCase()}`);
    const classPrefixPatterns = terms.symbols.map((s) => `${s.toLowerCase()}.%`);
    const allSymbolPatterns = [...methodPatterns, ...classPrefixPatterns];

    const exactPaths = terms.filePaths.map((f) => f.toLowerCase());
    const pathSuffixPatterns = terms.filePaths.map((f) => `%/${f.toLowerCase()}`);

    const partialSymbols = terms.symbols
        .filter((s) => s.length >= 3)
        .map((s) => `%${s.toLowerCase()}%`);

    const limit = Math.max(1, Math.min(options?.limit ?? 12, 30));

    // Execute query with active analysis isolation if available
    const sql = `
        SELECT
            id,
            repository_id as "repositoryId",
            analysis_id as "analysisId",
            file_path as "filePath",
            language,
            symbol,
            symbol_type as "symbolType",
            start_line as "startLine",
            end_line as "endLine",
            content
        FROM code_chunks
        WHERE repository_id = $1
          AND ($2::uuid IS NULL OR analysis_id = $2::uuid)
          AND (
              LOWER(symbol) = ANY($3::text[])
              OR LOWER(symbol) LIKE ANY($4::text[])
              OR LOWER(file_path) = ANY($5::text[])
              OR LOWER(file_path) LIKE ANY($6::text[])
              OR (cardinality($7::text[]) > 0 AND LOWER(symbol) LIKE ANY($7::text[]))
          )
        LIMIT $8;
    `;

    const result = await pool.query(sql, [
        resolvedRepoId,
        activeAnalysisId,
        exactSymbols,
        allSymbolPatterns,
        exactPaths,
        pathSuffixPatterns,
        partialSymbols,
        limit * 2
    ]);

    return scoreAndRankExactCandidates(result.rows, terms, limit);
}

export async function searchChunksByKeyword(
    repositoryId: string,
    query: string,
    options?: {
        limit?: number;
        analysisId?: string;
    }
): Promise<KeywordSearchResult[]> {
    const pool = getPool();

    const repoRes = await pool.query(
        `SELECT id FROM repositories 
         WHERE id::text = $1 OR full_name = $1 OR github_id::text = $1
         LIMIT 1`,
        [repositoryId]
    );

    if (repoRes.rows.length === 0) {
        return [];
    }

    const resolvedRepoId = repoRes.rows[0].id;
    const cleanQuery = (query || "").trim();
    if (!cleanQuery) {
        return [];
    }

    const activeAnalysisId =
        options?.analysisId || (await getActiveAnalysisId(resolvedRepoId));

    const limit = Math.max(1, Math.min(options?.limit ?? 12, 30));

    // Execute PostgreSQL Full-Text Search strictly scoped to active analysis
    const sql = `
        SELECT
            id,
            repository_id as "repositoryId",
            analysis_id as "analysisId",
            file_path as "filePath",
            language,
            symbol,
            symbol_type as "symbolType",
            start_line as "startLine",
            end_line as "endLine",
            content,
            ts_rank_cd(
                to_tsvector('english', coalesce(symbol, '') || ' ' || coalesce(file_path, '') || ' ' || coalesce(content, '')),
                plainto_tsquery('english', $3)
            ) as rank
        FROM code_chunks
        WHERE repository_id = $1
          AND ($2::uuid IS NULL OR analysis_id = $2::uuid)
          AND to_tsvector('english', coalesce(symbol, '') || ' ' || coalesce(file_path, '') || ' ' || coalesce(content, ''))
              @@ plainto_tsquery('english', $3)
        ORDER BY rank DESC, file_path ASC, start_line ASC
        LIMIT $4;
    `;

    try {
        const result = await pool.query(sql, [
            resolvedRepoId,
            activeAnalysisId,
            cleanQuery,
            limit
        ]);

        return result.rows.map((row) => ({
            id: row.id,
            repositoryId: row.repositoryId,
            analysisId: row.analysisId,
            filePath: row.filePath,
            language: row.language,
            symbol: row.symbol,
            symbolType: row.symbolType,
            startLine: row.startLine,
            endLine: row.endLine,
            content: row.content,
            rank: parseFloat(row.rank) || 0
        }));
    } catch (err) {
        console.warn("[KeywordSearch] Full text search query error:", err);
        return [];
    }
}

export async function searchSimilarChunksByVector(
    repositoryId: string,
    queryEmbedding: number[],
    limit: number = 8,
    analysisId?: string
): Promise<VectorSearchResult[] | null> {
    const pool = getPool();

    // 1. Resolve repository by UUID, full_name, or github_id
    const repoRes = await pool.query(
        `SELECT id FROM repositories 
         WHERE id::text = $1 OR full_name = $1 OR github_id::text = $1
         LIMIT 1`,
        [repositoryId]
    );

    if (repoRes.rows.length === 0) {
        return null;
    }

    const resolvedRepoId = repoRes.rows[0].id;
    const activeAnalysisId =
        analysisId || (await getActiveAnalysisId(resolvedRepoId));
    const vectorStr = `[${queryEmbedding.join(",")}]`;

    // 2. Perform cosine similarity vector search scoped to active analysis
    const query = `
        SELECT
            id,
            repository_id as "repositoryId",
            analysis_id as "analysisId",
            file_path as "filePath",
            language,
            symbol,
            symbol_type as "symbolType",
            start_line as "startLine",
            end_line as "endLine",
            content,
            (1 - (embedding <=> $1::vector)) AS similarity
        FROM code_chunks
        WHERE repository_id = $2
          AND ($4::uuid IS NULL OR analysis_id = $4::uuid)
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector ASC
        LIMIT $3;
    `;

    const result = await pool.query(query, [
        vectorStr,
        resolvedRepoId,
        limit,
        activeAnalysisId
    ]);

    return result.rows.map((row) => ({
        id: row.id,
        repositoryId: row.repositoryId,
        analysisId: row.analysisId,
        filePath: row.filePath,
        language: row.language,
        symbol: row.symbol,
        symbolType: row.symbolType,
        startLine: row.startLine,
        endLine: row.endLine,
        content: row.content,
        similarity: parseFloat(row.similarity)
    }));
}

export async function hasEmbeddedChunksForRepository(
    repositoryId: string,
    analysisId?: string
): Promise<{ exists: boolean; hasEmbeddings: boolean; repoId?: string; activeAnalysisId?: string }> {
    const pool = getPool();

    const repoRes = await pool.query(
        `SELECT id FROM repositories 
         WHERE id::text = $1 OR full_name = $1 OR github_id::text = $1
         LIMIT 1`,
        [repositoryId]
    );

    if (repoRes.rows.length === 0) {
        return { exists: false, hasEmbeddings: false };
    }

    const resolvedRepoId = repoRes.rows[0].id;
    const resolvedAnalysisId =
        analysisId || (await getActiveAnalysisId(resolvedRepoId)) || undefined;

    // Check count for active analysis first if present
    if (resolvedAnalysisId) {
        const countRes = await pool.query(
            `SELECT COUNT(*) as count 
             FROM code_chunks 
             WHERE repository_id = $1 AND analysis_id = $2 AND embedding IS NOT NULL`,
            [resolvedRepoId, resolvedAnalysisId]
        );
        const count = parseInt(countRes.rows[0].count || "0", 10);
        return {
            exists: true,
            hasEmbeddings: count > 0,
            repoId: resolvedRepoId,
            activeAnalysisId: resolvedAnalysisId
        };
    }

    // Fallback: check across whole repository only if no analysis was found
    const countRes = await pool.query(
        `SELECT COUNT(*) as count 
         FROM code_chunks 
         WHERE repository_id = $1 AND embedding IS NOT NULL`,
        [resolvedRepoId]
    );

    const count = parseInt(countRes.rows[0].count || "0", 10);
    return {
        exists: true,
        hasEmbeddings: count > 0,
        repoId: resolvedRepoId,
        activeAnalysisId: resolvedAnalysisId
    };
}

export async function getStoredCodeFlowsByRepositoryId(
    repositoryId: string
): Promise<{ repositoryId: string; flows: StoredCodeFlow[] } | null> {
    const pool = getPool();

    const repoRes = await pool.query(
        `SELECT id FROM repositories 
         WHERE id::text = $1 OR full_name = $1 OR github_id::text = $1
         LIMIT 1`,
        [repositoryId]
    );

    if (repoRes.rows.length === 0) {
        return null;
    }

    const resolvedRepoId = repoRes.rows[0].id;

    // Get latest completed analysis ID
    const analysisRes = await pool.query(
        `SELECT id FROM analysis_results 
         WHERE repository_id = $1 AND (status IS NULL OR status = 'completed')
         ORDER BY analyzed_at DESC 
         LIMIT 1`,
        [resolvedRepoId]
    );

    if (analysisRes.rows.length === 0) {
        return { repositoryId: resolvedRepoId, flows: [] };
    }

    const analysisId = analysisRes.rows[0].id;

    const flowsRes = await pool.query(
        `SELECT id, repository_id as "repositoryId", analysis_id as "analysisId", 
                entry_point as "entryPoint", route, handler, steps, created_at as "createdAt"
         FROM code_flows 
         WHERE analysis_id = $1 
         ORDER BY route ASC`,
        [analysisId]
    );

    const flows: StoredCodeFlow[] = flowsRes.rows.map((row) => ({
        id: row.id,
        repositoryId: row.repositoryId,
        analysisId: row.analysisId,
        entryPoint: row.entryPoint,
        route: row.route,
        handler: row.handler,
        steps: Array.isArray(row.steps) ? row.steps : [],
        createdAt: row.createdAt
    }));

    return { repositoryId: resolvedRepoId, flows };
}

export async function getStoredCodeFlowById(
    repositoryId: string,
    flowId: string
): Promise<{ repositoryId: string; flow: StoredCodeFlow | null } | null> {
    const pool = getPool();

    const repoRes = await pool.query(
        `SELECT id FROM repositories 
         WHERE id::text = $1 OR full_name = $1 OR github_id::text = $1
         LIMIT 1`,
        [repositoryId]
    );

    if (repoRes.rows.length === 0) {
        return null;
    }

    const resolvedRepoId = repoRes.rows[0].id;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(flowId);

    const flowRes = isUuid
        ? await pool.query(
              `SELECT id, repository_id as "repositoryId", analysis_id as "analysisId", 
                      entry_point as "entryPoint", route, handler, steps, created_at as "createdAt"
               FROM code_flows 
               WHERE repository_id = $1 AND id = $2
               LIMIT 1`,
              [resolvedRepoId, flowId]
          )
        : await pool.query(
              `SELECT id, repository_id as "repositoryId", analysis_id as "analysisId", 
                      entry_point as "entryPoint", route, handler, steps, created_at as "createdAt"
               FROM code_flows 
               WHERE repository_id = $1 AND route = $2
               LIMIT 1`,
              [resolvedRepoId, flowId]
          );

    if (flowRes.rows.length === 0) {
        return { repositoryId: resolvedRepoId, flow: null };
    }

    const row = flowRes.rows[0];
    const flow: StoredCodeFlow = {
        id: row.id,
        repositoryId: row.repositoryId,
        analysisId: row.analysisId,
        entryPoint: row.entryPoint,
        route: row.route,
        handler: row.handler,
        steps: Array.isArray(row.steps) ? row.steps : [],
        createdAt: row.createdAt
    };

    return { repositoryId: resolvedRepoId, flow };
}

export async function getStoredAnalyzedFilesByRepositoryId(
    repositoryId: string
): Promise<AnalyzedFileSummaryDTO[] | null> {
    const pool = getPool();

    const repoRes = await pool.query(
        `SELECT id FROM repositories 
         WHERE id::text = $1 OR full_name = $1 OR github_id::text = $1
         LIMIT 1`,
        [repositoryId]
    );

    if (repoRes.rows.length === 0) {
        return null;
    }

    const resolvedRepoId = repoRes.rows[0].id;

    const analysisRes = await pool.query(
        `SELECT id FROM analysis_results 
         WHERE repository_id = $1 AND (status IS NULL OR status = 'completed')
         ORDER BY analyzed_at DESC 
         LIMIT 1`,
        [resolvedRepoId]
    );

    if (analysisRes.rows.length === 0) {
        return [];
    }

    const analysisId = analysisRes.rows[0].id;

    const filesRes = await pool.query(
        `SELECT path, language, COALESCE(size, LENGTH(content), 0) as size 
         FROM analyzed_files 
         WHERE analysis_id = $1 
         ORDER BY path ASC`,
        [analysisId]
    );

    return filesRes.rows.map((row) => ({
        path: row.path,
        language: row.language,
        size: Number(row.size || 0)
    }));
}

export async function getStoredAnalyzedFileByPath(
    repositoryId: string,
    filePath: string
): Promise<{ notFoundRepo?: boolean; notFoundFile?: boolean; file?: AnalyzedFileContentDTO }> {
    const pool = getPool();

    const repoRes = await pool.query(
        `SELECT id FROM repositories 
         WHERE id::text = $1 OR full_name = $1 OR github_id::text = $1
         LIMIT 1`,
        [repositoryId]
    );

    if (repoRes.rows.length === 0) {
        return { notFoundRepo: true };
    }

    const resolvedRepoId = repoRes.rows[0].id;

    const analysisRes = await pool.query(
        `SELECT id FROM analysis_results 
         WHERE repository_id = $1 AND (status IS NULL OR status = 'completed')
         ORDER BY analyzed_at DESC 
         LIMIT 1`,
        [resolvedRepoId]
    );

    if (analysisRes.rows.length === 0) {
        return { notFoundFile: true };
    }

    const analysisId = analysisRes.rows[0].id;
    const normalizedTarget = filePath.replace(/\\/g, "/");

    const fileRes = await pool.query(
        `SELECT path, language, content, COALESCE(size, LENGTH(content), 0) as size 
         FROM analyzed_files 
         WHERE analysis_id = $1 AND (path = $2 OR path = $3 OR LOWER(path) = LOWER($2) OR LOWER(path) = LOWER($3))
         LIMIT 1`,
        [analysisId, filePath, normalizedTarget]
    );

    if (fileRes.rows.length > 0) {
        const row = fileRes.rows[0];
        let content = row.content;

        // If content was not stored in legacy row, attempt recovery from code chunks
        if (content === null || content === undefined) {
            const chunksRes = await pool.query(
                `SELECT content, start_line, end_line, symbol_type 
                 FROM code_chunks 
                 WHERE analysis_id = $1 AND (file_path = $2 OR file_path = $3)
                 ORDER BY start_line ASC`,
                [analysisId, row.path, normalizedTarget]
            );
            if (chunksRes.rows.length > 0) {
                const fileChunk = chunksRes.rows.find(
                    (c) => c.symbol_type === "file" && c.start_line === 1
                );
                if (fileChunk) {
                    content = fileChunk.content;
                } else {
                    content = chunksRes.rows.map((c) => c.content).join("\n\n");
                }
            } else {
                content = "";
            }
        }

        return {
            file: {
                path: row.path,
                language: row.language,
                content: content || "",
                size: Number(row.size || Buffer.byteLength(content || "", "utf-8"))
            }
        };
    }

    return { notFoundFile: true };
}

/**
 * Searches for a completed analysis matching repository full name, commit SHA, and indexing version.
 * Returns the full analysis payload if a valid cache hit exists.
 */
export async function findCompletedAnalysisByCommit(
    fullName: string,
    commitSha: string,
    indexingVersion: string = "1.0"
): Promise<any | null> {
    const pool = getPool();

    const query = `
        SELECT 
            r.id as repo_id,
            r.full_name,
            r.is_private,
            a.id as analysis_id,
            a.commit_sha,
            a.status,
            a.indexing_version,
            a.analyzed_at
        FROM repositories r
        JOIN analysis_results a ON r.id = a.repository_id
        WHERE LOWER(r.full_name) = LOWER($1)
          AND a.commit_sha = $2
          AND a.status = 'completed'
          AND a.indexing_version = $3
        ORDER BY a.analyzed_at DESC
        LIMIT 1;
    `;

    const res = await pool.query(query, [fullName, commitSha, indexingVersion]);

    if (res.rows.length === 0) {
        return null;
    }

    const row = res.rows[0];
    const fullAnalysis = await getStoredAnalysisByRepositoryId(row.repo_id);
    return fullAnalysis;
}

/**
 * Associates an authenticated user with a repository in user_repositories.
 */
export async function linkUserRepository(
    userId: string,
    repositoryId: string,
    role: string = "owner"
): Promise<void> {
    const pool = getPool();
    const query = `
        INSERT INTO user_repositories (user_id, repository_id, role, created_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id, repository_id) 
        DO UPDATE SET role = EXCLUDED.role;
    `;
    await pool.query(query, [userId, repositoryId, role]);
}

/**
 * Retrieves all repositories in a specific authenticated user's workspace.
 * If no userId is provided (guest), returns an empty array to prevent
 * exposing repositories analyzed by other users.
 */
export async function getUserRepositories(userId?: string): Promise<any[]> {
    if (!userId) {
        return [];
    }

    const pool = getPool();
    const query = `
        SELECT 
            r.id,
            r.github_id as "githubId",
            r.owner,
            r.name,
            r.full_name as "fullName",
            r.github_url as "githubUrl",
            r.default_branch as "defaultBranch",
            r.description,
            r.is_private as "isPrivate",
            r.created_at as "createdAt",
            r.updated_at as "updatedAt",
            ur.role as "userRole",
            MAX(a.analyzed_at) as "lastAnalyzedAt"
        FROM user_repositories ur
        JOIN repositories r ON ur.repository_id = r.id
        LEFT JOIN analysis_results a ON r.id = a.repository_id AND (a.status IS NULL OR a.status = 'completed')
        WHERE ur.user_id = $1
        GROUP BY r.id, ur.role
        ORDER BY r.updated_at DESC;
    `;

    const res = await pool.query(query, [userId]);
    return res.rows;
}

/**
 * Checks whether a user has permission to access a repository.
 */
export async function checkUserRepositoryAccess(
    userId?: string,
    repositoryIdOrName?: string
): Promise<{ notFound: boolean; allowed: boolean; repository?: any }> {
    if (!repositoryIdOrName) {
        return { notFound: true, allowed: false };
    }

    const pool = getPool();
    const repoRes = await pool.query(
        `SELECT id, owner, name, full_name, is_private 
         FROM repositories 
         WHERE id::text = $1 OR LOWER(full_name) = LOWER($1) OR github_id::text = $1 
         LIMIT 1`,
        [repositoryIdOrName]
    );

    if (repoRes.rows.length === 0) {
        return { notFound: true, allowed: false };
    }

    const repo = repoRes.rows[0];

    // Public repositories are accessible to anyone
    if (!repo.is_private) {
        return { notFound: false, allowed: true, repository: repo };
    }

    // Private repositories require authenticated user with explicit access grant
    if (!userId) {
        return { notFound: false, allowed: false, repository: repo };
    }

    const accessRes = await pool.query(
        `SELECT role FROM user_repositories 
         WHERE user_id = $1 AND repository_id = $2 
         LIMIT 1`,
        [userId, repo.id]
    );

    if (accessRes.rows.length > 0) {
        return { notFound: false, allowed: true, repository: repo };
    }

    return { notFound: false, allowed: false, repository: repo };
}

/**
 * Fetches user-specific chat messages for a repository.
 */
export async function getUserChatMessages(
    userId: string,
    repositoryId: string
): Promise<any[]> {
    const pool = getPool();
    const query = `
        SELECT 
            id,
            user_id as "userId",
            repository_id as "repositoryId",
            role,
            content,
            citations,
            created_at as "createdAt"
        FROM user_chat_messages
        WHERE user_id = $1 
          AND (repository_id::text = $2 OR repository_id IN (SELECT id FROM repositories WHERE full_name = $2))
        ORDER BY created_at ASC;
    `;
    const res = await pool.query(query, [userId, repositoryId]);
    return res.rows;
}

/**
 * Persists a chat message for an authenticated user.
 */
export async function saveUserChatMessage(
    userId: string,
    repositoryId: string,
    role: "user" | "assistant",
    content: string,
    citations: any[] = []
): Promise<any> {
    const pool = getPool();

    // Resolve repository UUID if full_name was passed
    const repoRes = await pool.query(
        `SELECT id FROM repositories WHERE id::text = $1 OR full_name = $1 LIMIT 1`,
        [repositoryId]
    );

    const actualRepoId = repoRes.rows.length > 0 ? repoRes.rows[0].id : repositoryId;

    const query = `
        INSERT INTO user_chat_messages (
            user_id,
            repository_id,
            role,
            content,
            citations,
            created_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING 
            id,
            user_id as "userId",
            repository_id as "repositoryId",
            role,
            content,
            citations,
            created_at as "createdAt";
    `;

    const res = await pool.query(query, [
        userId,
        actualRepoId,
        role,
        content,
        JSON.stringify(citations || [])
    ]);

    return res.rows[0];
}

/**
 * Deletes all chat messages for a user in a repository.
 */
export async function clearUserChatMessages(
    userId: string,
    repositoryId: string
): Promise<void> {
    const pool = getPool();
    const repoRes = await pool.query(
        `SELECT id FROM repositories WHERE id::text = $1 OR full_name = $1 LIMIT 1`,
        [repositoryId]
    );

    const actualRepoId = repoRes.rows.length > 0 ? repoRes.rows[0].id : repositoryId;

    await pool.query(
        `DELETE FROM user_chat_messages WHERE user_id = $1 AND repository_id = $2`,
        [userId, actualRepoId]
    );
}

