CREATE TABLE IF NOT EXISTS daily_viewers (
  view_date DATE NOT NULL,
  user_id VARCHAR(80) NOT NULL,
  PRIMARY KEY (view_date, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
