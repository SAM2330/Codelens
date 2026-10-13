import assert from "assert";
import dotenv from "dotenv";
dotenv.config();

import { getPool } from "../src/db/client";
import {
    getActiveAnalysisId,
    searchChunksByExactMetadata,
    searchChunksByKeyword,
    searchSimilarChunksByVector
} from "../src/db/repositories/repositoryDb";
import { retrieveContext } from "../src/services/ragService";
import { fuseWithRrf } from "../src/services/rrfService";
import { validateAndBuildCitations } from "../src/services/llmService";
import {
    ExactSearchResult,
    KeywordSearchResult,
    VectorSearchResult
} from "../src/types/database";

async function runTestSuite() {
    console.log("=================================================");
    console.log("   PHASE 27.2: KEYWORD SEARCH + RRF RETRIEVAL    ");
    console.log("=================================================\n");

    const pool = getPool();
    let passed = 0;
    let failed = 0;

    async function test(name: string, fn: () => Promise<void>) {
        process.stdout.write(`TEST: ${name}... `);
        try {
            await fn();
            console.log("✅ PASSED");
            passed++;
        } catch (err: any) {
            console.log("❌ FAILED");
            console.error("  Error:", err.message || err);
            failed++;
        }
    }

    try {
        // Find existing IMDB repository in database
        const repoRes = await pool.query(
            "SELECT id, full_name FROM repositories WHERE LOWER(full_name) = 'sam2330/imdb' LIMIT 1"
        );
        assert.ok(repoRes.rows.length > 0, "SAM2330/IMDB repository must exist in database");
        const repoId = repoRes.rows[0].id;
        const activeAnalysisId = await getActiveAnalysisId(repoId);
        assert.ok(activeAnalysisId, "Active analysis ID must be resolved");

        // ----------------------------------------------------
        // TEST 1: Keyword matching via PostgreSQL full-text search
        // ----------------------------------------------------
        await test("1. Keyword matching via PostgreSQL full-text search", async () => {
            const query = "trending media";
            const results = await searchChunksByKeyword(repoId, query, {
                limit: 5,
                analysisId: activeAnalysisId!
            });

            assert.ok(results.length > 0, "Keyword search should return matching chunks");
            for (const r of results) {
                assert.ok(r.id, "Chunk id must be present");
                assert.ok(r.filePath, "Chunk filePath must be present");
                assert.ok(typeof r.rank === "number" && r.rank > 0, "Chunk rank must be > 0");
                const text = `${r.symbol} ${r.filePath} ${r.content}`.toLowerCase();
                assert.ok(
                    text.includes("trending") || text.includes("media"),
                    "Chunk must contain keyword terms"
                );
            }
        });

        // ----------------------------------------------------
        // TEST 2: Three-lane RRF merging and deduplication
        // ----------------------------------------------------
        await test("2. Three-lane RRF merging and deduplication", async () => {
            const query = "MediaController trending";
            const result = await retrieveContext(repoId, query, {
                candidateLimit: 12,
                maxChunks: 6
            });

            assert.ok(result.sourceCount > 0, "Must return fused context sources");
            assert.ok(result.sources.length <= 6, "Sources count must not exceed 6");

            // Deduplication verification
            const chunkIds = result.sources.map((s) => s.chunkId);
            const uniqueChunkIds = new Set(chunkIds);
            assert.strictEqual(
                chunkIds.length,
                uniqueChunkIds.size,
                "All merged chunkIds must be strictly unique"
            );

            // RRF score presence & ordering
            for (let i = 0; i < result.sources.length - 1; i++) {
                const cur = result.sources[i];
                const next = result.sources[i + 1];
                assert.ok(
                    (cur.rrfScore || 0) >= (next.rrfScore || 0) - 1e-9,
                    `Sources must be ordered by RRF score descending: ${cur.rrfScore} vs ${next.rrfScore}`
                );
            }
        });

        // ----------------------------------------------------
        // TEST 3: Multi-lane agreement boosting
        // ----------------------------------------------------
        await test("3. Multi-lane agreement boosting", async () => {
            // Create simulated candidates across 3 lanes
            const mockExact: ExactSearchResult[] = [
                {
                    id: "chunk-A",
                    repositoryId: repoId,
                    filePath: "src/a.ts",
                    language: "typescript",
                    symbol: "SymbolA",
                    symbolType: "function",
                    startLine: 1,
                    endLine: 10,
                    content: "content A",
                    similarity: 1.0,
                    matchType: "exact_symbol"
                }
            ];

            const mockKeyword: KeywordSearchResult[] = [
                {
                    id: "chunk-B",
                    repositoryId: repoId,
                    filePath: "src/b.ts",
                    language: "typescript",
                    symbol: "SymbolB",
                    symbolType: "function",
                    startLine: 1,
                    endLine: 10,
                    content: "content B",
                    rank: 0.8
                },
                {
                    id: "chunk-C",
                    repositoryId: repoId,
                    filePath: "src/c.ts",
                    language: "typescript",
                    symbol: "SymbolC",
                    symbolType: "function",
                    startLine: 1,
                    endLine: 10,
                    content: "content C",
                    rank: 0.7
                }
            ];

            const mockVector: VectorSearchResult[] = [
                {
                    id: "chunk-C", // Chunk-C is in BOTH keyword and vector lanes!
                    repositoryId: repoId,
                    filePath: "src/c.ts",
                    language: "typescript",
                    symbol: "SymbolC",
                    symbolType: "function",
                    startLine: 1,
                    endLine: 10,
                    content: "content C",
                    similarity: 0.75
                },
                {
                    id: "chunk-D",
                    repositoryId: repoId,
                    filePath: "src/d.ts",
                    language: "typescript",
                    symbol: "SymbolD",
                    symbolType: "function",
                    startLine: 1,
                    endLine: 10,
                    content: "content D",
                    similarity: 0.70
                }
            ];

            const fused = fuseWithRrf(mockExact, mockKeyword, mockVector, {
                k: 60,
                weightExact: 1.2,
                weightKeyword: 1.0,
                weightVector: 1.0,
                maxChunks: 4
            });

            // Chunk-C appeared in both keyword (rank 2) and vector (rank 1):
            // RRF(C) = 1.0/(60+2) + 1.0/(60+1) = 1/62 + 1/61 ≈ 0.016129 + 0.016393 = 0.03252
            // RRF(B) = 1.0/(60+1) ≈ 0.01639
            // RRF(D) = 1.0/(60+2) ≈ 0.01612
            // RRF(A) = 1.2/(60+1) ≈ 0.01967
            // So order must be: Chunk-C (boosted by 2 lanes) > Chunk-A > Chunk-B > Chunk-D!
            assert.strictEqual(fused[0].chunkId, "chunk-C", "Multi-lane agreed Chunk-C must rank 1st");
            assert.strictEqual(fused[0].matchType, "hybrid", "Chunk-C matchType should be hybrid");
            assert.strictEqual(fused[1].chunkId, "chunk-A", "Exact match Chunk-A should rank 2nd");
            assert.strictEqual(fused[2].chunkId, "chunk-B", "Single-lane Chunk-B should rank 3rd");
            assert.strictEqual(fused[3].chunkId, "chunk-D", "Single-lane Chunk-D should rank 4th");
        });

        // ----------------------------------------------------
        // TEST 4: Retrieval when embeddings are unavailable
        // ----------------------------------------------------
        await test("4. Retrieval when embeddings are unavailable", async () => {
            const query = "MediaController trending";
            const result = await retrieveContext(repoId, query, {
                disableVectorSearch: true,
                candidateLimit: 8,
                maxChunks: 6
            });

            assert.ok(!result.hasNoEmbeddings, "Must not return hasNoEmbeddings error when lexical matches exist");
            assert.ok(!result.quotaExceeded, "Must not return quotaExceeded when lexical matches exist");
            assert.ok(result.sourceCount > 0, "Must return sources using exact + keyword lanes");
            assert.ok(
                result.sources.some((s) => s.symbol.includes("MediaController")),
                "Should include MediaController chunks"
            );
        });

        // ----------------------------------------------------
        // TEST 5: Maximum of 6 context chunks constraint
        // ----------------------------------------------------
        await test("5. Maximum of 6 context chunks constraint", async () => {
            const query = "movie trending media controller tmdb";
            const result = await retrieveContext(repoId, query, {
                candidateLimit: 20, // Request large candidate limit
                maxChunks: 6
            });

            assert.ok(result.sourceCount > 0, "Must return results");
            assert.ok(
                result.sources.length <= 6,
                `Context chunks count must be <= 6, got: ${result.sources.length}`
            );
            assert.strictEqual(
                result.sourceCount,
                result.sources.length,
                "sourceCount must match sources array length"
            );
        });

        // ----------------------------------------------------
        // TEST 6: Active-analysis isolation, including empty active analysis
        // ----------------------------------------------------
        await test("6. Active-analysis isolation, including empty active analysis", async () => {
            // Part A: Normal active analysis isolation
            const kwResults = await searchChunksByKeyword(repoId, "media", {
                analysisId: activeAnalysisId!
            });
            assert.ok(kwResults.length > 0, "Keyword search must find chunks in active analysis");
            for (const r of kwResults) {
                if (r.analysisId) {
                    assert.strictEqual(
                        r.analysisId,
                        activeAnalysisId,
                        `Chunk analysisId (${r.analysisId}) must strictly match activeAnalysisId (${activeAnalysisId})`
                    );
                }
            }

            // Part B: Simulated empty active analysis (using a fake non-existent analysis UUID)
            const emptyAnalysisId = "00000000-0000-0000-0000-000000000000";
            const emptyKw = await searchChunksByKeyword(repoId, "media", {
                analysisId: emptyAnalysisId
            });
            assert.strictEqual(
                emptyKw.length,
                0,
                "Empty active analysis must return 0 keyword chunks (never fall back to older analyses)"
            );

            const emptyExact = await searchChunksByExactMetadata(repoId, "MediaController", {
                analysisId: emptyAnalysisId
            });
            assert.strictEqual(
                emptyExact.length,
                0,
                "Empty active analysis must return 0 exact chunks (never fall back to older analyses)"
            );

            const emptyVector = await searchSimilarChunksByVector(
                repoId,
                new Array(1536).fill(0.01),
                5,
                emptyAnalysisId
            );
            assert.strictEqual(
                emptyVector?.length ?? 0,
                0,
                "Empty active analysis must return 0 vector chunks (never fall back to older analyses)"
            );
        });

        // ----------------------------------------------------
        // TEST 7: Citation metadata compatibility
        // ----------------------------------------------------
        await test("7. Citation metadata compatibility", async () => {
            const query = "MediaController.getTopPicks";
            const result = await retrieveContext(repoId, query, {
                maxChunks: 4
            });

            assert.ok(result.sources.length > 0, "Must return sources");

            for (const source of result.sources) {
                assert.ok(source.chunkId, "source.chunkId must be non-empty");
                assert.ok(source.filePath, "source.filePath must be present");
                assert.ok(typeof source.startLine === "number", "startLine must be number");
                assert.ok(typeof source.endLine === "number", "endLine must be number");
                assert.ok(source.startLine > 0, "startLine must be > 0");
                assert.ok(source.endLine >= source.startLine, "endLine must be >= startLine");
                assert.ok(typeof source.similarity === "number", "similarity must be a number");
                assert.ok(typeof source.rrfScore === "number", "rrfScore must be a number");
                assert.ok(Array.isArray(source.matchLanes), "matchLanes must be an array");
                assert.ok(source.content && source.content.length > 0, "content must be non-empty");
            }

            // Downstream citation validator test
            const answerText = "Top picks are handled in [1] using methods in [2].";
            const candidateIds = [1, 2];

            const { validatedCitations, finalAnswer } = validateAndBuildCitations(
                candidateIds,
                answerText,
                result.sources
            );

            assert.strictEqual(finalAnswer, answerText);
            assert.strictEqual(validatedCitations.length, 2);
            assert.strictEqual(validatedCitations[0].id, 1);
            assert.strictEqual(validatedCitations[0].chunkId, result.sources[0].chunkId);
            assert.strictEqual(validatedCitations[0].filePath, result.sources[0].filePath);
            assert.strictEqual(validatedCitations[0].startLine, result.sources[0].startLine);
            assert.strictEqual(validatedCitations[0].endLine, result.sources[0].endLine);
        });

    } finally {
        await pool.end();
    }

    console.log("\n=================================================");
    console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("=================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runTestSuite().catch((err) => {
    console.error("Test suite fatal error:", err);
    process.exit(1);
});
