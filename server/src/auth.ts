import type { NextFunction, Request, Response } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { config } from "./config";
import { pool } from "./db";
import type { AdminSessionUser, MobileSessionUser } from "./types";

interface AdminCredentialsRow {
  id: number;
  password_hash: string;
}

interface AdminRow extends AdminSessionUser {}

type MobileCredentialsRow = RowDataPacket & {
  id: number;
  user_id: string;
  email: string;
  name: string;
  password_hash: string;
  coin_balance: number;
};

type MobileUserRow = RowDataPacket & {
  id: number;
  user_id: string;
  email: string;
  name: string;
  coin_balance: number;
};

const mobileTokenTtlSeconds = 60 * 60 * 24 * 30;

function normalizeBcryptHash(hash: string): string {
  return hash.startsWith("$2y$") ? `$2b$${hash.slice(4)}` : hash;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function signMobileTokenPayload(payload: string): string {
  return createHmac("sha256", config.session.secret).update(payload).digest("base64url");
}

function createMobileToken(userId: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + mobileTokenTtlSeconds;
  const payload = toBase64Url(JSON.stringify({ sub: userId, exp: expiresAt }));
  const signature = signMobileTokenPayload(payload);

  return `${payload}.${signature}`;
}

function verifyMobileToken(token: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signMobileTokenPayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  const rawPayload = fromBase64Url(payload);
  if (!rawPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawPayload) as { sub?: unknown; exp?: unknown };
    const userId = typeof parsed.sub === "string" ? parsed.sub : "";
    const expiresAt = typeof parsed.exp === "number" ? parsed.exp : 0;

    if (!userId || expiresAt <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return userId;
  } catch {
    return null;
  }
}

function normalizeMobileUser(row: MobileUserRow): MobileSessionUser {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    coinBalance: Number(row.coin_balance ?? 0),
  };
}

function displayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0]?.trim();

  return localPart || "AfroReel Viewer";
}

async function uniqueMobileUserId(): Promise<string> {
  while (true) {
    const next = `usr_${randomBytes(12).toString("hex")}`;
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT id FROM mobile_users WHERE user_id = ? LIMIT 1", [next]);
    if (rows.length === 0) {
      return next;
    }
  }
}

export async function ensureMobileAuthSchema(): Promise<void> {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS mobile_users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(80) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      coin_balance INT UNSIGNED NOT NULL DEFAULT 250,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      last_login_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

}

export async function findCurrentAdmin(adminId: number): Promise<AdminSessionUser | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, name, email FROM admins WHERE id = ? AND is_active = 1 LIMIT 1",
    [adminId],
  );
  const admin = rows[0] as AdminRow | undefined;

  return admin ?? null;
}

export async function attemptAdminLogin(email: string, password: string): Promise<AdminSessionUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, password_hash FROM admins WHERE email = ? AND is_active = 1 LIMIT 1",
    [normalizedEmail],
  );
  const credentials = rows[0] as AdminCredentialsRow | undefined;

  if (!credentials) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, normalizeBcryptHash(credentials.password_hash));

  if (!passwordMatches) {
    return null;
  }

  await pool.execute("UPDATE admins SET last_login_at = NOW() WHERE id = ?", [credentials.id]);

  return findCurrentAdmin(credentials.id);
}

export async function findCurrentMobileUser(userId: string): Promise<MobileSessionUser | null> {
  const [rows] = await pool.execute<MobileUserRow[]>(
    "SELECT id, user_id, name, email, coin_balance FROM mobile_users WHERE user_id = ? AND is_active = 1 LIMIT 1",
    [userId],
  );
  const user = rows[0];

  return user ? normalizeMobileUser(user) : null;
}

export async function createMobileUser(email: string, password: string): Promise<{ token: string; user: MobileSessionUser }> {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = await uniqueMobileUserId();

  await pool.execute(
    "INSERT INTO mobile_users (user_id, name, email, password_hash) VALUES (?, ?, ?, ?)",
    [userId, displayNameFromEmail(normalizedEmail), normalizedEmail, passwordHash],
  );

  const user = await findCurrentMobileUser(userId);
  if (!user) {
    throw new Error("Could not create mobile user.");
  }

  return {
    token: createMobileToken(user.userId),
    user,
  };
}

export async function attemptMobileLogin(email: string, password: string): Promise<{ token: string; user: MobileSessionUser } | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const [rows] = await pool.execute<MobileCredentialsRow[]>(
    "SELECT id, user_id, name, email, password_hash, coin_balance FROM mobile_users WHERE email = ? AND is_active = 1 LIMIT 1",
    [normalizedEmail],
  );
  const credentials = rows[0];

  if (!credentials) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, normalizeBcryptHash(credentials.password_hash));

  if (!passwordMatches) {
    return null;
  }

  await pool.execute("UPDATE mobile_users SET last_login_at = NOW() WHERE id = ?", [credentials.id]);

  return {
    token: createMobileToken(credentials.user_id),
    user: normalizeMobileUser(credentials),
  };
}

export async function attachCurrentAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.session.adminId) {
      next();
      return;
    }

    const admin = await findCurrentAdmin(req.session.adminId);

    if (!admin) {
      delete req.session.adminId;
    } else {
      req.admin = admin;
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.admin) {
    res.redirect(`${req.baseUrl || "/admin"}/login`);
    return;
  }

  next();
}

export async function requireMobileUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authorization = req.header("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    const userId = token ? verifyMobileToken(token) : null;

    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }

    const user = await findCurrentMobileUser(userId);
    if (!user) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }

    req.mobileUser = user;
    next();
  } catch (error) {
    next(error);
  }
}
