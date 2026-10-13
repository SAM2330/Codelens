import { searchSimilarChunks, SearchSimilarChunksResult } from "./vectorSearchService";
import {
    searchChunksByExactMetadata,
    searchChunksByKeyword
} from "../db/repositories/repositoryDb";
import {
    RagOptions,
    RagContextResult,
    RagSource,
    ExactSearchResult,
    KeywordSearchResult
} from "../types/database";
import { fuseWithRrf } from "./rrfService";

export const DEFAULT_CANDIDATE_LIMIT = 12;
export const DEFAULT_MAX_CHUNKS = 6;
export const HARD_MAX_CHUNKS = 10;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.55;

export function formatRagContext(sources: RagSource[]): string {
    if (!sources || sources.length === 0) {
        return "";
    }

    return sources
        .map((source, index) => {
            const similarityRounded = Math.round(source.similarity * 10000) / 10000;
            return `--- SOURCE ${index + 1} ---
File: ${source.filePath}
Symbol: ${source.symbol}
Lines: ${source.startLine}-${source.endLine}
Similarity: ${similarityRounded}

${source.content}`;
        })
        .join("\n\n");
}

export async function retrieveContext(
    repositoryId: string,
    query: string,
    options?: RagOptions
): Promise<RagContextResult> {
    const trimmedQuery = query ? query.trim() : "";

    if (!trimmedQuery) {
        throw new Error("Query text must not be empty.");
    }

    const candidateLimit = Math.min(
        Math.max(1, options?.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT),
        20
    );

    const maxChunks = Math.min(
        Math.max(1, options?.maxChunks ?? DEFAULT_MAX_CHUNKS),
        HARD_MAX_CHUNKS
    );

    const threshold = options?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;

    // 1. Lane A: Retrieve exact metadata candidates (exact symbol and file path matches without Gemini embedding call)
    let exactMatches: ExactSearchResult[] = [];
    if (!options?.disableExactSearch) {
        try {
            exactMatches = await searchChunksByExactMetadata(
                repositoryId,
                trimmedQuery,
                {
                    limit: candidateLimit,
                    analysisId: options?.analysisId
                }
            );
        } catch (exactErr) {
            console.warn(
                "[RAG][Lane:Exact] Exact metadata search failed, continuing with other lanes:",
                exactErr
            );
        }
    }

    // 2. Lane B: Retrieve keyword full-text search candidates (PostgreSQL FTS without Gemini embedding call)
    let keywordMatches: KeywordSearchResult[] = [];
    if (!options?.disableKeywordSearch) {
        try {
            keywordMatches = await searchChunksByKeyword(
                repositoryId,
                trimmedQuery,
                {
                    limit: candidateLimit,
                    analysisId: options?.analysisId
                }
            );
        } catch (kwErr) {
            console.warn(
                "[RAG][Lane:Keyword] Keyword full-text search failed, continuing with other lanes:",
                kwErr
            );
        }
    }

    // 3. Lane C: Retrieve semantic candidates from vector search
    let searchResult: SearchSimilarChunksResult | null = null;
    let vectorError: unknown = null;

    if (!options?.disableVectorSearch) {
        try {
            searchResult = await searchSimilarChunks(
                repositoryId,
                trimmedQuery,
                candidateLimit,
                options?.analysisId
            );
        } catch (err: unknown) {
            vectorError = err;
            console.warn(
                "[RAG][Lane:Vector] Vector search failed or hit quota, continuing with lexical lanes:",
                err
            );
        }
    }

    // 4. Handle repository not found
    if (searchResult?.notFound) {
        return {
            repositoryId,
            query: trimmedQuery,
            context: "",
            sourceCount: 0,
            sources: [],
            notFound: true,
            message: searchResult.message || `Repository '${repositoryId}' not found.`
        };
    }

    const resolvedRepoId = searchResult?.repositoryId || repositoryId;

    // 5. Handle vector search unavailability / errors with lexical lanes fallback
    const hasLexicalCandidates = exactMatches.length > 0 || keywordMatches.length > 0;

    if (!hasLexicalCandidates) {
        if (searchResult?.hasNoEmbeddings) {
            return {
                repositoryId: resolvedRepoId,
                query: trimmedQuery,
                context: "",
                sourceCount: 0,
                sources: [],
                hasNoEmbeddings: true,
                message: "No relevant embedded code chunks were found."
            };
        }

        if (searchResult?.quotaExceeded || (vectorError as any)?.isQuotaError) {
            return {
                repositoryId: resolvedRepoId,
                query: trimmedQuery,
                context: "",
                sourceCount: 0,
                sources: [],
                quotaExceeded: true,
                message:
                    searchResult?.message ||
                    "Gemini API quota exceeded (429 RESOURCE_EXHAUSTED). Please try again later."
            };
        }

        if (vectorError) {
            throw vectorError;
        }
    }

    // 6. Filter vector candidates by similarity threshold
    const vectorCandidates = searchResult?.results || [];
    const passingVectorCandidates = vectorCandidates.filter(
        (item) => item.similarity >= threshold
    );

    // 7. Combine all 3 lanes using Reciprocal Rank Fusion (RRF)
    const selectedSources = fuseWithRrf(
        exactMatches,
        keywordMatches,
        passingVectorCandidates,
        {
            k: options?.rrfK,
            maxChunks
        }
    );

    // 8. Format structured LLM-ready context string
    const context = formatRagContext(selectedSources);

    if (selectedSources.length === 0) {
        return {
            repositoryId: resolvedRepoId,
            query: trimmedQuery,
            context: "",
            sourceCount: 0,
            sources: [],
            message: "No relevant embedded code chunks were found."
        };
    }

    return {
        repositoryId: resolvedRepoId,
        query: trimmedQuery,
        context,
        sourceCount: selectedSources.length,
        sources: selectedSources,
        analysisId: options?.analysisId
    };
}
