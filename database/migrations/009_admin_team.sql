ALTER TABLE admins
  ADD COLUMN role ENUM('owner','admin','editor','analyst') NOT NULL DEFAULT 'admin',
  ADD COLUMN last_active_at DATETIME NULL,
  ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN owner_slot TINYINT GENERATED ALWAYS AS (IF(role='owner',1,NULL)) STORED,
  ADD UNIQUE KEY unique_studio_owner (owner_slot);
-- migrate:split
CREATE TABLE admin_invitations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  role ENUM('admin','editor','analyst') NOT NULL,
  message VARCHAR(1000) NOT NULL DEFAULT '',
  token_hash CHAR(64) CHARACTER SET ascii NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  delivery ENUM('sending','sent','failed','preview') NOT NULL DEFAULT 'sending'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
