import "express-session";

export type AdminRole = "owner" | "admin" | "editor" | "analyst";

export interface AdminSessionUser {
  role: AdminRole;
  session_version: number;
  id: number;
  name: string;
  email: string;
}

export interface MobileSessionUser {
  id: number;
  userId: string;
  email: string;
  username: string | null;
  name: string;
  coinBalance: number;
}

declare module "express-session" {
  interface SessionData {
    adminId?: number;
    adminVersion?: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminSessionUser;
      mobileUser?: MobileSessionUser;
      csrfToken(): string;
    }
  }
}
