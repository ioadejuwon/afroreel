import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { pool } from "./db";
import { config } from "./config";
import { MediaError } from "./cloudflare";
import { normalizeBcryptHash } from "./auth";

export function checkStudioPassword(password: string) {
  if (typeof password !== "string" || [...password].length < 12 || Buffer.byteLength(password) > 72)
    throw new MediaError(400,"Use at least 12 characters and at most 72 bytes for your password.");
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const validReset = "is_active=1 AND reset_token_hash=? AND reset_expires_at>NOW()";
const replacePassword = "UPDATE admins SET password_hash=?,session_version=session_version+1,reset_token_hash=NULL,reset_expires_at=NULL WHERE ";
const unavailable = () => new MediaError(410,"This reset link is unavailable. Request a new link.");

export async function changePassword(id: number, version: number, current: string, password: string) {
  checkStudioPassword(password);
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT password_hash FROM admins WHERE id=? AND is_active=1 AND session_version=?",[id,version]);
  if (!rows.length || typeof current !== "string" || !await bcrypt.compare(current,normalizeBcryptHash(rows[0].password_hash)))
    throw new MediaError(400,"The current password is incorrect.");
  const [update] = await pool.execute<ResultSetHeader>(replacePassword+"id=? AND session_version=? AND is_active=1",
    [await bcrypt.hash(password,12),id,version]);
  if (!update.affectedRows) throw new MediaError(409,"Your account changed. Sign in again.");
  return version+1;
}

export async function resetAvailable(token: string) {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT id FROM admins WHERE "+validReset,[digest(token)]);
  return rows.length > 0;
}

export async function redeemReset(token: string, password: string) {
  if (!await resetAvailable(token)) throw unavailable();
  checkStudioPassword(password);
  const [result] = await pool.execute<ResultSetHeader>(replacePassword+validReset,[await bcrypt.hash(password,12),digest(token)]);
  if (!result.affectedRows) throw unavailable();
}

export async function requestReset(target: string | number, adminPath: string) {
  const column = typeof target === "number" ? "id" : "email";
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT id,email,session_version FROM admins WHERE is_active=1 AND "+column+"=?",[target]);
  if (!rows.length) return false;
  const member = rows[0];
  const token = randomBytes(32).toString("hex");
  const hash = digest(token);
  const [updated] = await pool.execute<ResultSetHeader>(
    "UPDATE admins SET reset_token_hash=?,reset_expires_at=NOW()+INTERVAL 1 HOUR WHERE id=? AND is_active=1 AND session_version=?",
    [hash,member.id,member.session_version]);
  if (!updated.affectedRows) return false;
  try {
    const url = new URL(adminPath+"/reset-password/"+token,new URL(config.publicBaseUrl).origin);
    if (url.protocol !== "https:" || !config.resend.apiKey || !process.env.EMAIL_FROM?.trim()) throw Error("Sender unavailable");
    const response = await fetch("https://api.resend.com/emails",{
      method:"POST", signal:AbortSignal.timeout(10000),
      headers:{Authorization:"Bearer "+config.resend.apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({from:config.resend.from,to:[member.email],subject:"Reset your AfroReel Admin Studio password",
        text:"Reset password: "+url.href+"\n\nThis link expires in one hour."}),
    });
    if (response.ok) return true;
  } catch { /* Report the same delivery failure for configuration and transport errors. */ }
  await pool.execute("UPDATE admins SET reset_token_hash=NULL,reset_expires_at=NULL WHERE id=? AND reset_token_hash=?",[member.id,hash]);
  return false;
}
