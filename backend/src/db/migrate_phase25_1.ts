import { getPool } from "./client";

async function runMigration() {
    const pool = getPool();
    console.log("Starting Phase 25.1 Migration (RLS Policies & Constraints)...");

    try {
        // 1. user_chat_messages RLS
        await pool.query(`
            ALTER TABLE user_chat_messages ENABLE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS user_chat_messages_owner_policy ON user_chat_messages;
            CREATE POLICY user_chat_messages_owner_policy ON user_chat_messages
                FOR ALL
                USING (auth.uid() = user_id)
                WITH CHECK (auth.uid() = user_id);
        `);
        console.log("✓ user_chat_messages RLS enabled and policy applied.");

        // 2. user_repositories RLS
        await pool.query(`
            ALTER TABLE user_repositories ENABLE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS user_repositories_owner_policy ON user_repositories;
            CREATE POLICY user_repositories_owner_policy ON user_repositories
                FOR ALL
                USING (auth.uid() = user_id)
                WITH CHECK (auth.uid() = user_id);
        `);
        console.log("✓ user_repositories RLS enabled and policy applied.");

        console.log("Phase 25.1 migration completed successfully!");
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
