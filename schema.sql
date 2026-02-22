-- x402 Growth Analytics Database Schema

-- Daily metrics snapshot
CREATE TABLE daily_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE, -- YYYY-MM-DD format
  total_agents INTEGER NOT NULL DEFAULT 0,
  new_agents INTEGER NOT NULL DEFAULT 0,
  total_messages INTEGER NOT NULL DEFAULT 0,
  new_messages INTEGER NOT NULL DEFAULT 0,
  total_sats_received INTEGER NOT NULL DEFAULT 0,
  total_sats_sent INTEGER NOT NULL DEFAULT 0,
  total_sats_net INTEGER NOT NULL DEFAULT 0,
  genesis_agents INTEGER NOT NULL DEFAULT 0,
  registered_agents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent registration events (for adoption rate)
CREATE TABLE agent_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  btc_address TEXT NOT NULL UNIQUE,
  stx_address TEXT NOT NULL,
  display_name TEXT,
  verified_at TIMESTAMP NOT NULL,
  level INTEGER DEFAULT 0,
  level_name TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast date queries
CREATE INDEX idx_daily_metrics_date ON daily_metrics(date DESC);
CREATE INDEX idx_agent_registrations_verified ON agent_registrations(verified_at DESC);
