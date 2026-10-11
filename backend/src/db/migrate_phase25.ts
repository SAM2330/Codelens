import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL?.trim(),
});

export async function runMigration() {
    console.log('--- Running Phase 25 Database Migration ---');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Extend analysis_results with commit_sha, status, indexing_version
        console.log('1. Altering analysis_results...');
        await client.query(`
            ALTER TABLE analysis_results
            ADD COLUMN IF NOT EXISTS commit_sha TEXT,
            ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed',
            ADD COLUMN IF NOT EXISTS indexing_version TEXT NOT NULL DEFAULT '1.0';
        `);

        // 2. Add is_private to repositories if not exists
        console.log('2. Altering repositories...');
        await client.query(`
            ALTER TABLE repositories
            ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;
        `);

        // 3. Create user_repositories table
        console.log('3. Creating user_repositories...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_repositories (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL,
                repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
                role TEXT NOT NULL DEFAULT 'owner',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (user_id, repository_id)
            );
            CREATE INDEX IF NOT EXISTS idx_user_repos_user_id ON user_repositories(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_repos_repo_id ON user_repositories(repository_id);
        `);

        // 4. Create user_chat_messages table for persistent per-user chat
        console.log('4. Creating user_chat_messages...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_chat_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL,
                repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                citations JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_user_chat_lookup ON user_chat_messages(user_id, repository_id, created_at);
        `);

        // 5. Create index on analysis_results for fast cache lookup
        console.log('5. Creating cache lookup index...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_analysis_results_cache 
            ON analysis_results(repository_id, commit_sha, status);
        `);

        // 6. Backfill existing analysis_results commit_sha if null
        console.log('6. Backfilling commit_sha for existing analyses...');
        const backfillRes = await client.query(`
            UPDATE analysis_results
            SET commit_sha = COALESCE(
                git_analysis->'commits'->0->>'sha',
                raw_repository->>'default_branch_sha',
                'head'
            )
            WHERE commit_sha IS NULL;
        `);
        console.log(`Backfilled ${backfillRes.rowCount} analysis rows.`);

        await client.query('COMMIT');
        console.log('Phase 25 migration completed successfully!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) {
    runMigration().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
