ALTER TABLE episodes
  ADD COLUMN cloudflare_pending_uid VARCHAR(190) NULL,
  ADD COLUMN cloudflare_upload_state ENUM('uploading', 'processing', 'failed') NULL,
  ADD COLUMN cloudflare_upload_error VARCHAR(255) NULL,
  ADD COLUMN cloudflare_thumbnail_time_ms INT UNSIGNED NULL,
  ADD UNIQUE INDEX unique_cloudflare_pending_uid (cloudflare_pending_uid);
