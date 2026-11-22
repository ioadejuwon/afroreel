import dotenv from "dotenv";

dotenv.config();

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function productionEnv(name: string, developmentFallback = ""): string {
  const value = process.env[name] ?? developmentFallback;
  if ((process.env.NODE_ENV ?? "development") === "production" && !value) {
    throw new Error(`Missing required production environment variable: ${name}`);
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

function decodedPem(name: string): string {
  const value = process.env[name] ?? "";
  if (!value) return "";
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    throw new Error(`Environment variable ${name} must be a base64-encoded PEM value`);
  }
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
  publicBaseUrl: productionEnv("PUBLIC_BASE_URL"),
  basePath: normalizeBasePath(process.env.APP_BASE_PATH ?? basePathFromPublicUrl(process.env.PUBLIC_BASE_URL)),
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  mobileStubUserId: process.env.MOBILE_STUB_USER_ID ?? "demo-user",
  db: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: envInt("DB_PORT", 3306),
    socketPath: process.env.DB_SOCKET_PATH?.trim() || undefined,
    database: productionEnv("DB_NAME", "afroreel"),
    user: productionEnv("DB_USER", "root"),
    password: productionEnv("DB_PASS", "root"),
  },
  session: {
    name: "afroreel_admin",
    secret: requiredEnv("SESSION_SECRET"),
  },
  mobileTokenSecret: productionEnv("MOBILE_TOKEN_SECRET", process.env.SESSION_SECRET),
  cloudflare: {
    accountId: productionEnv("CLOUDFLARE_ACCOUNT_ID"),
    apiToken: productionEnv("CLOUDFLARE_API_TOKEN"),
    customerCode: productionEnv("CLOUDFLARE_STREAM_CUSTOMER_CODE"),
    streamWebhookSecret: productionEnv("CLOUDFLARE_STREAM_WEBHOOK_SECRET"),
    streamKeyId: productionEnv("CLOUDFLARE_STREAM_KEY_ID"),
    streamPrivateKey: productionEnv("CLOUDFLARE_STREAM_PRIVATE_KEY_PEM_BASE64"),
    imagesApiToken: productionEnv("CLOUDFLARE_IMAGES_API_TOKEN"),
    imagesDeliveryHash: productionEnv("CLOUDFLARE_IMAGES_DELIVERY_HASH"),
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.EMAIL_FROM ?? "AfroReel <no-reply@rellowmedia.com>",
  },
  commerce: {
    apple: {
      bundleId: process.env.APPLE_BUNDLE_ID ?? "com.afroreel.app",
      issuerId: process.env.APPLE_ISSUER_ID ?? "",
      keyId: process.env.APPLE_KEY_ID ?? "",
      privateKey: decodedPem("APPLE_IAP_PRIVATE_KEY_PEM_BASE64"),
    },
    google: {
      packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME ?? "com.afroreel.app",
      serviceAccountEmail: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL ?? "",
      privateKey: decodedPem("GOOGLE_PLAY_PRIVATE_KEY_PEM_BASE64"),
      webhookToken: process.env.GOOGLE_PLAY_WEBHOOK_TOKEN ?? "",
    },
    admob: {
      iosRewardedAdUnitId: process.env.ADMOB_IOS_REWARDED_AD_UNIT_ID ?? "",
      androidRewardedAdUnitId: process.env.ADMOB_ANDROID_REWARDED_AD_UNIT_ID ?? "",
    },
  },
  sentryDsn: process.env.SENTRY_DSN ?? "",
};

export const isProduction = config.nodeEnv === "production";
export const allowLocalMedia = config.nodeEnv === "development" && process.env.ALLOW_LOCAL_MEDIA === "true";
