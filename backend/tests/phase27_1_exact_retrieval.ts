import assert from "assert";
import dotenv from "dotenv";
dotenv.config();

import { getPool } from "../src/db/client";
import {
    getActiveAnalysisId,
    searchChunksByExactMetadata,
    searchSimilarChunksByVector
} from "../src/db/repositories/repositoryDb";
import { retrieveContext } from "../src/services/ragService";
import { extractExactSearchTerms, scoreExactCandidate } from "../src/services/exactSearchService";
import { validateAndBuildCitations } from "../src/services/llmService";

async function runTestSuite() {
    console.log("=================================================");
    console.log("   PHASE 27.1: EXACT RETRIEVAL & VECTOR MERGE    ");
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
        const repoFullName = repoRes.rows[0].full_name;

        // ----------------------------------------------------
        // TEST 1: Exact symbol retrieval when vector similarity is low
        // ----------------------------------------------------
        await test("1. Exact symbol retrieval when vector similarity is low", async () => {
            const query = "What does the MediaController class do?";
            // Query with high similarity threshold (0.95) to simulate low vector similarity filtering
            const result = await retrieveContext(repoId, query, {
                similarityThreshold: 0.95
            });

            assert.ok(result.sourceCount > 0, "Should return sources for exact symbol");
            assert.ok(result.sources.length > 0, "Sources array must not be empty");

            const topSource = result.sources[0];
            assert.ok(
                topSource.symbol.includes("MediaController"),
                `Top source symbol should be MediaController, got: ${topSource.symbol}`
            );
            assert.ok(
                topSource.similarity >= 0.98,
                `Exact symbol match should have similarity >= 0.98, got: ${topSource.similarity}`
            );
            assert.strictEqual(
                topSource.matchType,
                "exact_symbol",
                "Top source matchType should be exact_symbol"
            );
        });

        // ----------------------------------------------------
        // TEST 2: Exact file-path retrieval
        // ----------------------------------------------------
        await test("2. Exact file-path retrieval", async () => {
            const query = "Show me backend/src/controllers/media.controller.ts";
            const result = await retrieveContext(repoId, query, {
                candidateLimit: 6,
                maxChunks: 4
            });

            assert.ok(result.sourceCount > 0, "Should return sources for file path");
            const hasTargetFile = result.sources.some((s) =>
                s.filePath.toLowerCase().includes("media.controller.ts")
            );
            assert.ok(
                hasTargetFile,
                "Retrieved sources must contain chunks from media.controller.ts"
            );

            // First source should be from the requested file
            const topSource = result.sources[0];
            assert.ok(
                topSource.filePath.toLowerCase().includes("media.controller.ts"),
                `Top source filePath should be media.controller.ts, got: ${topSource.filePath}`
            );
            assert.strictEqual(
                topSource.matchType,
                "exact_file",
                "Top source should have matchType exact_file"
            );
        });

        // ----------------------------------------------------
        // TEST 3: Exact and vector results merged without duplicates
        // ----------------------------------------------------
        await test("3. Exact and vector results merged without duplicates", async () => {
            const query = "MediaController.getTrending";
            const result = await retrieveContext(repoId, query, {
                candidateLimit: 12,
                maxChunks: 8
            });

            assert.ok(result.sources.length > 0, "Must return sources");

            // Verify deduplication by chunkId
            const chunkIds = result.sources.map((s) => s.chunkId);
            const uniqueChunkIds = new Set(chunkIds);
            assert.strictEqual(
                chunkIds.length,
                uniqueChunkIds.size,
                "All returned chunkIds must be strictly unique (no duplicates)"
            );

            // Verify top source is exact match
            assert.ok(
                result.sources[0].symbol.includes("MediaController"),
                "Top source should be MediaController"
            );
        });

        // ----------------------------------------------------
        // TEST 4: Vector fallback when exact retrieval finds nothing
        // ----------------------------------------------------
        await test("4. Vector fallback when exact retrieval finds nothing", async () => {
            // General question with no symbols or file paths
            const query = "explain the overall application routing and entertainment media data flow";
            const result = await retrieveContext(repoId, query, {
                disableExactSearch: false,
                similarityThreshold: 0.50
            });

            // Either vector results are returned or graceful empty message
            assert.ok(result.repositoryId, "Must return valid repositoryId");
            if (result.sourceCount > 0) {
                // If vector search returned chunks, verify they are vector type
                assert.ok(result.sources.length > 0, "Sources present");
                const hasVectorMatches = result.sources.some(
                    (s) => s.matchType === "vector" || s.matchType === undefined
                );
                assert.ok(hasVectorMatches, "Should contain vector search matches");
            } else {
                // If no chunks passed threshold, verify graceful message
                assert.ok(result.message, "Should return graceful message");
            }
        });

        // ----------------------------------------------------
        // TEST 5: Exact retrieval when embeddings are unavailable
        // ----------------------------------------------------
        await test("5. Exact retrieval when embeddings are unavailable", async () => {
            const query = "MediaController";
            // Simulate embeddings unavailable by disabling vector search
            const result = await retrieveContext(repoId, query, {
                disableVectorSearch: true
            });

            assert.ok(!result.hasNoEmbeddings, "Should not return hasNoEmbeddings error when exact matches exist");
            assert.ok(!result.quotaExceeded, "Should not return quotaExceeded when exact matches exist");
            assert.ok(result.sourceCount > 0, "Must return exact sources even without vector search");
            assert.ok(
                result.context.includes("MediaController"),
                "Context text must contain MediaController content"
            );
            assert.ok(
                result.sources[0].symbol.includes("MediaController"),
                "Top source must be MediaController"
            );
        });

        // ----------------------------------------------------
        // TEST 6: Active-analysis isolation
        // ----------------------------------------------------
        await test("6. Active-analysis isolation", async () => {
            const activeId = await getActiveAnalysisId(repoId);
            assert.ok(activeId, "Active analysis ID must be found");

            // Query chunks specifically for this active analysis
            const exactChunks = await searchChunksByExactMetadata(repoId, "MediaController", {
                analysisId: activeId
            });

            assert.ok(exactChunks.length > 0, "Must find exact chunks in active analysis");
            for (const chunk of exactChunks) {
                if (chunk.analysisId) {
                    assert.strictEqual(
                        chunk.analysisId,
                        activeId,
                        `Chunk analysisId (${chunk.analysisId}) must match active analysis (${activeId})`
                    );
                }
            }

            // Verify all analyses in DB for this repo and confirm active is the latest
            const analysesRes = await pool.query(
                `SELECT id, analyzed_at FROM analysis_results 
                 WHERE repository_id = $1 AND (status IS NULL OR status = 'completed') 
                 ORDER BY analyzed_at DESC`,
                [repoId]
            );
            assert.ok(analysesRes.rows.length > 0, "Must have analyses");
            assert.strictEqual(
                analysesRes.rows[0].id,
                activeId,
                "getActiveAnalysisId must return the newest completed analysis"
            );
        });

        // ----------------------------------------------------
        // TEST 7: Citation metadata preservation
        // ----------------------------------------------------
        await test("7. Citation metadata preservation", async () => {
            const query = "MediaController.getTopPicks";
            const result = await retrieveContext(repoId, query, {
                maxChunks: 4
            });

            assert.ok(result.sources.length > 0, "Must return sources");

            for (const source of result.sources) {
                assert.ok(source.chunkId, "source.chunkId must be present");
                assert.ok(source.filePath, "source.filePath must be present");
                assert.ok(typeof source.startLine === "number", "source.startLine must be a number");
                assert.ok(typeof source.endLine === "number", "source.endLine must be a number");
                assert.ok(source.startLine > 0, "source.startLine must be > 0");
                assert.ok(source.endLine >= source.startLine, "source.endLine must be >= startLine");
                assert.ok(typeof source.similarity === "number", "source.similarity must be a number");
                assert.ok(source.content && source.content.length > 0, "source.content must not be empty");
            }

            // Test citation validator compatibility
            const answerText = "The top picks endpoint is implemented in [1] and uses the controller defined in [2].";
            const candidateIds = [1, 2, 99]; // 99 is invalid out of bounds

            const { validatedCitations, finalAnswer } = validateAndBuildCitations(
                candidateIds,
                answerText,
                result.sources
            );

            assert.strictEqual(finalAnswer, answerText, "Answer text must be preserved");
            assert.strictEqual(validatedCitations.length, 2, "Only citations [1] and [2] must be validated (99 dropped)");

            assert.strictEqual(validatedCitations[0].id, 1);
            assert.strictEqual(validatedCitations[0].chunkId, result.sources[0].chunkId);
            assert.strictEqual(validatedCitations[0].filePath, result.sources[0].filePath);
            assert.strictEqual(validatedCitations[0].startLine, result.sources[0].startLine);
            assert.strictEqual(validatedCitations[0].endLine, result.sources[0].endLine);

            assert.strictEqual(validatedCitations[1].id, 2);
            assert.strictEqual(validatedCitations[1].chunkId, result.sources[1].chunkId);
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
