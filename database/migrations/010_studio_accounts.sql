ALTER TABLE admin_invitations MODIFY role ENUM('admin','editor','analyst','owner') NOT NULL;
-- migrate:split
ALTER TABLE admins
  DROP COLUMN owner_slot,
  ADD COLUMN reset_token_hash CHAR(64) CHARACTER SET ascii NULL UNIQUE,
  ADD COLUMN reset_expires_at DATETIME NULL;
