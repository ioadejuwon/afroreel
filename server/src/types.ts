import "express-session";

export interface AdminSessionUser {
  id: number;
  name: string;
  email: string;
}

export interface MobileSessionUser {
  id: number;
  userId: string;
  email: string;
  name: string;
  coinBalance: number;
}

declare module "express-session" {
  interface SessionData {
    adminId?: number;
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
