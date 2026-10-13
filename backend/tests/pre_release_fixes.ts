import assert from "assert";
import dotenv from "dotenv";
dotenv.config();

import { verifySupabaseToken } from "../src/services/authService";
import { requireAuth } from "../src/middleware/auth";
import { analyzeAST } from "../src/services/astAnalyzer";
import { getPool } from "../src/db/client";

async function runTestSuite() {
    console.log("=================================================");
    console.log("     PRE-RELEASE RELEASE-BLOCKER VERIFICATION    ");
    console.log("=================================================\n");

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
        // ----------------------------------------------------
        // TEST 1: Supabase Authentication - Invalid & Expired Token Recovery
        // ----------------------------------------------------
        await test("1. Invalid, malformed, and empty tokens return null safely without throwing", async () => {
            const emptyRes = await verifySupabaseToken("");
            assert.strictEqual(emptyRes, null, "Empty token must return null");

            const malformedRes = await verifySupabaseToken("not-a-valid-jwt");
            assert.strictEqual(malformedRes, null, "Malformed token must return null");

            const badSignatureRes = await verifySupabaseToken(
                "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.fake_signature_xxxxxx"
            );
            assert.strictEqual(badSignatureRes, null, "Invalid signature token must return null");
        });

        // ----------------------------------------------------
        // TEST 2: requireAuth middleware returns 401 on authentication failures
        // ----------------------------------------------------
        await test("2. requireAuth middleware rejects missing & invalid tokens with HTTP 401", async () => {
            let statusCalled: number | null = null;
            let jsonPayload: any = null;

            const mockRes = {
                status: (code: number) => {
                    statusCalled = code;
                    return {
                        json: (data: any) => {
                            jsonPayload = data;
                        }
                    };
                }
            } as any;

            // Case A: Missing authorization header
            statusCalled = null;
            jsonPayload = null;
            await requireAuth({ headers: {} } as any, mockRes, () => {
                assert.fail("next() should not be called on missing token");
            });
            assert.strictEqual(statusCalled, 401, "Missing token should return 401");
            assert.ok(jsonPayload?.error, "Error message must be present");

            // Case B: Invalid bearer token
            statusCalled = null;
            jsonPayload = null;
            await requireAuth(
                { headers: { authorization: "Bearer invalid-token-xyz" } } as any,
                mockRes,
                () => {
                    assert.fail("next() should not be called on invalid token");
                }
            );
            assert.strictEqual(statusCalled, 401, "Invalid token should return 401");
            assert.strictEqual(jsonPayload?.message, "Authentication failed");
        });

        // ----------------------------------------------------
        // TEST 3: AST parsing error recovery on malformed files
        // ----------------------------------------------------
        await test("3. AST parser recovers from syntax errors and returns empty AST without crashing", async () => {
            const malformedContent = `
                function brokenSyntax() {
                    const x = {{{{ ;;;
                    class class class
            `;

            const result = analyzeAST("src/broken.ts", malformedContent);
            assert.ok(result, "Result must not be null/undefined");
            assert.deepStrictEqual(result.functions, [], "functions must be empty array");
            assert.deepStrictEqual(result.classes, [], "classes must be empty array");
            assert.deepStrictEqual(result.interfaces, [], "interfaces must be empty array");
            assert.deepStrictEqual(result.types, [], "types must be empty array");
            assert.deepStrictEqual(result.imports, [], "imports must be empty array");
            assert.deepStrictEqual(result.exports, [], "exports must be empty array");

            // Valid code should still parse correctly
            const validContent = `
                export class TestService {
                    public doWork(): void {
                        console.log("working");
                    }
                }
            `;
            const validResult = analyzeAST("src/service.ts", validContent);
            assert.strictEqual(validResult.classes.length, 1, "Valid class should be extracted");
            assert.strictEqual(validResult.classes[0].name, "TestService");
            assert.strictEqual(validResult.functions.length, 1, "Valid method should be extracted");
            assert.strictEqual(validResult.functions[0].name, "doWork");
        });

        // ----------------------------------------------------
        // TEST 4: Database connection pool configuration
        // ----------------------------------------------------
        await test("4. Database client configures finite timeouts and pool limits", async () => {
            const pool = getPool();
            assert.ok(pool, "Pool must be initialized");
            assert.strictEqual(pool.options.max, 10, "Pool max must be set to 10");
            assert.strictEqual(pool.options.connectionTimeoutMillis, 10000, "Connection timeout must be 10000ms");
            assert.strictEqual(pool.options.idleTimeoutMillis, 30000, "Idle timeout must be 30000ms");

            // Ensure connection string does not have leading whitespace
            const connStr = pool.options.connectionString;
            if (connStr) {
                assert.strictEqual(connStr, connStr.trim(), "connectionString must be trimmed");
            }
        });

        // ----------------------------------------------------
        // TEST 5: Production database schema parity
        // ----------------------------------------------------
        await test("5. Database contains user_repositories, user_chat_messages, and required columns", async () => {
            const pool = getPool();

            // Verify user_repositories table
            const userRepos = await pool.query(`
                SELECT table_name FROM information_schema.tables 
                WHERE table_name = 'user_repositories';
            `);
            assert.strictEqual(userRepos.rows.length, 1, "user_repositories table must exist");

            // Verify user_chat_messages table
            const userChat = await pool.query(`
                SELECT table_name FROM information_schema.tables 
                WHERE table_name = 'user_chat_messages';
            `);
            assert.strictEqual(userChat.rows.length, 1, "user_chat_messages table must exist");

            // Verify repositories.is_private column
            const isPrivateCol = await pool.query(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name = 'repositories' AND column_name = 'is_private';
            `);
            assert.strictEqual(isPrivateCol.rows.length, 1, "repositories.is_private column must exist");

            // Verify analysis_results.commit_sha column
            const commitShaCol = await pool.query(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name = 'analysis_results' AND column_name = 'commit_sha';
            `);
            assert.strictEqual(commitShaCol.rows.length, 1, "analysis_results.commit_sha column must exist");
        });

    } finally {
        const pool = getPool();
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
    console.error("Fatal test error:", err);
    process.exit(1);
});
