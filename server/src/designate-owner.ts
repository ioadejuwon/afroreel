import { pool } from "./db";
import type { ResultSetHeader } from "mysql2";

async function designateOwner() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Supply the existing admin email: npm run admin:owner -- admin@example.com");
  const [result] = await pool.execute<ResultSetHeader>(
    "UPDATE admins SET role = 'owner' WHERE email = ? AND is_active = 1", [email],
  );
  if (!result.affectedRows) throw new Error("No active admin matches that email.");
  console.log("Studio Owner: " + email);
}
void designateOwner().catch(error => {
  console.error(error.code === "ER_DUP_ENTRY" ? "Another Owner already exists." : error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
