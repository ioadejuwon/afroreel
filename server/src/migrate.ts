import fs from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { pool } from "./db";

const migrationsDir = path.join(process.cwd(), "database", "migrations");

async function migrate(): Promise<void> {
  const db = await pool.getConnection();
  let locked = false;
  try {
    const [lockRows] = await db.query<Array<RowDataPacket & { acquired: number }>>(
      "SELECT GET_LOCK('afroreel_migrations', 30) AS acquired",
    );
    locked = Number(lockRows[0]?.acquired) === 1;
    if (!locked) throw new Error("Could not acquire migration lock.");
    await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      const [rows] = await db.execute<Array<RowDataPacket & { name: string }>>("SELECT name FROM schema_migrations WHERE name = ?", [file]);
      if (rows.length) continue;
      const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
      const statements = sql.split(/^-- migrate:split\s*$/m).map((value) => value.trim()).filter(Boolean);
      for (const statement of statements) await db.query(statement);
      await db.execute("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
      console.log(`Applied ${file}`);
    }
  } finally {
    try {
      if (locked) await db.query("SELECT RELEASE_LOCK('afroreel_migrations')");
    } finally {
      db.release();
    }
  }
}

void migrate().finally(() => pool.end()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
