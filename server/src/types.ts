import "express-session";

export interface AdminSessionUser {
  id: number;
  name: string;
  email: string;
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
      csrfToken(): string;
    }
  }
}
