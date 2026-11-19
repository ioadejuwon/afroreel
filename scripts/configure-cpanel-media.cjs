// Run once from the production checkout with Node 22, before its first media deployment.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const https = require("node:https");
const { parseEnv } = require("node:util");
const { randomBytes } = require("node:crypto");

function getCloudflare(account, route, token) {
  return new Promise((resolve, reject) => {
    const url = new URL("/client/v4/accounts/" + account + route, "https://api.cloudflare.com");
    const request = https.get(url, { headers: { Authorization: "Bearer " + token } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("error", reject);
      response.on("end", () => {
        if (response.statusCode === 401 || response.statusCode === 403) return resolve(null);
        try {
          const payload = JSON.parse(body);
          resolve(payload.success ? payload.result : null);
        } catch {
          reject(new Error("Unreadable Cloudflare response for " + route));
        }
      });
    });
    request.setTimeout(15000, () => request.destroy(new Error("Cloudflare request timed out")));
    request.on("error", reject);
  });
}

async function configure() {
  const original = fs.readFileSync(".env", "utf8");
  const env = parseEnv(original);
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  if (env.NODE_ENV !== "production" || !/^[a-f0-9]{32}$/i.test(account) ||
      env.PUBLIC_BASE_URL !== "https://rellowmedia.com/afroreel") {
    throw new Error("Expected the AfroReel cPanel production configuration");
  }
  let hash = env.CLOUDFLARE_IMAGES_DELIVERY_HASH || "";
  if (hash.startsWith("https://")) {
    const url = new URL(hash);
    if (url.hostname !== "imagedelivery.net") throw new Error("Unexpected Images delivery hostname");
    hash = url.pathname.split("/")[1];
  }
  if (!/^[\w-]{12,}$/.test(hash)) throw new Error("Missing or invalid Cloudflare Images delivery hash");

  const lines = original.split(/\r?\n/);
  const streamKey = "CLOUDFLARE_API_TOKEN";
  const tokens = new Set([env[streamKey], env.CLOUDFLARE_IMAGES_API_TOKEN]);
  for (const line of lines) {
    if (/^\s*CLOUDFLARE_API_TOKEN\s*=/.test(line)) tokens.add(parseEnv(line)[streamKey]);
  }
  const settings = { CLOUDFLARE_IMAGES_DELIVERY_HASH: hash };
  for (const token of tokens) {
    if (!token) continue;
    const [webhook, images] = await Promise.all([
      getCloudflare(account, "/stream/webhook", token),
      getCloudflare(account, "/images/v1/variants", token),
    ]);
    if (!settings[streamKey] && webhook?.notificationUrl === env.PUBLIC_BASE_URL + "/webhooks/cloudflare/stream" && webhook.secret) {
      settings[streamKey] = token;
      settings.CLOUDFLARE_STREAM_WEBHOOK_SECRET = webhook.secret;
    }
    if (!settings.CLOUDFLARE_IMAGES_API_TOKEN && ["postercard", "posterdetail", "adminpreview"].every(name => images?.variants?.[name])) {
      settings.CLOUDFLARE_IMAGES_API_TOKEN = token;
    }
  }
  if (!settings[streamKey] || !settings.CLOUDFLARE_IMAGES_API_TOKEN) {
    throw new Error("Verify the Stream webhook URL, three Images variants, and media token permissions on this account");
  }
  if (process.argv.includes("--rotate-example-session-secret") && /change-this|replace-me|example/i.test(env.SESSION_SECRET || "")) {
    settings.SESSION_SECRET = randomBytes(48).toString("hex");
  }
  const managed = Object.keys(settings);
  if (managed.some(key => !/^[A-Za-z0-9_+/=.-]+$/.test(settings[key]))) throw new Error("Unexpected media credential format");
  const otherLines = lines.filter(line => !managed.includes(line.split("=", 1)[0].trim()));
  const updated = otherLines.join("\n").trimEnd() + "\n" + managed.map(key => key + "=" + settings[key]).join("\n") + "\n";
  if (updated === original) return console.log("Production media settings already match Cloudflare.");

  const directory = fs.mkdtempSync(path.join(os.homedir(), "afroreel-config-"));
  const backup = path.join(directory, "previous.env");
  fs.writeFileSync(backup, original, { mode: 0o600, flag: "wx" });
  const candidate = path.join(directory, "configured.env");
  fs.writeFileSync(candidate, updated, { mode: 0o600, flag: "wx" });
  if (fs.readFileSync(".env", "utf8") !== original) throw new Error("Production settings changed during verification");
  fs.renameSync(candidate, ".env");
  console.log("Updated production media settings. Private configuration backup at " + backup);
  if (settings.SESSION_SECRET) console.log("Rotated the example session secret.");
}

configure().catch(error => { console.error(error.message); process.exitCode = 1; });
