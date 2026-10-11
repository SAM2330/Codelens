import assert from "assert";
import http from "http";
import express from "express";
import cors from "cors";
import repositoryRoutes from "../src/routes/repositoryRoutes";
import userRoutes from "../src/routes/userRoutes";
import { getPool } from "../src/db/client";

// Set test environment
process.env.NODE_ENV = "test";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/repositories", repositoryRoutes);
app.use("/api/user", userRoutes);

let server: http.Server;
const PORT = 5097;
const BASE_URL = `http://localhost:${PORT}`;

const USER_A_ID = "11111111-1111-4111-a111-111111111111";
const USER_A_TOKEN = `test-token:${USER_A_ID}:user_a@example.com`;

const USER_B_ID = "22222222-2222-4222-b222-222222222222";
const USER_B_TOKEN = `test-token:${USER_B_ID}:user_b@example.com`;

const USER_C_ID = "33333333-3333-4333-c333-333333333333";
const USER_C_TOKEN = `test-token:${USER_C_ID}:user_c@example.com`;

async function runTests() {
    console.log("=================================================");
    console.log("     PHASE 25.1 INTEGRATION TEST SUITE          ");
    console.log("=================================================\n");

    server = app.listen(PORT);
    console.log(`Test server running on port ${PORT}\n`);

    const pool = getPool();
    let passed = 0;
    let failed = 0;

    async function queryWithRetry(sql: string, params: any[] = [], retries = 4): Promise<any> {
        for (let i = 0; i < retries; i++) {
            try {
                return await pool.query(sql, params);
            } catch (err: any) {
                if (i === retries - 1) throw err;
                console.log(`[DB] Retry ${i + 1}/${retries} after transient connection error: ${err.message || err}`);
                await new Promise((r) => setTimeout(r, 2500));
            }
        }
    }

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

    // Helper fetch wrapper
    async function api(path: string, options: RequestInit = {}) {
        return fetch(`${BASE_URL}${path}`, options);
    }

    try {
        // Find existing IMDB repository with retry
        const repoRes = await queryWithRetry(
            "SELECT id, full_name FROM repositories WHERE LOWER(full_name) = 'sam2330/imdb' LIMIT 1"
        );
        assert.ok(repoRes.rows.length > 0, "IMDB repository must exist in database");
        const imdbRepoId = repoRes.rows[0].id;

        // Clean any existing test records for clean testing
        await queryWithRetry("DELETE FROM user_chat_messages WHERE user_id IN ($1, $2, $3)", [
            USER_A_ID,
            USER_B_ID,
            USER_C_ID
        ]);
        await queryWithRetry("DELETE FROM user_repositories WHERE user_id IN ($1, $2, $3)", [
            USER_A_ID,
            USER_B_ID,
            USER_C_ID
        ]);

        // TEST 1: Signed-in User A analyzes repository -> appears in User A's workspace with role owner
        await test("1. User A analyzes repo -> appears in User A workspace as owner", async () => {
            const resA = await api("/api/repositories/analyze", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${USER_A_TOKEN}`
                },
                body: JSON.stringify({ url: "https://github.com/SAM2330/IMDB" })
            });
            assert.strictEqual(resA.status, 200, "Analysis request should succeed");
            const analysisDataA = await resA.json();
            assert.ok(analysisDataA.id, "Analysis result must include repository ID");

            // Verify User A's repository list
            const userAReposRes = await api("/api/user/repositories", {
                headers: { Authorization: `Bearer ${USER_A_TOKEN}` }
            });
            assert.strictEqual(userAReposRes.status, 200);
            const userARepos = await userAReposRes.json();
            assert.strictEqual(userARepos.length, 1, "User A must have exactly 1 repository linked");
            assert.strictEqual(userARepos[0].id, imdbRepoId);
            assert.strictEqual(userARepos[0].userRole, "owner");
        });

        // TEST 2: Cache hit for User B creates correct user association
        await test("2. Cache hit for User B links repo to User B workspace as owner", async () => {
            const resB = await api("/api/repositories/analyze", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${USER_B_TOKEN}`
                },
                body: JSON.stringify({ url: "https://github.com/SAM2330/IMDB" })
            });
            assert.strictEqual(resB.status, 200);
            const analysisDataB = await resB.json();
            assert.strictEqual(analysisDataB.cached, true, "Must be a cache hit");

            const userBReposRes = await api("/api/user/repositories", {
                headers: { Authorization: `Bearer ${USER_B_TOKEN}` }
            });
            const userBRepos = await userBReposRes.json();
            assert.strictEqual(userBRepos.length, 1, "User B must have repository linked");
            assert.strictEqual(userBRepos[0].id, imdbRepoId);
            assert.strictEqual(userBRepos[0].userRole, "owner");
        });

        // TEST 3: User C (who hasn't analyzed any repo) cannot see User A or User B's repositories
        await test("3. User C cannot see other users' repository workspaces", async () => {
            const userCReposRes = await api("/api/user/repositories", {
                headers: { Authorization: `Bearer ${USER_C_TOKEN}` }
            });
            assert.strictEqual(userCReposRes.status, 200);
            const userCRepos = await userCReposRes.json();
            assert.strictEqual(userCRepos.length, 0, "User C must see an empty workspace (no leak of User A/B repos)");
        });

        // TEST 4: Guest (unauthenticated) cannot browse other users' workspaces
        await test("4. Guest cannot browse any user workspace or global repository directory", async () => {
            const guestUserRepos = await api("/api/user/repositories");
            assert.strictEqual(guestUserRepos.status, 401, "GET /api/user/repositories must reject unauthenticated requests (401)");

            const guestGlobalRepos = await api("/api/repositories");
            assert.strictEqual(guestGlobalRepos.status, 200);
            const guestGlobalData = await guestGlobalRepos.json();
            assert.strictEqual(guestGlobalData.length, 0, "GET /api/repositories for unauthenticated guest must return empty array");
        });

        // TEST 5: Chat persistence & isolation: User A messages not visible to User B or Guest
        await test("5. Chat persistence & isolation: User A messages not visible to User B or Guest", async () => {
            // User A sends message
            const chatSaveA = await api(`/api/user/repositories/${imdbRepoId}/chat/messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${USER_A_TOKEN}`
                },
                body: JSON.stringify({
                    role: "user",
                    content: "Secret question from User A about streaming architecture",
                    citations: []
                })
            });
            assert.strictEqual(chatSaveA.status, 201);

            // Guest attempts to read chat messages -> 401
            const guestChat = await api(`/api/user/repositories/${imdbRepoId}/chat/messages`);
            assert.strictEqual(guestChat.status, 401, "Guest must receive 401 on chat history");

            // User B reads chat messages -> empty list (cannot see User A's messages)
            const userBChatRes = await api(`/api/user/repositories/${imdbRepoId}/chat/messages`, {
                headers: { Authorization: `Bearer ${USER_B_TOKEN}` }
            });
            assert.strictEqual(userBChatRes.status, 200);
            const userBChat = await userBChatRes.json();
            assert.strictEqual(userBChat.length, 0, "User B must see empty chat, NOT User A's message");

            // User A reads chat messages -> sees their own message
            const userAChatRes = await api(`/api/user/repositories/${imdbRepoId}/chat/messages`, {
                headers: { Authorization: `Bearer ${USER_A_TOKEN}` }
            });
            const userAChat = await userAChatRes.json();
            assert.strictEqual(userAChat.length, 1);
            assert.strictEqual(userAChat[0].content, "Secret question from User A about streaming architecture");
        });

        // TEST 6: User B cannot delete or overwrite User A's chat
        await test("6. User B cannot clear User A's chat history", async () => {
            const clearResB = await api(`/api/user/repositories/${imdbRepoId}/chat/messages`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${USER_B_TOKEN}` }
            });
            assert.strictEqual(clearResB.status, 200);

            // User A's chat must still remain intact
            const userACheck = await api(`/api/user/repositories/${imdbRepoId}/chat/messages`, {
                headers: { Authorization: `Bearer ${USER_A_TOKEN}` }
            });
            const userACheckData = await userACheck.json();
            assert.strictEqual(userACheckData.length, 1, "User A's chat must not be deleted by User B's clear operation");
        });

        // TEST 7: Registration with unconfirmed email / invalid token handling
        await test("7. Unconfirmed / missing token does not establish authenticated backend session", async () => {
            const unauthRes = await api("/api/user/me", {
                headers: { Authorization: "Bearer " }
            });
            assert.strictEqual(unauthRes.status, 401, "Empty token must be rejected with 401");

            const badTokenRes = await api("/api/user/me", {
                headers: { Authorization: "Bearer invalid.fake.token" }
            });
            assert.strictEqual(badTokenRes.status, 401, "Invalid token must be rejected with 401");
        });

        // TEST 8: Code Viewer files, flows, and chunk endpoints continue working
        await test("8. Existing Code Viewer files, flows, and analysis continue working", async () => {
            const filesRes = await api(`/api/repositories/${imdbRepoId}/files`);
            assert.strictEqual(filesRes.status, 200);
            const files = await filesRes.json();
            assert.ok(Array.isArray(files) && files.length > 0, "Files endpoint must return stored files");

            const flowsRes = await api(`/api/repositories/${imdbRepoId}/flows`);
            assert.strictEqual(flowsRes.status, 200);
            const flows = await flowsRes.json();
            assert.ok(Array.isArray(flows.flows) && flows.flows.length > 0, "Flows endpoint must return stored code flows");

            const repoDetailRes = await api(`/api/repositories/${imdbRepoId}`);
            assert.strictEqual(repoDetailRes.status, 200);
            const repoDetail = await repoDetailRes.json();
            assert.strictEqual(repoDetail.id, imdbRepoId);
        });

        // Cleanup test data
        await queryWithRetry("DELETE FROM user_chat_messages WHERE user_id IN ($1, $2, $3)", [
            USER_A_ID,
            USER_B_ID,
            USER_C_ID
        ]);
        await queryWithRetry("DELETE FROM user_repositories WHERE user_id IN ($1, $2, $3)", [
            USER_A_ID,
            USER_B_ID,
            USER_C_ID
        ]);

        console.log("\n=================================================");
        console.log(`Results: ${passed} passed, ${failed} failed.`);
        console.log("=================================================\n");
    } catch (err) {
        console.error("\n❌ Test execution failed with error:", err);
        failed++;
    } finally {
        server.close();
        await pool.end();
        process.exit(failed > 0 ? 1 : 0);
    }
}

runTests();
