import fs from "node:fs/promises";
import path from "node:path";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { pool } from "./db";

const migrationsDir = path.join(process.cwd(), "database", "migrations");

// MySQL commits DDL individually. Detect an interrupted rollout before running either upgrade.
async function checkStudioUpgrades(db: PoolConnection, pending: Set<string>): Promise<void> {
  const additions = new Map<string, string[]>();
  if (pending.has("008_monetization.sql")) {
    additions.set("purchase_transactions", ["provider_token_hash", "reversed_at", "unique_provider_token"]);
    additions.set("ad_reward_claims", ["ad_unit_id", "rejection_reason"]);
    additions.set("monetization_settings", ["*"]);
    const [balances] = await db.query<RowDataPacket[]>(
      "SELECT 1 FROM mobile_users WHERE coin_balance > 2147483647 OR coin_balance < -2147483648 LIMIT 1",
    );
    if (balances.length) throw new Error("008 cannot proceed: a coin balance exceeds the signed INT range.");
  }
  if (pending.has("009_admin_team.sql")) {
    additions.set("admins", ["role", "last_active_at", "session_version", "owner_slot", "unique_studio_owner"]);
    additions.set("admin_invitations", ["*"]);
  }
  for (const [table, names] of additions) {
    const [objects] = await db.execute<RowDataPacket[]>(
      `SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?
       UNION SELECT INDEX_NAME AS name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=?`,
      [table, table],
    );
    const collision = objects.find(row => names.includes("*") || names.includes(row.name));
    if (collision) throw new Error(`Unrecorded schema change at ${table}.${collision.name}. Reconcile this migration before deployment.`);
  }
}

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
    let checkedStudioUpgrades = false;
    for (const file of files) {
      const [rows] = await db.execute<Array<RowDataPacket & { name: string }>>("SELECT name FROM schema_migrations WHERE name = ?", [file]);
      if (rows.length) continue;
      if (!checkedStudioUpgrades && ["008_monetization.sql", "009_admin_team.sql"].includes(file)) {
        const [applied] = await db.query<RowDataPacket[]>("SELECT name FROM schema_migrations");
        const recorded = new Set(applied.map(row => row.name));
        await checkStudioUpgrades(db, new Set(files.filter(name => !recorded.has(name))));
        checkedStudioUpgrades = true;
      }
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
