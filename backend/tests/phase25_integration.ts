import http from "http";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { Pool } from "pg";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
process.env.NODE_ENV = "test";

import repositoryRoutes from "../src/routes/repositoryRoutes";
import userRoutes from "../src/routes/userRoutes";
import {
    findCompletedAnalysisByCommit,
    linkUserRepository,
    getUserRepositories,
    checkUserRepositoryAccess,
    saveUserChatMessage,
    getUserChatMessages,
    clearUserChatMessages,
    upsertRepository,
    saveAnalysis
} from "../src/db/repositories/repositoryDb";
import { getLatestCommitSha, normalizeGitHubRepo } from "../src/services/githubService";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/repositories", repositoryRoutes);
app.use("/api/user", userRoutes);

const TEST_PORT = 5099;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL?.trim(),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
});

let server: http.Server;

const USER_A_ID = "11111111-aaaa-bbbb-cccc-111111111111";
const USER_A_TOKEN = `test-token:${USER_A_ID}:user_a@test.com`;

const USER_B_ID = "22222222-aaaa-bbbb-cccc-222222222222";
const USER_B_TOKEN = `test-token:${USER_B_ID}:user_b@test.com`;

async function runTests() {
    console.log("=================================================");
    console.log("       PHASE 25 INTEGRATION TEST SUITE           ");
    console.log("=================================================\n");

    server = app.listen(TEST_PORT);
    console.log(`Test server running on port ${TEST_PORT}\n`);

    let passed = 0;
    let failed = 0;

    async function test(name: string, fn: () => Promise<void>) {
        try {
            process.stdout.write(`TEST: ${name}... `);
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
        // Test 1: URL Normalization & Stable Identity
        await test("1. GitHub URL Normalization produces stable identities", async () => {
            const urls = [
                "https://github.com/SAM2330/IMDB",
                "https://github.com/SAM2330/IMDB.git",
                "https://github.com/SAM2330/IMDB/",
                "git@github.com:SAM2330/IMDB.git",
                "SAM2330/IMDB"
            ];

            for (const u of urls) {
                const norm = normalizeGitHubRepo(u);
                if (!norm || norm.fullName !== "SAM2330/IMDB" || norm.canonicalUrl !== "https://github.com/SAM2330/IMDB") {
                    throw new Error(`Normalization failed for ${u}: ${JSON.stringify(norm)}`);
                }
            }
        });

        // Test 2: Missing, Invalid, and Expired Tokens
        await test("2. Missing & invalid access tokens return 401 Unauthorized", async () => {
            // Missing token on protected endpoint
            const res1 = await fetch(`${BASE_URL}/api/user/me`);
            if (res1.status !== 401) {
                throw new Error(`Expected 401 for missing token, got ${res1.status}`);
            }

            // Invalid token
            const res2 = await fetch(`${BASE_URL}/api/user/me`, {
                headers: { Authorization: "Bearer bad-token-format-xyz" }
            });
            if (res2.status !== 401) {
                throw new Error(`Expected 401 for invalid token, got ${res2.status}`);
            }

            // Valid test token succeeds
            const res3 = await fetch(`${BASE_URL}/api/user/me`, {
                headers: { Authorization: `Bearer ${USER_A_TOKEN}` }
            });
            if (res3.status !== 200) {
                throw new Error(`Expected 200 for valid token, got ${res3.status}`);
            }
            const data3 = await res3.json();
            if (data3.user?.id !== USER_A_ID) {
                throw new Error(`User ID mismatch: expected ${USER_A_ID}, got ${data3.user?.id}`);
            }
        });

        // Test 3: Repository Ownership and Cross-User Access Denial
        await test("3. Private repository ownership & cross-user access denial (403)", async () => {
            // Create a private repository owned by User A
            const privRepoName = `private-repo-${Date.now()}`;
            const privFullName = `test-org/${privRepoName}`;
            const client = await pool.connect();
            let privRepoId: string;
            try {
                const ins = await client.query(`
                    INSERT INTO repositories (github_id, owner, name, full_name, github_url, default_branch, description, is_private)
                    VALUES ($1, 'test-org', $2, $3, $4, 'main', 'Test private repo', true)
                    RETURNING id;
                `, [Date.now(), privRepoName, privFullName, `https://github.com/${privFullName}`]);
                privRepoId = ins.rows[0].id;

                // Grant User A access
                await client.query(`
                    INSERT INTO user_repositories (user_id, repository_id, role)
                    VALUES ($1, $2, 'owner');
                `, [USER_A_ID, privRepoId]);
            } finally {
                client.release();
            }

            // Unauthenticated user -> 403 Forbidden
            const resUnauth = await fetch(`${BASE_URL}/api/repositories/${privRepoId}`);
            if (resUnauth.status !== 403) {
                throw new Error(`Expected 403 for unauthenticated access to private repo, got ${resUnauth.status}`);
            }

            // User B (not granted access) -> 403 Forbidden
            const resUserB = await fetch(`${BASE_URL}/api/repositories/${privRepoId}`, {
                headers: { Authorization: `Bearer ${USER_B_TOKEN}` }
            });
            if (resUserB.status !== 403) {
                throw new Error(`Expected 403 for User B access to private repo, got ${resUserB.status}`);
            }

            // User A (granted access) -> 200 OK
            const resUserA = await fetch(`${BASE_URL}/api/repositories/${privRepoId}`, {
                headers: { Authorization: `Bearer ${USER_A_TOKEN}` }
            });
            if (resUserA.status !== 200) {
                throw new Error(`Expected 200 for User A access to private repo, got ${resUserA.status}`);
            }
        });

        // Test 4 & 5: User B requesting the exact IMDB commit already analyzed by User A
        await test("4 & 5. User B requesting existing IMDB commit reuses cached analysis & embeddings without duplicates", async () => {
            // Find existing IMDB repository and commit
            const imdbRes = await pool.query(`
                SELECT r.id, r.full_name, a.commit_sha 
                FROM repositories r 
                JOIN analysis_results a ON r.id = a.repository_id 
                WHERE LOWER(r.full_name) = 'sam2330/imdb' AND a.status = 'completed'
                ORDER BY a.analyzed_at DESC
                LIMIT 1;
            `);

            if (imdbRes.rows.length === 0) {
                throw new Error("Precondition failed: No completed SAM2330/IMDB analysis found in database");
            }

            const { id: repoId, commit_sha: commitSha } = imdbRes.rows[0];

            // Record row counts before User B request
            const chunksBefore = await pool.query("SELECT count(*) FROM code_chunks WHERE repository_id = $1;", [repoId]);
            const analysesBefore = await pool.query("SELECT count(*) FROM analysis_results WHERE repository_id = $1;", [repoId]);

            // User B requests analysis of SAM2330/IMDB
            const res = await fetch(`${BASE_URL}/api/repositories/analyze`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${USER_B_TOKEN}`
                },
                body: JSON.stringify({ url: "https://github.com/SAM2330/IMDB" })
            });

            if (res.status !== 200) {
                const errBody = await res.text();
                throw new Error(`Analysis request failed (${res.status}): ${errBody}`);
            }

            const data = await res.json();

            // Verify cache hit indicators
            if (data.cached !== true) {
                throw new Error(`Expected cached: true, got ${data.cached}`);
            }
            if (data.commitSha !== commitSha) {
                throw new Error(`Expected commitSha: ${commitSha}, got ${data.commitSha}`);
            }

            // Verify chunks & analyses were NOT duplicated
            const chunksAfter = await pool.query("SELECT count(*) FROM code_chunks WHERE repository_id = $1;", [repoId]);
            const analysesAfter = await pool.query("SELECT count(*) FROM analysis_results WHERE repository_id = $1;", [repoId]);

            if (Number(chunksAfter.rows[0].count) !== Number(chunksBefore.rows[0].count)) {
                throw new Error(`Code chunks were duplicated! Before: ${chunksBefore.rows[0].count}, After: ${chunksAfter.rows[0].count}`);
            }
            if (Number(analysesAfter.rows[0].count) !== Number(analysesBefore.rows[0].count)) {
                throw new Error(`Analysis results were duplicated! Before: ${analysesBefore.rows[0].count}, After: ${analysesAfter.rows[0].count}`);
            }

            // Verify User B is linked in user_repositories
            const userBLink = await pool.query(
                "SELECT * FROM user_repositories WHERE user_id = $1 AND repository_id = $2;",
                [USER_B_ID, repoId]
            );
            if (userBLink.rows.length === 0) {
                throw new Error("User B was not linked to repository in user_repositories table!");
            }
        });

        // Test 6: Incomplete or failed analysis is NOT mistaken for a cache hit
        await test("6. Incomplete/failed analyses are not treated as cache hits", async () => {
            const fakeCommit = "failed-commit-sha-99999";
            const client = await pool.connect();
            try {
                // Insert a failed analysis record
                const repo = await client.query("SELECT id FROM repositories WHERE full_name = 'SAM2330/IMDB' LIMIT 1;");
                await client.query(`
                    INSERT INTO analysis_results (repository_id, commit_sha, status, indexing_version, analyzed_at)
                    VALUES ($1, $2, 'failed', '1.0', NOW());
                `, [repo.rows[0].id, fakeCommit]);

                // Check cache lookup
                const cacheResult = await findCompletedAnalysisByCommit("SAM2330/IMDB", fakeCommit, "1.0");
                if (cacheResult !== null) {
                    throw new Error("Cache lookup returned a hit for a 'failed' status analysis!");
                }
            } finally {
                await client.query("DELETE FROM analysis_results WHERE commit_sha = $1;", [fakeCommit]);
                client.release();
            }
        });

        // Test 7: Concurrent requests for same repo and commit are safe
        await test("7. Concurrent requests for same repository and commit execute safely without conflict", async () => {
            const [res1, res2] = await Promise.all([
                fetch(`${BASE_URL}/api/repositories/analyze`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${USER_A_TOKEN}`
                    },
                    body: JSON.stringify({ url: "https://github.com/SAM2330/IMDB" })
                }),
                fetch(`${BASE_URL}/api/repositories/analyze`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${USER_B_TOKEN}`
                    },
                    body: JSON.stringify({ url: "https://github.com/SAM2330/IMDB" })
                })
            ]);

            if (res1.status !== 200 || res2.status !== 200) {
                throw new Error(`Concurrent requests failed: res1=${res1.status}, res2=${res2.status}`);
            }

            const data1 = await res1.json();
            const data2 = await res2.json();

            if (data1.cached !== true || data2.cached !== true) {
                throw new Error("Both concurrent requests should return cached: true for existing IMDB analysis");
            }
        });

        // Test 8: User-Specific Chat Histories Remain Isolated
        await test("8. User-specific chat histories remain completely isolated between User A and User B", async () => {
            const repoRes = await pool.query("SELECT id FROM repositories WHERE full_name = 'SAM2330/IMDB' LIMIT 1;");
            const repoId = repoRes.rows[0].id;

            // Clear previous test chat messages
            await clearUserChatMessages(USER_A_ID, repoId);
            await clearUserChatMessages(USER_B_ID, repoId);

            // User A writes a message
            const msgA = await fetch(`${BASE_URL}/api/user/repositories/${repoId}/chat/messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${USER_A_TOKEN}`
                },
                body: JSON.stringify({
                    role: "user",
                    content: "Confidential query from User A: What are User A credentials?"
                })
            });
            if (msgA.status !== 201) {
                throw new Error(`Failed to post message for User A: ${msgA.status}`);
            }

            // User B writes a message
            const msgB = await fetch(`${BASE_URL}/api/user/repositories/${repoId}/chat/messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${USER_B_TOKEN}`
                },
                body: JSON.stringify({
                    role: "user",
                    content: "General query from User B: Explain movie controller."
                })
            });
            if (msgB.status !== 201) {
                throw new Error(`Failed to post message for User B: ${msgB.status}`);
            }

            // Fetch User A messages
            const getA = await fetch(`${BASE_URL}/api/user/repositories/${repoId}/chat/messages`, {
                headers: { Authorization: `Bearer ${USER_A_TOKEN}` }
            });
            const listA = await getA.json();

            // Fetch User B messages
            const getB = await fetch(`${BASE_URL}/api/user/repositories/${repoId}/chat/messages`, {
                headers: { Authorization: `Bearer ${USER_B_TOKEN}` }
            });
            const listB = await getB.json();

            // Verify User A only sees their own messages
            if (listA.length !== 1 || !listA[0].content.includes("User A")) {
                throw new Error(`User A chat list leak or mismatch: ${JSON.stringify(listA)}`);
            }

            // Verify User B only sees their own messages
            if (listB.length !== 1 || !listB[0].content.includes("User B")) {
                throw new Error(`User B chat list leak or mismatch: ${JSON.stringify(listB)}`);
            }

            // Clean up test chat messages
            await clearUserChatMessages(USER_A_ID, repoId);
            await clearUserChatMessages(USER_B_ID, repoId);
        });

        // Test 9: Existing Code Viewer & Endpoints continue working
        await test("9. Existing Code Viewer files, flows, and chunk endpoints continue working", async () => {
            const repoRes = await pool.query("SELECT id FROM repositories WHERE full_name = 'SAM2330/IMDB' LIMIT 1;");
            const repoId = repoRes.rows[0].id;

            // Files endpoint
            const filesRes = await fetch(`${BASE_URL}/api/repositories/${repoId}/files`);
            if (filesRes.status !== 200) {
                throw new Error(`GET /files returned ${filesRes.status}`);
            }
            const files = await filesRes.json();
            if (!Array.isArray(files) || files.length === 0) {
                throw new Error("GET /files returned empty array");
            }

            // Flows endpoint
            const flowsRes = await fetch(`${BASE_URL}/api/repositories/${repoId}/flows`);
            if (flowsRes.status !== 200) {
                throw new Error(`GET /flows returned ${flowsRes.status}`);
            }

            // Chunks endpoint
            const chunksRes = await fetch(`${BASE_URL}/api/repositories/${repoId}/chunks`);
            if (chunksRes.status !== 200) {
                throw new Error(`GET /chunks returned ${chunksRes.status}`);
            }
            const chunks = await chunksRes.json();
            if (!Array.isArray(chunks) || chunks.length === 0) {
                throw new Error("GET /chunks returned empty array");
            }
        });

    } finally {
        server.close();
        await pool.end();
    }

    console.log("\n=================================================");
    console.log(`Results: ${passed} passed, ${failed} failed.`);
    console.log("=================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error("Fatal test error:", err);
    if (server) server.close();
    process.exit(1);
});
