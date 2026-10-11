import { Request, Response } from "express";
import {
    getRepository,
    getLatestCommitSha,
    normalizeGitHubRepo
} from "../services/githubService";
import { downloadRepository } from "../services/repositoryService";
import {
    analyzeFile,
    RepositoryFile,
    shouldAnalyzeFile
} from "../services/repositoryAnalyzer";
import { buildDependencyGraph } from "../services/dependencyAnalyzer";
import { analyzeProject } from "../services/projectAnalyzer";
import { analyzeArchitecture } from "../services/architectureAnalyzer";
import { analyzeAPIs } from "../services/apiAnalyzer";
import { analyzeDatabase } from "../services/databaseAnalyzer";
import { analyzeCodeFlows } from "../services/codeFlowAnalyzer";
import {
    analyzeGitHistory,
    GitAnalysis
} from "../services/gitAnalyzer";
import { analyzeStaticCode } from "../services/staticAnalyzer";
import { analyzeSecurity } from "../services/securityAnalyzer";
import { generateCodeChunks } from "../services/codeChunker";
import {
    generateEmbeddingsForChunks,
    EMBEDDING_MODEL,
    EMBEDDING_DIMENSIONS
} from "../services/embeddingService";
import {
    upsertRepository,
    saveAnalysis,
    getAllRepositories,
    getUserRepositories,
    getStoredAnalysisByRepositoryId,
    getChunksByRepositoryId,
    getChunksWithoutEmbeddings,
    saveChunkEmbeddings,
    getStoredCodeFlowsByRepositoryId,
    getStoredCodeFlowById,
    getStoredAnalyzedFilesByRepositoryId,
    getStoredAnalyzedFileByPath,
    getStoredGitAnalysisByRepositoryId,
    findCompletedAnalysisByCommit,
    linkUserRepository,
    saveUserChatMessage
} from "../db/repositories/repositoryDb";
import { getPool } from "../db/client";
import { searchSimilarChunks } from "../services/vectorSearchService";
import { retrieveContext } from "../services/ragService";
import {
    detectGitHistoryIntent,
    retrieveGitHistoryContext
} from "../services/gitHistoryService";
import {
    generateRepositoryAnswer,
    isRateLimitOrQuotaError,
    isUnavailableOrDemandError
} from "../services/llmService";
import {
    transformFlowToGraph,
    transformFlowsToGraphs
} from "../services/codeFlowGraphService";
import { FullAnalysisResult } from "../types/database";

// In-memory mutex for concurrent repository analysis deduplication
const inFlightAnalyses = new Map<string, Promise<any>>();

export async function analyzeRepository(req: Request, res: Response) {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                message: "GitHub repository URL is required"
            });
        }

        const normalized = normalizeGitHubRepo(url);
        if (!normalized) {
            return res.status(400).json({
                message: "Invalid GitHub repository URL"
            });
        }

        const { owner, repo, fullName } = normalized;
        console.log(`1. Getting repository metadata for ${fullName}...`);
        
        let repository: any;
        try {
            repository = await getRepository(owner, repo);
        } catch (ghErr) {
            console.warn(`[GitHub] Could not fetch remote metadata for ${fullName}, checking database:`, ghErr);
            const pool = getPool();
            const storedRepoRes = await pool.query(
                "SELECT * FROM repositories WHERE LOWER(full_name) = LOWER($1) LIMIT 1",
                [fullName]
            );
            if (storedRepoRes.rows.length > 0) {
                const row = storedRepoRes.rows[0];
                repository = {
                    id: row.github_id,
                    name: row.name,
                    full_name: row.full_name,
                    owner: { login: row.owner },
                    html_url: row.github_url,
                    description: row.description,
                    default_branch: row.default_branch
                };
            } else {
                throw ghErr;
            }
        }

        // Fetch latest commit SHA for repository versioning & caching
        let commitSha = "head";
        try {
            commitSha = await getLatestCommitSha(
                owner,
                repo,
                repository.default_branch || "HEAD"
            );
            console.log(`Commit SHA for ${fullName}@${repository.default_branch}: ${commitSha}`);
        } catch (shaErr) {
            console.warn("Could not fetch remote commit SHA from GitHub, checking stored analysis commit:", shaErr);
            try {
                const pool = getPool();
                const lastShaRes = await pool.query(
                    `SELECT a.commit_sha 
                     FROM analysis_results a
                     JOIN repositories r ON a.repository_id = r.id
                     WHERE LOWER(r.full_name) = LOWER($1) AND a.status = 'completed' AND a.commit_sha IS NOT NULL
                     ORDER BY a.analyzed_at DESC LIMIT 1`,
                    [fullName]
                );
                if (lastShaRes.rows.length > 0 && lastShaRes.rows[0].commit_sha) {
                    commitSha = lastShaRes.rows[0].commit_sha;
                    console.log(`Reusing last known completed commit SHA for ${fullName}: ${commitSha}`);
                }
            } catch (dbErr) {
                console.warn("Could not check stored analysis commit:", dbErr);
            }
        }

        const cacheKey = `${fullName.toLowerCase()}@${commitSha}`;

        // 1. Check for concurrent in-flight analysis
        if (inFlightAnalyses.has(cacheKey)) {
            console.log(`[Shared Cache] Awaiting concurrent in-flight analysis for ${cacheKey}...`);
            const inFlightResult = await inFlightAnalyses.get(cacheKey)!;
            if (req.user) {
                try {
                    await linkUserRepository(req.user.id, inFlightResult.id, "owner");
                    console.log(`[Shared Cache] Associated user ${req.user.id} with repo ${inFlightResult.id}`);
                } catch (linkErr) {
                    console.error("Failed to link repository to user on in-flight analysis:", linkErr);
                }
            }
            return res.json({
                ...inFlightResult,
                cached: true,
                commitSha
            });
        }

        // 2. Check database for existing completed analysis cache hit
        const cachedAnalysis = await findCompletedAnalysisByCommit(fullName, commitSha, "1.0");
        if (cachedAnalysis) {
            console.log(`[Shared Cache Hit] Reusing stored analysis for ${fullName} at commit ${commitSha}`);

            // Associate authenticated user with this repository
            if (req.user) {
                try {
                    await linkUserRepository(req.user.id, cachedAnalysis.id, "owner");
                    console.log(`[Shared Cache Hit] Associated user ${req.user.id} with repo ${cachedAnalysis.id}`);
                } catch (linkErr) {
                    console.error("Failed to link repository to user on cache hit:", linkErr);
                }
            }

            // If any chunks lack embeddings, generate only genuinely missing chunks
            if (process.env.GEMINI_API_KEY) {
                try {
                    const missingChunks = await getChunksWithoutEmbeddings(cachedAnalysis.id);
                    if (missingChunks.length > 0) {
                        console.log(`[Shared Cache Hit] Generating embeddings for ${missingChunks.length} missing chunks...`);
                        const embedResult = await generateEmbeddingsForChunks(
                            missingChunks.map((c) => ({
                                id: c.id!,
                                filePath: c.filePath,
                                symbol: c.symbol,
                                symbolType: c.symbolType,
                                content: c.content,
                                contentHash: c.contentHash
                            }))
                        );
                        await saveChunkEmbeddings(embedResult.embeddings);
                    }
                } catch (embedError) {
                    console.warn("[Shared Cache Hit] Embedding generation for missing chunks deferred:", embedError);
                }
            }

            return res.json({
                ...cachedAnalysis,
                cached: true,
                commitSha
            });
        }

        // 3. Cache Miss: Execute full analysis pipeline
        console.log(`[Shared Cache Miss] Starting fresh analysis for ${fullName} at commit ${commitSha}`);
        console.log("2. Downloading repository...");
        const directory = await downloadRepository(
            owner,
            repo,
            repository.default_branch
        );
        console.log("2. Repository Downloaded");

        const files = directory.files
            .filter((file) => file.type === "File")
            .filter((file) => shouldAnalyzeFile(file.path));

        const repositoryFiles: RepositoryFile[] = await Promise.all(
            files.map(async (file) => {
                const content = await file.buffer();

                return {
                    path: file.path,
                    size: file.uncompressedSize,
                    content: content.toString("utf-8")
                };
            })
        );

        const analyzedFiles = repositoryFiles.map(analyzeFile);
        const dependencies = buildDependencyGraph(analyzedFiles);
        const projectAnalysis = analyzeProject(analyzedFiles);
        const architecture = analyzeArchitecture(
            projectAnalysis,
            analyzedFiles,
            dependencies
        );
        const apiAnalysis = analyzeAPIs(analyzedFiles);

        const databaseAnalysis = analyzeDatabase(analyzedFiles);
        const codeFlows = analyzeCodeFlows(
            analyzedFiles,
            dependencies,
            apiAnalysis
        );
        console.log("4. Starting Git history...");
        let gitAnalysis: GitAnalysis = {
            commits: [],
            contributors: [],
            hotFiles: [],
            recentChanges: []
        };

        try {
            gitAnalysis = await analyzeGitHistory(owner, repo);
            console.log("5. Git history completed");
        } catch (error) {
            console.error("Git history analysis failed:", error);
        }

        console.log("6. Starting static analysis...");
        const staticAnalysis = analyzeStaticCode(analyzedFiles);

        console.log("7. Static analysis completed");
        const securityAnalysis = analyzeSecurity(analyzedFiles);

        console.log("7.5. Generating semantic code chunks...");
        const chunks = generateCodeChunks(analyzedFiles);
        console.log(`Generated ${chunks.length} semantic code chunks.`);

        const formattedFiles = analyzedFiles.map((file) => ({
            path: file.path,
            language: file.language,
            type: file.type,
            area: file.area,
            size: file.size,
            content: file.content,
            imports: file.imports,
            structure: file.structure
        }));

        const analysisPayload: FullAnalysisResult = {
            repository,
            project: projectAnalysis,
            architecture,
            api: apiAnalysis,
            database: databaseAnalysis,
            codeFlows,
            git: gitAnalysis,
            static: staticAnalysis,
            security: securityAnalysis,
            files: formattedFiles,
            dependencies
        };

        // Persist to PostgreSQL / Supabase
        let storedRepoId: string | undefined;
        try {
            console.log("8. Persisting analysis results and code chunks to database...");
            const storedRepo = await upsertRepository({
                githubId: repository.id,
                owner: repository.owner?.login || owner,
                name: repository.name || repo,
                fullName: repository.full_name || `${owner}/${repo}`,
                githubUrl: repository.html_url || url,
                defaultBranch: repository.default_branch || "main",
                description: repository.description || null
            });
            storedRepoId = storedRepo.id;

            await saveAnalysis(storedRepo.id, analysisPayload, chunks, {
                commitSha,
                status: "completed",
                indexingVersion: "1.0"
            });
            console.log("9. Analysis results and code chunks persisted successfully.");

            // Link requesting user if authenticated
            if (req.user) {
                await linkUserRepository(req.user.id, storedRepo.id, "owner");
            }

            // Optional automatic embedding generation if GEMINI_API_KEY is configured
            if (process.env.GEMINI_API_KEY) {
                try {
                    console.log("10. Generating embeddings for new code chunks...");
                    const chunksToEmbed = await getChunksWithoutEmbeddings(storedRepo.id);
                    if (chunksToEmbed.length > 0) {
                        const embedResult = await generateEmbeddingsForChunks(
                            chunksToEmbed.map((c) => ({
                                id: c.id!,
                                filePath: c.filePath,
                                symbol: c.symbol,
                                symbolType: c.symbolType,
                                content: c.content,
                                contentHash: c.contentHash
                            }))
                        );
                        await saveChunkEmbeddings(embedResult.embeddings);
                        console.log(
                            `11. Successfully generated & persisted ${embedResult.embeddings.length} embeddings.`
                        );
                    }
                } catch (embedError) {
                    console.error("Embedding generation failed (analysis preserved):", embedError);
                }
            }
        } catch (dbError) {
            console.error("Failed to persist analysis to database:", dbError);
            // Non-blocking: Still return analysis to client if DB fails or is unconfigured
        }

        return res.json({
            id: storedRepoId,
            ...analysisPayload,
            cached: false,
            commitSha
        });
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            message: "Failed to analyze repository",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export async function getRepositories(req: Request, res: Response) {
    try {
        const repositories = await getUserRepositories(req.user?.id);
        return res.json(repositories);
    } catch (error) {
        console.error("Failed to retrieve repositories:", error);
        return res.status(500).json({
            message: "Failed to retrieve repositories",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export async function getRepositoryById(req: Request, res: Response) {
    try {
        const rawId = req.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;

        if (!id) {
            return res.status(400).json({
                message: "Repository ID is required"
            });
        }

        const data = await getStoredAnalysisByRepositoryId(id);

        if (!data) {
            return res.status(404).json({
                message: `Repository with ID or name '${id}' not found`
            });
        }

        return res.json(data);
    } catch (error) {
        console.error("Failed to retrieve repository analysis:", error);
        return res.status(500).json({
            message: "Failed to retrieve repository analysis",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export async function getRepositoryChunks(req: Request, res: Response) {
    try {
        const rawId = req.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;

        if (!id) {
            return res.status(400).json({
                message: "Repository ID is required"
            });
        }

        const chunks = await getChunksByRepositoryId(id);

        if (chunks === null) {
            return res.status(404).json({
                message: `Repository with ID or name '${id}' not found`
            });
        }

        return res.json(chunks);
    } catch (error) {
        console.error("Failed to retrieve repository chunks:", error);
        return res.status(500).json({
            message: "Failed to retrieve repository chunks",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export async function embedRepositoryChunks(req: Request, res: Response) {
    try {
        const rawId = req.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;

        if (!id) {
            return res.status(400).json({
                message: "Repository ID is required"
            });
        }

        if (!process.env.GEMINI_API_KEY) {
            return res.status(400).json({
                message: "GEMINI_API_KEY is not configured in environment variables. Please set GEMINI_API_KEY to generate embeddings."
            });
        }

        const allChunks = await getChunksByRepositoryId(id);

        if (allChunks === null) {
            return res.status(404).json({
                message: `Repository with ID or name '${id}' not found`
            });
        }

        const totalChunks = allChunks.length;

        if (totalChunks === 0) {
            return res.json({
                repositoryId: id,
                totalChunks: 0,
                embeddedChunks: 0,
                skippedChunks: 0,
                failedChunks: 0,
                model: EMBEDDING_MODEL,
                dimensions: EMBEDDING_DIMENSIONS
            });
        }

        const chunksToEmbed = await getChunksWithoutEmbeddings(id);
        const skippedChunks = totalChunks - chunksToEmbed.length;

        if (chunksToEmbed.length === 0) {
            return res.json({
                repositoryId: id,
                totalChunks,
                embeddedChunks: 0,
                skippedChunks,
                failedChunks: 0,
                model: EMBEDDING_MODEL,
                dimensions: EMBEDDING_DIMENSIONS
            });
        }

        console.log(
            `Generating embeddings for ${chunksToEmbed.length} chunks (skipping ${skippedChunks} already embedded)...`
        );

        const embedResult = await generateEmbeddingsForChunks(
            chunksToEmbed.map((c) => ({
                id: c.id!,
                filePath: c.filePath,
                symbol: c.symbol,
                symbolType: c.symbolType,
                content: c.content,
                contentHash: c.contentHash
            }))
        );

        const savedCount = await saveChunkEmbeddings(embedResult.embeddings);

        const status = embedResult.quotaExceeded
            ? "quota_exceeded"
            : embedResult.failedChunkIds.length > 0
            ? "partial"
            : "completed";

        const message = embedResult.quotaExceeded
            ? "Gemini API quota reached (429 RESOURCE_EXHAUSTED). Successfully saved generated embeddings. Remaining chunks can be embedded after quota resets."
            : undefined;

        return res.json({
            repositoryId: id,
            totalChunks,
            embeddedChunks: savedCount,
            skippedChunks,
            failedChunks: embedResult.failedChunkIds.length,
            status,
            ...(message && { message }),
            model: EMBEDDING_MODEL,
            dimensions: EMBEDDING_DIMENSIONS
        });
    } catch (error) {
        console.error("Failed to generate repository embeddings:", error);
        return res.status(500).json({
            message: "Failed to generate repository embeddings",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export async function searchRepositoryChunks(req: Request, res: Response) {
    try {
        const rawId = req.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;

        if (!id) {
            return res.status(400).json({
                message: "Repository ID is required"
            });
        }

        const rawQuery = req.query.q;
        const query = typeof rawQuery === "string" ? rawQuery.trim() : "";

        if (!query) {
            return res.status(400).json({
                message: "Search query parameter 'q' is required"
            });
        }

        const limit = req.query.limit
            ? parseInt(String(req.query.limit), 10)
            : undefined;

        const searchResult = await searchSimilarChunks(id, query, limit);

        if (searchResult.notFound) {
            return res.status(404).json({
                message: searchResult.message || `Repository '${id}' not found.`
            });
        }

        if (searchResult.hasNoEmbeddings) {
            return res.json({
                repositoryId: searchResult.repositoryId,
                query: searchResult.query,
                results: [],
                message:
                    searchResult.message ||
                    "No embedded code chunks are available for this repository."
            });
        }

        if (searchResult.quotaExceeded) {
            return res.status(429).json({
                message:
                    searchResult.message ||
                    "Gemini API quota exceeded (429 RESOURCE_EXHAUSTED). Please try again later."
            });
        }

        return res.json({
            repositoryId: searchResult.repositoryId,
            query: searchResult.query,
            results: searchResult.results
        });
    } catch (error) {
        console.error("Vector search failed:", error);

        const isQuota = (error as any)?.isQuotaError || (error as any)?.status === 429;
        const statusCode = isQuota ? 429 : 500;

        return res.status(statusCode).json({
            message: "Failed to execute vector search",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export async function getRepositoryContext(req: Request, res: Response) {
    try {
        const rawId = req.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;

        if (!id) {
            return res.status(400).json({
                message: "Repository ID is required"
            });
        }

        const rawQuery = req.query.q;
        const query = typeof rawQuery === "string" ? rawQuery.trim() : "";

        if (!query) {
            return res.status(400).json({
                message: "Search query parameter 'q' is required"
            });
        }

        const maxChunks = req.query.maxChunks
            ? parseInt(String(req.query.maxChunks), 10)
            : req.query.limit
            ? parseInt(String(req.query.limit), 10)
            : undefined;

        const candidateLimit = req.query.candidateLimit
            ? parseInt(String(req.query.candidateLimit), 10)
            : undefined;

        const similarityThreshold = req.query.threshold
            ? parseFloat(String(req.query.threshold))
            : req.query.similarityThreshold
            ? parseFloat(String(req.query.similarityThreshold))
            : undefined;

        const result = await retrieveContext(id, query, {
            candidateLimit,
            maxChunks,
            similarityThreshold
        });

        if (result.notFound) {
            return res.status(404).json({
                message: result.message || `Repository '${id}' not found.`
            });
        }

        if (result.quotaExceeded) {
            return res.status(429).json({
                message:
                    result.message ||
                    "Gemini API quota exceeded (429 RESOURCE_EXHAUSTED). Please try again later."
            });
        }

        return res.json({
            repositoryId: result.repositoryId,
            query: result.query,
            context: result.context,
            sourceCount: result.sourceCount,
            sources: result.sources,
            ...(result.message && { message: result.message })
        });
    } catch (error) {
        console.error("RAG context retrieval failed:", error);

        const isQuota = (error as any)?.isQuotaError || (error as any)?.status === 429;
        const statusCode = isQuota ? 429 : 500;

        return res.status(statusCode).json({
            message: "Failed to retrieve RAG context",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export async function askRepository(req: Request, res: Response) {
    let currentStage = "QueryValidation";
    try {
        currentStage = "QueryValidation";
        const rawId = req.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;

        if (!id) {
            return res.status(400).json({
                message: "Repository ID is required",
                stage: currentStage
            });
        }

        const rawQuery = req.query.q;
        const query = typeof rawQuery === "string" ? rawQuery.trim() : "";

        if (!query) {
            return res.status(400).json({
                message: "Search query parameter 'q' is required",
                stage: currentStage
            });
        }

        // 1. Detect if this query involves Git history
        currentStage = "HistoryRouting";
        const gitDetection = detectGitHistoryIntent(query);

        if (gitDetection.isGitHistory) {
            console.log(
                `[AskRepository][Stage:HistoryRouting] Detected Git history intent '${gitDetection.intent}' for repo '${id}'`
            );

            currentStage = "GitHistoryRetrieval";
            const gitData = await getStoredGitAnalysisByRepositoryId(id);

            if (!gitData) {
                console.warn(`[AskRepository][Stage:GitHistoryRetrieval] Repository '${id}' not found`);
                return res.status(404).json({
                    message: `Repository '${id}' not found.`,
                    stage: currentStage
                });
            }

            if (
                !gitData.git ||
                !gitData.git.commits ||
                gitData.git.commits.length === 0
            ) {
                console.log(
                    `[AskRepository][Stage:GitHistoryRetrieval] No Git history available for repo '${id}', returning graceful empty history response`
                );
                return res.json({
                    repositoryId: gitData.repositoryId,
                    query,
                    answer: "The repository's available Git history is empty or has not been collected for this repository. Cannot determine commit changes or history.",
                    citations: []
                });
            }

            const analyzedFiles = await getStoredAnalyzedFilesByRepositoryId(id);
            const gitResult = retrieveGitHistoryContext(
                gitData.git,
                gitDetection,
                analyzedFiles || []
            );

            let ragContext = "";
            let combinedSources = [...gitResult.sources];

            // If query also needs current source code context (e.g. topic, function introduction, file content)
            if (gitDetection.needsCodeContext) {
                currentStage = "GitCodeContextRetrieval";
                try {
                    const ragResult = await retrieveContext(id, query);
                    if (ragResult && !ragResult.notFound && !ragResult.quotaExceeded) {
                        ragContext = ragResult.context || "";
                        if (ragResult.sources && ragResult.sources.length > 0) {
                            const seenPaths = new Set(
                                combinedSources.map((s) => s.filePath)
                            );
                            for (const s of ragResult.sources) {
                                if (!seenPaths.has(s.filePath)) {
                                    combinedSources.push(s);
                                    seenPaths.add(s.filePath);
                                }
                            }
                        }
                    }
                } catch (codeErr) {
                    console.warn(
                        "[AskRepository][Stage:GitCodeContextRetrieval] Optional code retrieval for Git query had issue (proceeding with Git context):",
                        codeErr
                    );
                }
            }

            currentStage = "LLMAnswerGeneration";
            console.log(
                `[AskRepository][Stage:LLMAnswerGeneration] Generating Git history answer with ${combinedSources.length} citation sources...`
            );

            const llmResult = await generateRepositoryAnswer(
                query,
                ragContext,
                combinedSources,
                { gitHistoryContext: gitResult.gitContext }
            );

            currentStage = "Complete";
            console.log(
                `[AskRepository][Stage:Complete] Git history answer generated successfully with ${llmResult.citations?.length || 0} citations`
            );

            if (req.user) {
                try {
                    await saveUserChatMessage(req.user.id, gitData.repositoryId, "user", query);
                    await saveUserChatMessage(req.user.id, gitData.repositoryId, "assistant", llmResult.answer, llmResult.citations);
                } catch (chatErr) {
                    console.warn("Failed to persist user git chat message to database:", chatErr);
                }
            }

            return res.json({
                repositoryId: gitData.repositoryId,
                query,
                answer: llmResult.answer,
                citations: llmResult.citations
            });
        }

        // 2. Standard Code RAG query flow
        currentStage = "RAGContextRetrieval";
        console.log(`[AskRepository][Stage:RAGContextRetrieval] Starting RAG context retrieval for repo '${id}' with query: "${query}"`);
        const ragResult = await retrieveContext(id, query);

        if (ragResult.notFound) {
            console.warn(`[AskRepository][Stage:RAGContextRetrieval] Repository '${id}' not found`);
            return res.status(404).json({
                message: ragResult.message || `Repository '${id}' not found.`,
                stage: currentStage
            });
        }

        if (ragResult.quotaExceeded) {
            console.warn(`[AskRepository][Stage:RAGContextRetrieval] Quota exceeded during context retrieval for repo '${id}'`);
            return res.status(429).json({
                message:
                    ragResult.message ||
                    "Gemini API rate limit or quota exceeded (429 RESOURCE_EXHAUSTED). Please wait a moment and try again.",
                stage: currentStage
            });
        }

        // 3. If no context or sourceCount is 0, return clear no-context answer without calling LLM
        if (
            ragResult.hasNoEmbeddings ||
            ragResult.sourceCount === 0 ||
            !ragResult.context ||
            ragResult.context.trim().length === 0
        ) {
            console.log(`[AskRepository][Stage:RAGContextRetrieval] No relevant context found for repo '${id}', returning graceful empty context response`);
            return res.json({
                repositoryId: ragResult.repositoryId,
                query: ragResult.query,
                answer: "I couldn't find enough relevant code in the analyzed repository to answer this reliably.",
                citations: []
            });
        }

        currentStage = "LLMAnswerGeneration";
        console.log(`[AskRepository][Stage:LLMAnswerGeneration] Retrieved ${ragResult.sourceCount} sources (${ragResult.context.length} chars). Generating grounded answer...`);

        // 4. Generate grounded answer via Gemini LLM service with validated citations
        const llmResult = await generateRepositoryAnswer(
            query,
            ragResult.context,
            ragResult.sources
        );

        currentStage = "Complete";
        console.log(`[AskRepository][Stage:Complete] Code answer generated successfully with ${llmResult.citations?.length || 0} citations using model '${llmResult.model || "default"}'`);

        if (req.user) {
            try {
                await saveUserChatMessage(req.user.id, ragResult.repositoryId, "user", query);
                await saveUserChatMessage(req.user.id, ragResult.repositoryId, "assistant", llmResult.answer, llmResult.citations);
            } catch (chatErr) {
                console.warn("Failed to persist user chat message to database:", chatErr);
            }
        }

        return res.json({
            repositoryId: ragResult.repositoryId,
            query: ragResult.query,
            answer: llmResult.answer,
            citations: llmResult.citations
        });
    } catch (error) {
        const isQuota =
            (error as any)?.isQuotaError ||
            (error as any)?.status === 429 ||
            isRateLimitOrQuotaError(error);

        const isUnavailable =
            (error as any)?.isDemandError ||
            (error as any)?.status === 503 ||
            isUnavailableOrDemandError(error);

        const isTimeout =
            (error as any)?.isTimeout ||
            (error as any)?.status === 504 ||
            (error as any)?.name === "TimeoutError" ||
            String(error).toLowerCase().includes("timed out") ||
            String(error).toLowerCase().includes("timeout");

        const statusCode = isQuota ? 429 : isUnavailable ? 503 : isTimeout ? 504 : 500;

        let userMessage = "Failed to generate AI answer for repository";
        if (isQuota) {
            userMessage = "Gemini API rate limit or quota exceeded. Please wait a moment and try again.";
        } else if (isUnavailable) {
            userMessage = "The AI service is currently experiencing temporary high demand. Please try again shortly.";
        } else if (isTimeout) {
            userMessage = "The request timed out while generating the AI answer. Please try again.";
        } else if (currentStage === "RAGContextRetrieval" || currentStage === "GitHistoryRetrieval") {
            userMessage = "Failed to retrieve relevant code or history context for this query.";
        }

        const rawMsg = error instanceof Error ? error.message : "Unknown error";
        let cleanDetail = userMessage;

        // Extract clean detail if error is a raw upstream JSON string
        try {
            const parsed = JSON.parse(rawMsg);
            if (parsed?.error?.message) {
                cleanDetail = parsed.error.message;
            }
        } catch {
            if (rawMsg && !rawMsg.includes("{")) {
                cleanDetail = rawMsg;
            }
        }

        console.error(`[AskRepository][FailureStage:${currentStage}] Status: ${statusCode}:`, {
            userMessage,
            detail: cleanDetail
        });

        return res.status(statusCode).json({
            message: userMessage,
            error: cleanDetail,
            stage: currentStage
        });
    }
}

export async function getRepositoryFlows(req: Request, res: Response) {
    try {
        const rawId = req.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;

        if (!id) {
            return res.status(400).json({
                message: "Repository ID is required"
            });
        }

        const data = await getStoredCodeFlowsByRepositoryId(id);

        if (!data) {
            return res.status(404).json({
                message: `Repository with ID or name '${id}' not found`
            });
        }

        const graphs = transformFlowsToGraphs(data.flows);

        return res.json({
            repositoryId: data.repositoryId,
            flows: graphs
        });
    } catch (error) {
        console.error("Failed to retrieve code flows:", error);
        return res.status(500).json({
            message: "Failed to retrieve code flows",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export async function getRepositoryFlowById(req: Request, res: Response) {
    try {
        const rawId = req.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;

        const rawFlowId = req.params.flowId;
        const flowId = Array.isArray(rawFlowId) ? rawFlowId[0] : rawFlowId;

        if (!id || !flowId) {
            return res.status(400).json({
                message: "Repository ID and Flow ID are required"
            });
        }

        const data = await getStoredCodeFlowById(id, flowId);

        if (!data) {
            return res.status(404).json({
                message: `Repository with ID or name '${id}' not found`
            });
        }

        if (!data.flow) {
            return res.status(404).json({
                message: `Code flow with ID '${flowId}' not found for repository '${id}'`
            });
        }

        const graph = transformFlowToGraph(data.flow);

        return res.json(graph);
    } catch (error) {
        console.error("Failed to retrieve code flow:", error);
        return res.status(500).json({
            message: "Failed to retrieve code flow",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export async function getRepositoryFiles(req: Request, res: Response) {
    try {
        const rawId = req.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;

        if (!id) {
            return res.status(400).json({
                message: "Repository ID is required"
            });
        }

        const rawPath = req.query.path;

        // Individual file endpoint: GET /api/repositories/:id/files?path=<encoded-file-path>
        if (typeof rawPath === "string" && rawPath.trim().length > 0) {
            const filePath = rawPath.trim();
            const result = await getStoredAnalyzedFileByPath(id, filePath);

            if (result.notFoundRepo) {
                return res.status(404).json({
                    message: `Repository with ID or name '${id}' not found`
                });
            }

            if (result.notFoundFile || !result.file) {
                return res.status(404).json({
                    message: `File '${filePath}' not found in analyzed repository files`
                });
            }

            return res.json({
                path: result.file.path,
                language: result.file.language,
                content: result.file.content,
                size: result.file.size
            });
        }

        // Repository files list endpoint: GET /api/repositories/:id/files
        const files = await getStoredAnalyzedFilesByRepositoryId(id);

        if (files === null) {
            return res.status(404).json({
                message: `Repository with ID or name '${id}' not found`
            });
        }

        return res.json(files);
    } catch (error) {
        console.error("Failed to retrieve repository files:", error);
        return res.status(500).json({
            message: "Failed to retrieve repository files",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}