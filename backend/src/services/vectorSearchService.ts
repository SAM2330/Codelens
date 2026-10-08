import { embedQueryText } from "./embeddingService";
import {
    searchSimilarChunksByVector,
    hasEmbeddedChunksForRepository
} from "../db/repositories/repositoryDb";
import { VectorSearchResult } from "../types/database";

export interface SearchSimilarChunksResult {
    repositoryId: string;
    query: string;
    results: VectorSearchResult[];
    notFound?: boolean;
    hasNoEmbeddings?: boolean;
    quotaExceeded?: boolean;
    message?: string;
}

export const DEFAULT_SEARCH_LIMIT = 8;
export const MAX_SEARCH_LIMIT = 20;
export const MIN_SEARCH_LIMIT = 1;

export function sanitizeSearchLimit(limit?: number | string): number {
    if (limit === undefined || limit === null) {
        return DEFAULT_SEARCH_LIMIT;
    }

    const parsed = typeof limit === "string" ? parseInt(limit, 10) : limit;
    if (isNaN(parsed) || parsed < MIN_SEARCH_LIMIT) {
        return DEFAULT_SEARCH_LIMIT;
    }

    return Math.min(parsed, MAX_SEARCH_LIMIT);
}

export async function searchSimilarChunks(
    repositoryId: string,
    query: string,
    limit: number = DEFAULT_SEARCH_LIMIT
): Promise<SearchSimilarChunksResult> {
    const trimmedQuery = query ? query.trim() : "";
    const safeLimit = sanitizeSearchLimit(limit);

    if (!trimmedQuery) {
        throw new Error("Search query must not be empty.");
    }

    // 1. Verify repository exists and whether it has embeddings
    const check = await hasEmbeddedChunksForRepository(repositoryId);

    if (!check.exists) {
        return {
            repositoryId,
            query: trimmedQuery,
            results: [],
            notFound: true,
            message: `Repository with ID or name '${repositoryId}' not found.`
        };
    }

    const resolvedRepoId = check.repoId || repositoryId;

    if (!check.hasEmbeddings) {
        return {
            repositoryId: resolvedRepoId,
            query: trimmedQuery,
            results: [],
            hasNoEmbeddings: true,
            message: "No embedded code chunks are available for this repository."
        };
    }

    // 2. Generate embedding for query using Gemini
    let queryEmbedding: number[];
    try {
        queryEmbedding = await embedQueryText(trimmedQuery);
    } catch (error: any) {
        if (error?.isQuotaError || error?.status === 429) {
            return {
                repositoryId: resolvedRepoId,
                query: trimmedQuery,
                results: [],
                quotaExceeded: true,
                message:
                    "Gemini API quota exceeded (429 RESOURCE_EXHAUSTED). Please try again later."
            };
        }
        throw error;
    }

    // 3. Search database with pgvector cosine similarity
    const results = await searchSimilarChunksByVector(
        resolvedRepoId,
        queryEmbedding,
        safeLimit
    );

    return {
        repositoryId: resolvedRepoId,
        query: trimmedQuery,
        results: results || []
    };
}
