import dotenv from "dotenv";
dotenv.config();

import { detectGitHistoryIntent, retrieveGitHistoryContext } from "../services/gitHistoryService";
import { getStoredGitAnalysisByRepositoryId, getStoredAnalyzedFilesByRepositoryId } from "../db/repositories/repositoryDb";
import { retrieveContext } from "../services/ragService";
import { generateRepositoryAnswer } from "../services/llmService";

async function runTests() {
    console.log("=================================================");
    console.log("=== CodeLens Phase 24 — Git History Intelligence Test ===");
    console.log("=================================================\n");

    const repoId = "SAM2330/IMDB";

    // 1. Check DB retrieval of Git analysis
    console.log(`[1] Fetching stored Git analysis for '${repoId}'...`);
    const gitData = await getStoredGitAnalysisByRepositoryId(repoId);
    if (!gitData || !gitData.git) {
        throw new Error(`Failed to find stored git analysis for ${repoId}`);
    }
    console.log(`✓ Retrieved git analysis: ${gitData.git.commits?.length || 0} commits, ${gitData.git.recentChanges?.length || 0} file change records.`);

    const gitAnalysis = gitData.git;
    const files = await getStoredAnalyzedFilesByRepositoryId(repoId);
    console.log(`✓ Retrieved analyzed files count: ${files?.length || 0}\n`);

    // Helper function to simulate askRepository
    async function askSimulated(query: string) {
        console.log(`--- Query: "${query}" ---`);
        const detection = detectGitHistoryIntent(query);
        console.log(`Detected: isGitHistory=${detection.isGitHistory}, intent=${detection.intent || "NONE"}`);

        let ragContext = "";
        let combinedSources: any[] = [];
        let gitContext = "";

        if (detection.isGitHistory) {
            const gitResult = retrieveGitHistoryContext(gitAnalysis, detection, files || []);
            gitContext = gitResult.gitContext;
            combinedSources = [...gitResult.sources];

            if (detection.needsCodeContext) {
                try {
                    const ragResult = await retrieveContext(repoId, query);
                    if (ragResult && !ragResult.notFound && !ragResult.quotaExceeded) {
                        ragContext = ragResult.context || "";
                        if (ragResult.sources && ragResult.sources.length > 0) {
                            const seenPaths = new Set(combinedSources.map((s) => s.filePath));
                            for (const s of ragResult.sources) {
                                if (!seenPaths.has(s.filePath)) {
                                    combinedSources.push(s);
                                    seenPaths.add(s.filePath);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn("Optional code retrieval skipped:", e);
                }
            }

            console.log(`Generated Git Context (${gitContext.length} chars), Sources: ${combinedSources.length}`);
            const answerResult = await generateRepositoryAnswer(
                query,
                ragContext,
                combinedSources,
                { gitHistoryContext: gitContext }
            );

            console.log(`Answer:\n${answerResult.answer}`);
            console.log(`Citations (${answerResult.citations.length}):`, answerResult.citations.map(c => `[${c.id}] ${c.filePath}`));
            console.log("--------------------------------------------------\n");
            return answerResult;
        } else {
            const ragResult = await retrieveContext(repoId, query);
            const answerResult = await generateRepositoryAnswer(
                query,
                ragResult.context,
                ragResult.sources
            );
            console.log(`Code RAG Answer:\n${answerResult.answer.slice(0, 300)}...`);
            console.log(`Citations: ${answerResult.citations.length}`);
            console.log("--------------------------------------------------\n");
            return answerResult;
        }
    }

    // Test 1: Last commit
    console.log(">>> TEST 1: What changed in the last commit?");
    await askSimulated("What changed in the last commit?");

    // Test 2: Compare last two commits
    console.log(">>> TEST 2: What changed between the last two commits?");
    await askSimulated("What changed between the last two commits?");

    // Test 3: Who modified file and when
    console.log(">>> TEST 3: Who modified frontend/src/utils/streaming.ts, and when?");
    await askSimulated("Who modified frontend/src/utils/streaming.ts, and when?");

    // Test 4: Commits that changed streaming system
    console.log(">>> TEST 4: Show commits that changed the streaming system.");
    await askSimulated("Show commits that changed the streaming system.");

    // Test 5: Summarize changes from the last week
    console.log(">>> TEST 5: Summarize changes from the last week.");
    await askSimulated("Summarize changes from the last week.");

    // Test 6: Function introduction
    console.log(">>> TEST 6: When was getStreamUrl introduced?");
    await askSimulated("When was getStreamUrl introduced?");

    // Test 7: Standard architecture question (no regression)
    console.log(">>> TEST 7: Explain the project architecture.");
    await askSimulated("Explain the high-level project architecture and tech stack.");

    // Test 8: Repository with no Git history
    console.log(">>> TEST 8: Repository with no history");
    const emptyDetection = detectGitHistoryIntent("What changed in the last commit?");
    const emptyResult = retrieveGitHistoryContext(null, emptyDetection);
    console.log("Empty history handling:", emptyResult.message || emptyResult.gitContext);
    console.log("Has history:", emptyResult.hasHistory);
    console.log("--------------------------------------------------\n");

    console.log("✓ All Phase 24 test cases completed successfully!");
}

runTests().then(() => process.exit(0)).catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
});
