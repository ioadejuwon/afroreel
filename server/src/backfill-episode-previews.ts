import { pool } from "./db";
import { backfillEpisodePreviews } from "./episode-previews";

void backfillEpisodePreviews().finally(() => pool.end()).catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
