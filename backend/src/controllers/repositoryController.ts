import { Request, Response } from "express";
import { getRepository } from "../services/githubService";
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
    getStoredAnalysisByRepositoryId,
    getChunksByRepositoryId,
    getChunksWithoutEmbeddings,
    saveChunkEmbeddings
} from "../db/repositories/repositoryDb";
import { searchSimilarChunks } from "../services/vectorSearchService";
import { retrieveContext } from "../services/ragService";
import { generateRepositoryAnswer } from "../services/llmService";
import { FullAnalysisResult } from "../types/database";

export async function analyzeRepository(req: Request, res: Response) {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                message: "GitHub repository URL is required"
            });
        }

        const githubUrl = new URL(url);

        if (githubUrl.hostname !== "github.com") {
            return res.status(400).json({
                message: "Invalid GitHub repository URL"
            });
        }

        const parts = githubUrl.pathname
            .split("/")
            .filter(Boolean);

        if (parts.length < 2) {
            return res.status(400).json({
                message: "Invalid GitHub repository URL"
            });
        }

        const owner = parts[0];
        const repo = parts[1];
        console.log("1. Getting repository...");
        const repository = await getRepository(owner, repo);
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

            await saveAnalysis(storedRepo.id, analysisPayload, chunks);
            console.log("9. Analysis results and code chunks persisted successfully.");

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

        return res.json(analysisPayload);
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
        const repositories = await getAllRepositories();
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

        // 1. Retrieve RAG context using existing RAG engine
        const ragResult = await retrieveContext(id, query);

        if (ragResult.notFound) {
            return res.status(404).json({
                message: ragResult.message || `Repository '${id}' not found.`
            });
        }

        if (ragResult.quotaExceeded) {
            return res.status(429).json({
                message:
                    ragResult.message ||
                    "Gemini API quota exceeded (429 RESOURCE_EXHAUSTED). Please try again later."
            });
        }

        // 2. If no context or sourceCount is 0, return clear no-context answer without calling LLM
        if (
            ragResult.hasNoEmbeddings ||
            ragResult.sourceCount === 0 ||
            !ragResult.context ||
            ragResult.context.trim().length === 0
        ) {
            return res.json({
                repositoryId: ragResult.repositoryId,
                query: ragResult.query,
                answer: "I couldn't find enough relevant code in the analyzed repository to answer this reliably."
            });
        }

        // 3. Generate grounded answer via Gemini LLM service
        const llmResult = await generateRepositoryAnswer(
            query,
            ragResult.context
        );

        return res.json({
            repositoryId: ragResult.repositoryId,
            query: ragResult.query,
            answer: llmResult.answer
        });
    } catch (error) {
        console.error("AI repository ask failed:", error);

        const isQuota =
            (error as any)?.isQuotaError || (error as any)?.status === 429;
        const statusCode = isQuota ? 429 : 500;

        return res.status(statusCode).json({
            message: isQuota
                ? "Gemini API quota exceeded (429 RESOURCE_EXHAUSTED). Please try again later."
                : "Failed to generate AI answer for repository",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}