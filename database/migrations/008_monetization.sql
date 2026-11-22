ALTER TABLE mobile_users MODIFY coin_balance INT NOT NULL DEFAULT 250;
-- migrate:split
ALTER TABLE purchase_transactions
  ADD COLUMN provider_token_hash CHAR(64) NULL AFTER provider_transaction_id,
  ADD COLUMN reversed_at DATETIME NULL AFTER status,
  ADD UNIQUE KEY unique_provider_token (platform, provider_token_hash);
-- migrate:split
ALTER TABLE ad_reward_claims
  ADD COLUMN ad_unit_id VARCHAR(190) NULL AFTER episode_id,
  ADD COLUMN rejection_reason VARCHAR(190) NULL AFTER status;
-- migrate:split
CREATE TABLE IF NOT EXISTS monetization_settings (
  id TINYINT UNSIGNED PRIMARY KEY,
  monetization_enabled TINYINT(1) NOT NULL DEFAULT 0,
  ad_unlock_enabled TINYINT(1) NOT NULL DEFAULT 0,
  daily_ad_unlock_limit INT UNSIGNED NOT NULL DEFAULT 3,
  ad_claim_ttl_seconds INT UNSIGNED NOT NULL DEFAULT 600,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- migrate:split
INSERT IGNORE INTO monetization_settings
  (id, monetization_enabled, ad_unlock_enabled, daily_ad_unlock_limit, ad_claim_ttl_seconds)
VALUES (1, 0, 0, 3, 600);
