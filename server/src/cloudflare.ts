import { config } from "./config";

function requireCloudflareConfig(): void {
  if (!config.cloudflare.accountId || !config.cloudflare.apiToken) {
    throw new Error("Cloudflare Stream credentials are not configured.");
  }
}

function encodeMetadata(value: string | number | boolean): string {
  return Buffer.from(String(value)).toString("base64");
}

function parseUploadUid(location: string): string {
  const clean = location.split("?")[0] ?? location;
  return clean.slice(clean.lastIndexOf("/") + 1);
}

export async function createTusUpload(input: {
  uploadLength: number;
  name: string;
  maxDurationSeconds: number;
}): Promise<{ uploadUrl: string; uid: string }> {
  requireCloudflareConfig();

  const metadata = [
    `name ${encodeMetadata(input.name)}`,
    `requiresignedurls`,
    `maxDurationSeconds ${encodeMetadata(input.maxDurationSeconds)}`,
  ].join(",");

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId}/stream?direct_user=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.cloudflare.apiToken}`,
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(input.uploadLength),
        "Upload-Metadata": metadata,
      },
    },
  );

  const uploadUrl = response.headers.get("Location");
  if (!response.ok || !uploadUrl) {
    const body = await response.text();
    throw new Error(`Cloudflare upload URL request failed: ${body || response.statusText}`);
  }

  return { uploadUrl, uid: parseUploadUid(uploadUrl) };
}

export async function getStreamVideo(uid: string): Promise<{
  ready: boolean;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
}> {
  requireCloudflareConfig();

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId}/stream/${uid}`,
    {
      headers: {
        Authorization: `Bearer ${config.cloudflare.apiToken}`,
      },
    },
  );

  const payload = (await response.json()) as {
    success?: boolean;
    result?: {
      readyToStream?: boolean;
      duration?: number;
      thumbnail?: string;
    };
    errors?: unknown;
  };

  if (!response.ok || !payload.success || !payload.result) {
    throw new Error(`Cloudflare video status request failed: ${JSON.stringify(payload.errors ?? payload)}`);
  }

  return {
    ready: Boolean(payload.result.readyToStream),
    durationSeconds: payload.result.duration ? Math.round(payload.result.duration) : null,
    thumbnailUrl: payload.result.thumbnail ?? null,
  };
}

export async function createPlaybackUrl(uid: string): Promise<string> {
  requireCloudflareConfig();

  if (!config.cloudflare.customerCode) {
    throw new Error("CLOUDFLARE_STREAM_CUSTOMER_CODE is not configured.");
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId}/stream/${uid}/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.cloudflare.apiToken}`,
        "content-type": "application/json;charset=UTF-8",
      },
      body: JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
        downloadable: false,
      }),
    },
  );

  const payload = (await response.json()) as {
    success?: boolean;
    result?: { token?: string } | string;
    errors?: unknown;
  };

  const token = typeof payload.result === "string" ? payload.result : payload.result?.token;
  if (!response.ok || !payload.success || !token) {
    throw new Error(`Cloudflare playback token request failed: ${JSON.stringify(payload.errors ?? payload)}`);
  }

  return `https://customer-${config.cloudflare.customerCode}.cloudflarestream.com/${token}/manifest/video.m3u8`;
}
