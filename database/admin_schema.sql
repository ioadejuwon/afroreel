CREATE DATABASE IF NOT EXISTS afroreel
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE afroreel;

CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS series (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(190) NOT NULL,
  slug VARCHAR(210) NOT NULL UNIQUE,
  synopsis TEXT NULL,
  genres VARCHAR(255) NULL,
  poster_url VARCHAR(500) NULL,
  status ENUM('draft', 'live') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS episodes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  series_id INT UNSIGNED NOT NULL,
  episode_number INT UNSIGNED NOT NULL,
  title VARCHAR(190) NOT NULL,
  hook VARCHAR(500) NULL,
  is_free TINYINT(1) NOT NULL DEFAULT 0,
  coin_cost INT UNSIGNED NOT NULL DEFAULT 5,
  release_date DATE NULL,
  status ENUM('draft', 'processing', 'live') NOT NULL DEFAULT 'draft',
  cloudflare_video_uid VARCHAR(190) NULL,
  cloudflare_ready TINYINT(1) NOT NULL DEFAULT 0,
  duration_seconds INT UNSIGNED NULL,
  thumbnail_url VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_series_episode (series_id, episode_number),
  CONSTRAINT fk_episodes_series
    FOREIGN KEY (series_id) REFERENCES series(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS episode_unlocks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(80) NOT NULL,
  episode_id INT UNSIGNED NOT NULL,
  method ENUM('coins', 'ad', 'free') NOT NULL DEFAULT 'coins',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_episode_unlock (user_id, episode_id),
  CONSTRAINT fk_unlocks_episode
    FOREIGN KEY (episode_id) REFERENCES episodes(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS watch_progress (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(80) NOT NULL,
  episode_id INT UNSIGNED NOT NULL,
  progress_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  watched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_episode_progress (user_id, episode_id),
  CONSTRAINT fk_progress_episode
    FOREIGN KEY (episode_id) REFERENCES episodes(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Generate a password hash with:
-- php -r 'echo password_hash("your-password", PASSWORD_DEFAULT), PHP_EOL;'
--
-- Then create the first admin by replacing the hash below:
-- INSERT INTO admins (name, email, password_hash)
-- VALUES ('Admin', 'admin@example.com', '$2y$12$nj9LV6Ai2sdXnRwrxKYW6OOyUn5r2F11MWj3aMAnD3P0sRzHKySVu');
