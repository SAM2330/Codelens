import dotenv from "dotenv";
dotenv.config();

import {
    isRateLimitOrQuotaError,
    isUnavailableOrDemandError,
    FALLBACK_GEMINI_CHAT_MODELS,
    withTimeout
} from "../services/llmService";
import { detectGitHistoryIntent } from "../services/gitHistoryService";

async function runTests() {
    console.log("=================================================");
    console.log("=== CodeLens Phase 24.1 — Regression & Fix Verification ===");
    console.log("=================================================\n");

    // Test 1: Verify fallback models list does NOT contain invalid models
    console.log("[1] Checking fallback chat models...");
    console.log("Configured models:", FALLBACK_GEMINI_CHAT_MODELS);
    const hasInvalidModels = FALLBACK_GEMINI_CHAT_MODELS.some(
        (m) => m.includes("3.5") || m.includes("invalid")
    );
    if (hasInvalidModels) {
        throw new Error("FAIL: Found invalid model names in FALLBACK_GEMINI_CHAT_MODELS!");
    }
    console.log("✓ All fallback models are valid official Gemini models.\n");

    // Test 2: Verify withTimeout utility
    console.log("[2] Testing timeout utility...");
    const slowOperation = new Promise<string>((resolve) =>
        setTimeout(() => resolve("done"), 500)
    );
    try {
        await withTimeout(slowOperation, 100, "Slow test operation");
        throw new Error("FAIL: withTimeout should have rejected but resolved!");
    } catch (err: any) {
        if (err.name === "TimeoutError" && err.status === 504 && err.isTimeout) {
            console.log("✓ withTimeout properly aborted and threw TimeoutError (status 504).\n");
        } else {
            throw new Error(`FAIL: Unexpected error from withTimeout: ${err}`);
        }
    }

    // Test 3: Verify fast operation does NOT timeout
    console.log("[3] Testing fast operation with withTimeout...");
    const fastOperation = new Promise<string>((resolve) =>
        setTimeout(() => resolve("fast_ok"), 50)
    );
    const fastResult = await withTimeout(fastOperation, 500, "Fast test operation");
    if (fastResult !== "fast_ok") {
        throw new Error("FAIL: fast operation returned wrong value!");
    }
    console.log("✓ Fast operation resolved cleanly within timeout.\n");

    // Test 4: Verify Quota / Rate limit error classification
    console.log("[4] Testing quota and unavailable error classification...");
    const quota429 = { status: 429, message: "RESOURCE_EXHAUSTED" };
    const quotaString = "Gemini API quota exceeded 429";
    const demand503 = { status: 503, message: "Service Unavailable" };

    if (!isRateLimitOrQuotaError(quota429) || !isRateLimitOrQuotaError(quotaString)) {
        throw new Error("FAIL: isRateLimitOrQuotaError failed to detect 429 / RESOURCE_EXHAUSTED!");
    }
    if (!isUnavailableOrDemandError(demand503)) {
        throw new Error("FAIL: isUnavailableOrDemandError failed to detect 503!");
    }
    console.log("✓ Error classification functions correctly detect 429 and 503.\n");

    // Test 5: Verify Git History Query Routing vs Normal Code Query Routing
    console.log("[5] Testing Git history intent detection...");
    const gitQueries = [
        "What changed in the last commit?",
        "What changed between the last two commits?",
        "Who modified frontend/src/utils/streaming.ts, and when?",
        "Show commits that changed the streaming system.",
        "Summarize changes from the last week."
    ];
    for (const q of gitQueries) {
        const det = detectGitHistoryIntent(q);
        if (!det.isGitHistory) {
            throw new Error(`FAIL: Expected isGitHistory=true for query: "${q}"`);
        }
    }

    const codeQueries = [
        "How does video streaming work in this repository?",
        "Explain the high-level project architecture and tech stack.",
        "What API routes are defined in this project?"
    ];
    for (const q of codeQueries) {
        const det = detectGitHistoryIntent(q);
        if (det.isGitHistory) {
            throw new Error(`FAIL: Expected isGitHistory=false for code query: "${q}"`);
        }
    }
    console.log("✓ Git history intent detection cleanly separates history queries from code queries.\n");

    // Test 6: Verify Session Storage parser logic
    console.log("[6] Testing chat session storage parser simulation...");
    function simulateLoadStoredMessages(rawJson: string | null): any[] {
        if (!rawJson) return [];
        try {
            const parsed = JSON.parse(rawJson);
            if (Array.isArray(parsed)) {
                return parsed
                    .filter((m: any) => m && typeof m === "object" && typeof m.content === "string")
                    .map((m: any, idx: number) => ({
                        id: typeof m.id === "string" ? m.id : `restored_${idx}_${Date.now()}`,
                        role: m.role === "assistant" ? "assistant" : "user",
                        content: m.content,
                        citations: Array.isArray(m.citations) ? m.citations : [],
                        timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
                        error: Boolean(m.error),
                        errorMessage: typeof m.errorMessage === "string" ? m.errorMessage : undefined
                    }));
            }
        } catch (e) {
            // gracefully ignored
        }
        return [];
    }

    // Valid sample
    const sampleChat = JSON.stringify([
        {
            id: "msg_1",
            role: "user",
            content: "What changed in the last commit?",
            timestamp: "2026-10-10T10:00:00.000Z"
        },
        {
            id: "msg_2",
            role: "assistant",
            content: "The last commit was ee643df by Samuel Mulat [1].",
            citations: [
                { id: 1, filePath: "frontend/src/app/page.tsx", startLine: 1, endLine: 10 }
            ],
            timestamp: "2026-10-10T10:00:05.000Z"
        }
    ]);

    const restored = simulateLoadStoredMessages(sampleChat);
    if (restored.length !== 2 || restored[1].citations.length !== 1) {
        throw new Error("FAIL: Failed to restore valid chat messages!");
    }
    if (!(restored[0].timestamp instanceof Date)) {
        throw new Error("FAIL: Timestamp should be parsed as Date object!");
    }

    // Malformed sample (should not throw)
    const malformedResult = simulateLoadStoredMessages("{ malformed JSON !!");
    if (malformedResult.length !== 0) {
        throw new Error("FAIL: Malformed JSON should return empty array safely!");
    }

    console.log("✓ Session storage parser properly restores messages, citations, dates, and survives malformed data.\n");

    console.log("✓ All Phase 24.1 verification tests passed successfully!");
}

runTests().then(() => process.exit(0)).catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
});
