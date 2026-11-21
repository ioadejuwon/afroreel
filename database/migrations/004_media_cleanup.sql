CREATE TABLE IF NOT EXISTS media_catalog_lock (
  id TINYINT UNSIGNED PRIMARY KEY
) ENGINE=InnoDB;
-- migrate:split
INSERT IGNORE INTO media_catalog_lock (id) VALUES (1);
-- migrate:split
CREATE TABLE IF NOT EXISTS media_cleanup (
  account_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  service ENUM('Stream','Images') NOT NULL,
  asset_id VARCHAR(190) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error VARCHAR(500) NULL,
  PRIMARY KEY (account_id, service, asset_id),
  INDEX due (account_id, next_attempt)
) ENGINE=InnoDB;
