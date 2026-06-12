import dotenv from "dotenv";

dotenv.config();

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function envInt(name: string, defaultValue: number): number {
  const value = process.env[name];

  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }

  return parsed;
}

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();

  if (!trimmed || trimmed === "/") {
    return "";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

function basePathFromPublicUrl(value: string | undefined): string {
  if (!value) {
    return "";
  }

  try {
    return normalizeBasePath(new URL(value).pathname);
  } catch {
    return "";
  }
}

export const config = {
  port: envInt("PORT", 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "",
  basePath: normalizeBasePath(process.env.APP_BASE_PATH ?? basePathFromPublicUrl(process.env.PUBLIC_BASE_URL)),
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  mobileStubUserId: process.env.MOBILE_STUB_USER_ID ?? "demo-user",
  db: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: envInt("DB_PORT", 3306),
    database: process.env.DB_NAME ?? "afroreel",
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASS ?? "root",
  },
  session: {
    name: "afroreel_admin",
    secret: requiredEnv("SESSION_SECRET"),
  },
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    apiToken: process.env.CLOUDFLARE_API_TOKEN ?? "",
    customerCode: process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE ?? "",
  },
};

export const isProduction = config.nodeEnv === "production";
