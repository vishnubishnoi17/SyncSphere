import { Pool } from "pg";
import fs from "fs";
import path from "path";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("Unexpected DB pool error:", err);
});

export const query = async (text: string, params?: unknown[]) => {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (err) {
    console.error("Query error:", err);
    throw err;
  }
};

export const getClient = () => pool.connect();

export const initDB = async () => {
  try {
    await pool.query("SELECT 1");
    console.log("✅ PostgreSQL connected");
    const schemaPath = path.join(__dirname, "schema.sql");
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, "utf8");
      await pool.query(schema);
      console.log("✅ Schema initialized");
    }
  } catch (err) {
    console.error("❌ DB init failed:", err);
    throw err;
  }
};

export default pool;
