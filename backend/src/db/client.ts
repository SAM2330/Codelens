import { Pool, PoolConfig } from "pg";
import dotenv from "dotenv";

dotenv.config();

function getPoolConfig(): PoolConfig {
    const databaseUrl = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();

    if (databaseUrl) {
        const isLocalhost = databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");
        return {
            connectionString: databaseUrl,
            max: 10,
            connectionTimeoutMillis: 10000,
            idleTimeoutMillis: 30000,
            ssl: isLocalhost
                ? false
                : {
                      rejectUnauthorized: false
                  }
        };
    }

    const host = (process.env.PGHOST || "localhost").trim();
    const isLocalhost = host === "localhost" || host === "127.0.0.1";

    return {
        host,
        port: parseInt(process.env.PGPORT || "5432", 10),
        user: (process.env.PGUSER || "postgres").trim(),
        password: process.env.PGPASSWORD || "",
        database: (process.env.PGDATABASE || "postgres").trim(),
        max: 10,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        ssl: isLocalhost
            ? false
            : {
                  rejectUnauthorized: false
              }
    };
}

let pool: Pool | null = null;

export function getPool(): Pool {
    if (!pool) {
        pool = new Pool(getPoolConfig());

        pool.on("error", (err) => {
            console.error("Unexpected error on idle PostgreSQL client:", err?.message || "Unknown error");
        });
    }
    return pool;
}

export async function query<T = any>(
    text: string,
    params?: any[]
): Promise<T[]> {
    const clientPool = getPool();
    const result = await clientPool.query(text, params);
    return result.rows as T[];
}

export function isDatabaseConfigured(): boolean {
    return Boolean(
        process.env.DATABASE_URL ||
        process.env.PGPASSWORD ||
        process.env.SUPABASE_DB_URL
    );
}
