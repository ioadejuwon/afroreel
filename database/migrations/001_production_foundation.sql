CREATE TABLE IF NOT EXISTS mobile_refresh_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(80) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  family_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  replaced_by_hash CHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_refresh_user (user_id),
  INDEX idx_refresh_family (family_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- migrate:split
CREATE TABLE IF NOT EXISTS account_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(80) NOT NULL,
  purpose ENUM('verify_email','reset_password') NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_account_tokens_user_purpose (user_id, purpose)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- migrate:split
CREATE TABLE IF NOT EXISTS purchase_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(80) NOT NULL,
  platform ENUM('ios','android') NOT NULL,
  provider_transaction_id VARCHAR(255) NOT NULL,
  product_id VARCHAR(190) NOT NULL,
  coin_amount INT UNSIGNED NOT NULL,
  status ENUM('verified','revoked','refunded') NOT NULL DEFAULT 'verified',
  raw_payload JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_provider_transaction (platform, provider_transaction_id),
  INDEX idx_purchase_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- migrate:split
CREATE TABLE IF NOT EXISTS ad_reward_claims (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nonce CHAR(64) NOT NULL UNIQUE,
  provider_event_id VARCHAR(255) NULL UNIQUE,
  user_id VARCHAR(80) NOT NULL,
  episode_id VARCHAR(32) NOT NULL,
  status ENUM('pending','verified','expired','rejected') NOT NULL DEFAULT 'pending',
  expires_at DATETIME NOT NULL,
  verified_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reward_user_episode (user_id, episode_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- migrate:split
CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  provider_event_id VARCHAR(255) NOT NULL,
  status ENUM('received','processed','failed') NOT NULL DEFAULT 'received',
  payload JSON NULL,
  error_message VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  UNIQUE KEY unique_webhook_event (provider, provider_event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- migrate:split
CREATE TABLE IF NOT EXISTS comment_reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  comment_id INT UNSIGNED NOT NULL,
  reporter_user_id VARCHAR(80) NOT NULL,
  reason VARCHAR(80) NOT NULL,
  details VARCHAR(500) NULL,
  status ENUM('open','reviewed','dismissed','removed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_comment_report (comment_id, reporter_user_id),
  INDEX idx_comment_report_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- migrate:split
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_user_id VARCHAR(80) NOT NULL,
  blocked_user_id VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_user_id, blocked_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
