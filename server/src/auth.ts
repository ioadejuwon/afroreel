import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import type { AdminSessionUser } from "./types";

interface AdminCredentialsRow {
  id: number;
  password_hash: string;
}

interface AdminRow extends AdminSessionUser {}

function normalizeBcryptHash(hash: string): string {
  return hash.startsWith("$2y$") ? `$2b$${hash.slice(4)}` : hash;
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
