import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { z } from "zod";
import { pool } from "./db";
import { config } from "./config";
import { MediaError } from "./cloudflare";
import { inviteRoles, type InviteRole } from "./studio-access";

export function inviteRole(value: unknown): InviteRole {
  const result = z.enum(inviteRoles).safeParse(value);
  if (!result.success) throw new MediaError(400, "Choose Admin, Editor or Analyst.");
  return result.data;
}
export function emailsFrom(input: unknown) {
  if (typeof input !== "string") throw new MediaError(400, "Enter at least one email address.");
  const emails = [...new Set(input.toLowerCase().split(/[\s,;]+/).filter(Boolean))];
  if (!emails.length || emails.length > 25) throw new MediaError(400, "Enter 1 to 25 email addresses.");
  return emails;
}

type Invite = RowDataPacket & { id: number; email: string; role: InviteRole; message: string; token_hash: string };
type Result = { email: string; text: string; preview?: string; retryId?: number };

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const invalidLink = () => new MediaError(410, "This invitation is unavailable. Ask the Studio Owner for a fresh invitation.");
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

export async function teamRows() {
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT 'member' AS kind, id, email, role, name, COALESCE(last_active_at,last_login_at) AS activity, 'Active' AS status
    FROM admins WHERE is_active = 1
    UNION ALL
    SELECT 'invite', id, email, role, 'Invited', NULL,
      CASE WHEN expires_at <= NOW() THEN 'Expired' WHEN delivery='failed' THEN 'Delivery failed'
           WHEN delivery='preview' THEN 'Local preview' WHEN delivery='sent' THEN 'Invite sent' ELSE 'Sending' END
    FROM admin_invitations ORDER BY kind DESC, activity DESC, email`);
  return rows;
}

async function deliver(id: number, email: string, role: InviteRole, message: string, token: string, adminPath: string): Promise<Result> {
  const path = adminPath + "/setup/" + token;
  let delivery: "sent" | "preview" | "failed";
  let result: Result;
  if (config.nodeEnv === "development" && !config.resend.apiKey) {
    delivery = "preview";
    result = {email, text:"Local preview ready", preview:path};
  } else {
    try {
      const origin = new URL(config.publicBaseUrl);
      if (origin.protocol !== "https:" || !config.resend.apiKey || !process.env.EMAIL_FROM?.trim()) throw new Error("Sender unavailable");
      const url = new URL(path, origin.origin).href;
      const body = "You’ve been invited to AfroReel Admin Studio as " + role + ".";
      const response = await fetch("https://api.resend.com/emails", {
        method:"POST", signal:AbortSignal.timeout(10000),
        headers:{Authorization:"Bearer " + config.resend.apiKey,"Content-Type":"application/json"},
        body:JSON.stringify({from:config.resend.from,to:[email],subject:"Set up your AfroReel Admin Studio account",
          text:[body,message,"Set up account: " + url,"This link expires in 48 hours."].filter(Boolean).join("\n\n"),
          html:`<h1>Join AfroReel Admin Studio</h1><p>${body}</p><p>${escapeHtml(message)}</p><p><a style="padding:12px 18px;background:#e3b55a;color:#171717" href="${escapeHtml(url)}">Set up account</a></p><p>This link expires in 48 hours.</p>`}),
      });
      if (!response.ok) throw new Error("Email rejected");
      delivery = "sent";
      result = {email,text:"Invite sent"};
    } catch {
      delivery = "failed";
      result = {email,text:"Couldn’t send. Check the email configuration and retry.",retryId:id};
    }
  }
  await pool.execute("UPDATE admin_invitations SET delivery=? WHERE id=? AND token_hash=?", [delivery,id,hash(token)]);
  return result;
}

export async function sendInvitation(email: string, role: InviteRole, message: string, adminPath: string): Promise<Result> {
  if (!z.email().max(190).safeParse(email).success) return {email,text:"Invalid email address"};
  const token = randomBytes(32).toString("hex");
  const db = await pool.getConnection();
  let id: number;
  try {
    await db.beginTransaction();
    const [insert] = await db.execute<ResultSetHeader>(
      "INSERT INTO admin_invitations (email,role,message,token_hash,expires_at) VALUES (?,?,?,?,NOW()+INTERVAL 48 HOUR)",
      [email,role,message,hash(token)]);
    const [members] = await db.execute<RowDataPacket[]>(
      "SELECT id FROM admins WHERE email=? AND is_active=1 FOR UPDATE", [email],
    );
    if (members.length) {
      await db.rollback();
      return {email, text:"Already an active member"};
    }
    id = insert.insertId;
    await db.commit();
  } catch (error) {
    await db.rollback();
    if ((error as {code:string}).code === "ER_DUP_ENTRY") return {email,text:"Already pending. Use Resend on the team page."};
    throw error;
  } finally {
    db.release();
  }
  return deliver(id,email,role,message,token,adminPath);
}

export async function resendInvitation(id: number, adminPath: string) {
  const [rows] = await pool.execute<Invite[]>("SELECT * FROM admin_invitations WHERE id=?", [id]);
  const invite = rows[0];
  if (!invite) throw invalidLink();
  const token = randomBytes(32).toString("hex");
  const [update] = await pool.execute<ResultSetHeader>(
    "UPDATE admin_invitations SET token_hash=?,expires_at=NOW()+INTERVAL 48 HOUR,delivery='sending' WHERE id=? AND token_hash=? AND role=?",
    [hash(token),id,invite.token_hash,invite.role]);
  if (!update.affectedRows) throw new MediaError(409, "Invitation changed. Refresh the team page.");
  return deliver(id,invite.email,invite.role,invite.message,token,adminPath);
}

const validInvite = "SELECT id,email,role FROM admin_invitations WHERE token_hash=? AND expires_at>NOW()";
export async function invitationForSetup(token: string) {
  const [rows] = await pool.execute<Invite[]>(validInvite,[hash(token)]);
  return rows[0];
}

export async function acceptInvitation(token: string, name: string, password: string) {
  if (!name || [...name].length > 120) throw new MediaError(400,"Enter a name of 1 to 120 characters.");
  if ([...password].length < 12 || Buffer.byteLength(password) > 72) throw new MediaError(400,"Use at least 12 characters and at most 72 bytes for your password.");
  if (!await invitationForSetup(token)) throw invalidLink();
  const passwordHash = await bcrypt.hash(password,12);
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [rows] = await db.execute<Invite[]>(validInvite + " FOR UPDATE",[hash(token)]);
    const invite = rows[0];
    if (!invite) throw invalidLink();
    const [members] = await db.execute<RowDataPacket[]>("SELECT id,is_active,role FROM admins WHERE email=? FOR UPDATE",[invite.email]);
    const member = members[0];
    if (member?.is_active || member?.role === "owner") throw new MediaError(409,"This account already exists. Sign in to continue.");
    const values = [name,passwordHash,invite.role,invite.email];
    if (member) {
      await db.execute("UPDATE admins SET name=?,password_hash=?,role=?,is_active=1,last_login_at=NOW(),last_active_at=NOW(),session_version=session_version+1 WHERE email=?",values);
    } else {
      await db.execute("INSERT INTO admins (name,password_hash,role,email,last_login_at,last_active_at) VALUES (?,?,?,?,NOW(),NOW())",values);
    }
    const [users] = await db.execute<RowDataPacket[]>("SELECT id,session_version,role FROM admins WHERE email=?",[invite.email]);
    await db.execute("DELETE FROM admin_invitations WHERE id=?",[invite.id]);
    await db.commit();
    return users[0];
  } catch (error) {
    await db.rollback();
    throw error;
  } finally { db.release(); }
}

export async function changeMember(kind: string, id: number, role: InviteRole | null) {
  let sql: string;
  if (kind === "member") {
    sql = role ? "UPDATE admins SET role=? WHERE id=? AND is_active=1 AND role<>'owner'"
      : "UPDATE admins SET is_active=0,session_version=session_version+1 WHERE id=? AND is_active=1 AND role<>'owner'";
  } else if (kind === "invite") {
    sql = role ? "UPDATE admin_invitations SET role=? WHERE id=?" : "DELETE FROM admin_invitations WHERE id=?";
  } else throw new MediaError(400,"Invalid team member.");
  const [result] = await pool.execute<ResultSetHeader>(sql,role ? [role,id] : [id]);
  if (!result.affectedRows) throw new MediaError(409,"This member is protected or has changed. Refresh the team page.");
}
