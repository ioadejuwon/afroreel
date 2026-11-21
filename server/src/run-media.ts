import { auditMedia, cleanMedia } from "./media-cleanup";
import { pool } from "./db";

async function run() {
  switch (process.argv[2]) {
    case "cleanup": return cleanMedia();
    case "audit": return auditMedia();
    default: throw new Error("Choose cleanup or audit.");
  }
}

void run().finally(() => pool.end()).catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
