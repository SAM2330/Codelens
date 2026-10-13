import {
    RagSource,
    ExactSearchResult,
    KeywordSearchResult,
    VectorSearchResult
} from "../types/database";

export interface LaneCandidate {
    id: string;
    filePath: string;
    symbol: string;
    symbolType: string;
    startLine: number;
    endLine: number;
    language: string;
    content: string;
    rawSimilarity: number;
}

export interface RrfOptions {
    k?: number;
    weightExact?: number;
    weightKeyword?: number;
    weightVector?: number;
    maxChunks?: number;
}

export const DEFAULT_RRF_K = 60;
export const DEFAULT_WEIGHT_EXACT = 1.2;
export const DEFAULT_WEIGHT_KEYWORD = 1.0;
export const DEFAULT_WEIGHT_VECTOR = 1.0;

interface MergedRrfItem {
    candidate: LaneCandidate;
    rrfScore: number;
    matchLanes: ("exact" | "keyword" | "vector")[];
    matchType?: RagSource["matchType"];
    maxRawSimilarity: number;
}

/**
 * Combines exact, keyword, and vector candidate lists using Reciprocal Rank Fusion (RRF).
 *
 * Formula:
 *   RRF_Score(d) = sum_{lane in Lanes} (weight_lane / (k + rank_lane(d)))
 *
 * Where rank_lane(d) is 1-based.
 */
export function fuseWithRrf(
    exactResults: ExactSearchResult[],
    keywordResults: KeywordSearchResult[],
    vectorResults: VectorSearchResult[],
    options?: RrfOptions
): RagSource[] {
    const k = options?.k ?? DEFAULT_RRF_K;
    const wExact = options?.weightExact ?? DEFAULT_WEIGHT_EXACT;
    const wKeyword = options?.weightKeyword ?? DEFAULT_WEIGHT_KEYWORD;
    const wVector = options?.weightVector ?? DEFAULT_WEIGHT_VECTOR;
    const maxChunks = options?.maxChunks ?? 6;

    const itemsMap = new Map<string, MergedRrfItem>();

    function getOrCreate(
        id: string,
        base: LaneCandidate,
        matchType?: RagSource["matchType"]
    ): MergedRrfItem {
        let existing = itemsMap.get(id);
        if (!existing) {
            existing = {
                candidate: base,
                rrfScore: 0,
                matchLanes: [],
                matchType,
                maxRawSimilarity: base.rawSimilarity
            };
            itemsMap.set(id, existing);
        } else {
            existing.maxRawSimilarity = Math.max(
                existing.maxRawSimilarity,
                base.rawSimilarity
            );
            if (matchType && !existing.matchType) {
                existing.matchType = matchType;
            }
        }
        return existing;
    }

    // 1. Process Exact Lane (Lane weight: wExact)
    for (let i = 0; i < exactResults.length; i++) {
        const item = exactResults[i];
        const rank = i + 1;
        const rrfDelta = wExact / (k + rank);

        const entry = getOrCreate(
            item.id,
            {
                id: item.id,
                filePath: item.filePath,
                symbol: item.symbol,
                symbolType: item.symbolType,
                startLine: item.startLine,
                endLine: item.endLine,
                language: item.language,
                content: item.content,
                rawSimilarity: item.similarity
            },
            item.matchType
        );

        entry.rrfScore += rrfDelta;
        if (!entry.matchLanes.includes("exact")) {
            entry.matchLanes.push("exact");
        }
    }

    // 2. Process Keyword Lane (Lane weight: wKeyword)
    for (let i = 0; i < keywordResults.length; i++) {
        const item = keywordResults[i];
        const rank = i + 1;
        const rrfDelta = wKeyword / (k + rank);

        // Normalize rank score for display similarity
        const normalizedSim = Math.min(1.0, Math.max(0.6, 0.6 + item.rank * 0.4));

        const entry = getOrCreate(
            item.id,
            {
                id: item.id,
                filePath: item.filePath,
                symbol: item.symbol,
                symbolType: item.symbolType,
                startLine: item.startLine,
                endLine: item.endLine,
                language: item.language,
                content: item.content,
                rawSimilarity: normalizedSim
            },
            "keyword"
        );

        entry.rrfScore += rrfDelta;
        if (!entry.matchLanes.includes("keyword")) {
            entry.matchLanes.push("keyword");
        }
    }

    // 3. Process Vector Lane (Lane weight: wVector)
    for (let i = 0; i < vectorResults.length; i++) {
        const item = vectorResults[i];
        const rank = i + 1;
        const rrfDelta = wVector / (k + rank);

        const entry = getOrCreate(
            item.id,
            {
                id: item.id,
                filePath: item.filePath,
                symbol: item.symbol,
                symbolType: item.symbolType,
                startLine: item.startLine,
                endLine: item.endLine,
                language: item.language,
                content: item.content,
                rawSimilarity: item.similarity
            },
            "vector"
        );

        entry.rrfScore += rrfDelta;
        if (!entry.matchLanes.includes("vector")) {
            entry.matchLanes.push("vector");
        }
    }

    // 4. Sort deterministically
    const mergedList = Array.from(itemsMap.values());

    mergedList.sort((a, b) => {
        // Primary: RRF Score descending
        const diff = b.rrfScore - a.rrfScore;
        if (Math.abs(diff) > 1e-9) {
            return diff;
        }

        // Tie-breaker 1: Agreement across multiple lanes
        if (b.matchLanes.length !== a.matchLanes.length) {
            return b.matchLanes.length - a.matchLanes.length;
        }

        // Tie-breaker 2: Has exact match lane
        const aHasExact = a.matchLanes.includes("exact");
        const bHasExact = b.matchLanes.includes("exact");
        if (aHasExact && !bHasExact) return -1;
        if (!aHasExact && bHasExact) return 1;

        // Tie-breaker 3: Specific symbol over whole-file chunks
        const aSpecific = a.candidate.symbolType !== "file";
        const bSpecific = b.candidate.symbolType !== "file";
        if (aSpecific && !bSpecific) return -1;
        if (!aSpecific && bSpecific) return 1;

        // Tie-breaker 4: Stable file path and line order
        if (a.candidate.filePath !== b.candidate.filePath) {
            return a.candidate.filePath.localeCompare(b.candidate.filePath);
        }
        if (a.candidate.startLine !== b.candidate.startLine) {
            return a.candidate.startLine - b.candidate.startLine;
        }

        // Tie-breaker 5: Stable chunk UUID
        return a.candidate.id.localeCompare(b.candidate.id);
    });

    // 5. Slice top maxChunks and format as RagSource
    const topItems = mergedList.slice(0, maxChunks);

    return topItems.map((item) => {
        let finalMatchType = item.matchType;
        if (!finalMatchType?.startsWith("exact") && item.matchLanes.length > 1) {
            finalMatchType = "hybrid";
        }

        return {
            chunkId: item.candidate.id,
            filePath: item.candidate.filePath,
            symbol: item.candidate.symbol,
            symbolType: item.candidate.symbolType,
            startLine: item.candidate.startLine,
            endLine: item.candidate.endLine,
            language: item.candidate.language,
            // Keep raw similarity for downstream UI/citation compatibility
            similarity: item.maxRawSimilarity,
            content: item.candidate.content,
            matchType: finalMatchType,
            rrfScore: item.rrfScore,
            matchLanes: item.matchLanes
        };
    });
}
