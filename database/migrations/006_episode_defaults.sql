CREATE TABLE IF NOT EXISTS episode_defaults (
  id TINYINT UNSIGNED PRIMARY KEY,
  free_opening_episodes INT UNSIGNED NOT NULL,
  locked_coin_price INT UNSIGNED NOT NULL
) ENGINE=InnoDB;
-- migrate:split
INSERT IGNORE INTO episode_defaults (id, free_opening_episodes, locked_coin_price) VALUES (1, 5, 5);
