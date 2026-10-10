import { getPool } from "../client";
import {
    FullAnalysisResult,
    StoredRepository,
    AnalyzedFileDTO,
    AnalyzedFileSummaryDTO,
    AnalyzedFileContentDTO,
    CodeChunk,
    VectorSearchResult,
    StoredCodeFlow,
    GitAnalysis
} from "../../types/database";
import {
    computeContentHash,
    formatChunkForEmbedding
} from "../../services/embeddingService";

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
    chunks?: CodeChunk[]
): Promise<string> {
    const pool = getPool();
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

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
                analyzed_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
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
            JSON.stringify(analysis.repository)
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

    // Get latest analysis record
    const analysisRes = await pool.query(
        `SELECT * FROM analysis_results 
         WHERE repository_id = $1 
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
        dependencies: dependenciesRes.rows
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
         WHERE repository_id = $1 
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

export async function searchSimilarChunksByVector(
    repositoryId: string,
    queryEmbedding: number[],
    limit: number = 8
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
    const vectorStr = `[${queryEmbedding.join(",")}]`;

    // 2. Perform cosine similarity vector search
    const query = `
        SELECT
            id,
            repository_id as "repositoryId",
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
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector ASC
        LIMIT $3;
    `;

    const result = await pool.query(query, [vectorStr, resolvedRepoId, limit]);
    return result.rows.map((row) => ({
        id: row.id,
        repositoryId: row.repositoryId,
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
    repositoryId: string
): Promise<{ exists: boolean; hasEmbeddings: boolean; repoId?: string }> {
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

    const countRes = await pool.query(
        `SELECT COUNT(*) as count 
         FROM code_chunks 
         WHERE repository_id = $1 AND embedding IS NOT NULL`,
        [resolvedRepoId]
    );

    const count = parseInt(countRes.rows[0].count || "0", 10);
    return { exists: true, hasEmbeddings: count > 0, repoId: resolvedRepoId };
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

    // Get latest analysis ID
    const analysisRes = await pool.query(
        `SELECT id FROM analysis_results 
         WHERE repository_id = $1 
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
         WHERE repository_id = $1 
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
         WHERE repository_id = $1 
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

