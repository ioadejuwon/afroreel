import bcrypt from "bcryptjs";
import { pool } from "./db";

async function bootstrap(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME?.trim() || "AfroReel Admin";
  if (!email || password.length < 12) {
    throw new Error("Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters.");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.execute(
    `INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), is_active = 1`,
    [name, email, passwordHash],
  );
  console.log(`Admin ready: ${email}`);
  await pool.end();
}

void bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
