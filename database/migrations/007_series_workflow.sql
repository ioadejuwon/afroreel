ALTER TABLE series ADD COLUMN default_episode_access ENUM('free','locked') NOT NULL DEFAULT 'free';
-- migrate:split
ALTER TABLE episodes ADD COLUMN publish_when_ready BOOLEAN NOT NULL DEFAULT FALSE;
