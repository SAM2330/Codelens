import { searchSimilarChunks } from "./vectorSearchService";
import { RagOptions, RagContextResult, RagSource } from "../types/database";

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

    // 1. Retrieve candidates from vector search
    const searchResult = await searchSimilarChunks(
        repositoryId,
        trimmedQuery,
        candidateLimit
    );

    if (searchResult.notFound) {
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

    if (searchResult.hasNoEmbeddings) {
        return {
            repositoryId: searchResult.repositoryId,
            query: trimmedQuery,
            context: "",
            sourceCount: 0,
            sources: [],
            hasNoEmbeddings: true,
            message: "No relevant embedded code chunks were found."
        };
    }

    if (searchResult.quotaExceeded) {
        return {
            repositoryId: searchResult.repositoryId,
            query: trimmedQuery,
            context: "",
            sourceCount: 0,
            sources: [],
            quotaExceeded: true,
            message:
                searchResult.message ||
                "Gemini API quota exceeded (429 RESOURCE_EXHAUSTED). Please try again later."
        };
    }

    // 2. Filter candidates by similarity threshold and select top maxChunks
    const candidates = searchResult.results || [];
    const filteredCandidates = candidates.filter(
        (item) => item.similarity >= threshold
    );

    const selectedResults = filteredCandidates.slice(0, maxChunks);

    const sources: RagSource[] = selectedResults.map((item) => ({
        chunkId: item.id,
        filePath: item.filePath,
        symbol: item.symbol,
        symbolType: item.symbolType,
        startLine: item.startLine,
        endLine: item.endLine,
        language: item.language,
        similarity: item.similarity,
        content: item.content
    }));

    // 3. Format structured LLM-ready context string
    const context = formatRagContext(sources);

    if (sources.length === 0) {
        return {
            repositoryId: searchResult.repositoryId,
            query: trimmedQuery,
            context: "",
            sourceCount: 0,
            sources: [],
            message: "No relevant embedded code chunks were found."
        };
    }

    return {
        repositoryId: searchResult.repositoryId,
        query: trimmedQuery,
        context,
        sourceCount: sources.length,
        sources
    };
}
