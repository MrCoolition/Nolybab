-- Nolybab durable-world schema.
-- api/lib/neon.ts creates the same objects lazily; this file is for review and
-- optional manual provisioning. civic_events and civic_artifacts are append-only:
-- the API inserts new IDs and treats ID conflicts as idempotent replays.

CREATE TABLE IF NOT EXISTS worlds (
  world_id text PRIMARY KEY,
  write_key_hash text NOT NULL,
  latest_revision bigint NOT NULL DEFAULT 0,
  latest_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worlds_world_id_length CHECK (char_length(world_id) BETWEEN 8 AND 80),
  CONSTRAINT worlds_write_key_hash_shape CHECK (write_key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT worlds_revision_nonnegative CHECK (latest_revision >= 0),
  CONSTRAINT worlds_snapshot_object CHECK (jsonb_typeof(latest_snapshot) = 'object')
);

CREATE TABLE IF NOT EXISTS civic_events (
  world_id text NOT NULL REFERENCES worlds(world_id) ON DELETE CASCADE,
  event_id text NOT NULL,
  revision bigint NOT NULL,
  event_kind text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, event_id),
  CONSTRAINT civic_events_revision_nonnegative CHECK (revision >= 0),
  CONSTRAINT civic_events_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE TABLE IF NOT EXISTS civic_artifacts (
  world_id text NOT NULL REFERENCES worlds(world_id) ON DELETE CASCADE,
  artifact_id text NOT NULL,
  revision bigint NOT NULL,
  artifact_kind text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, artifact_id),
  CONSTRAINT civic_artifacts_revision_nonnegative CHECK (revision >= 0),
  CONSTRAINT civic_artifacts_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

-- One rolling row per global/world+method scope. This supplies durable request
-- and byte budgets without another service or secret.
CREATE TABLE IF NOT EXISTS api_rate_windows (
  scope text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  byte_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_rate_windows_scope_length CHECK (char_length(scope) BETWEEN 3 AND 120),
  CONSTRAINT api_rate_windows_request_count_nonnegative CHECK (request_count >= 0),
  CONSTRAINT api_rate_windows_byte_count_nonnegative CHECK (byte_count >= 0)
);

CREATE INDEX IF NOT EXISTS civic_events_world_revision_idx
ON civic_events (world_id, revision DESC, occurred_at DESC);

CREATE INDEX IF NOT EXISTS civic_artifacts_world_revision_idx
ON civic_artifacts (world_id, revision DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS civic_events_world_recorded_idx
ON civic_events (world_id, recorded_at DESC, event_id DESC);

CREATE INDEX IF NOT EXISTS civic_artifacts_world_recorded_idx
ON civic_artifacts (world_id, recorded_at DESC, artifact_id DESC);
