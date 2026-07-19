import { getReadyNeonSql } from './lib/neon';

const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_SNAPSHOT_BYTES = 192 * 1024;
const MAX_EVENT_PAYLOAD_BYTES = 12 * 1024;
const MAX_ARTIFACT_PAYLOAD_BYTES = 32 * 1024;
const MAX_EVENTS_PER_REQUEST = 64;
const MAX_ARTIFACTS_PER_REQUEST = 24;
const DEFAULT_LEDGER_LIMIT = 100;
const MAX_LEDGER_LIMIT = 200;
const POST_GLOBAL_REQUESTS_PER_MINUTE = 360;
const POST_GLOBAL_BYTES_PER_MINUTE = 64 * 1024 * 1024;
const POST_WORLD_REQUESTS_PER_MINUTE = 36;
const POST_WORLD_BYTES_PER_MINUTE = 8 * 1024 * 1024;
const GET_GLOBAL_REQUESTS_PER_MINUTE = 1_200;
const GET_WORLD_REQUESTS_PER_MINUTE = 180;

const WORLD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/;
const LEDGER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LEDGER_KIND_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/ -]{0,63}$/;
const WRITE_KEY_PATTERN = /^[\x21-\x7e]{24,256}$/;

type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string | string[]): void;
  json(value: unknown): void;
};

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
type JsonObject = { [key: string]: JsonValue };

type CivicEventInput = {
  id: string;
  revision: number;
  kind: string;
  payload: JsonObject;
  occurredAt: string | null;
};

type CivicArtifactInput = {
  id: string;
  revision: number;
  kind: string;
  payload: JsonObject;
  createdAt: string | null;
};

type WorldPostInput = {
  worldId: string;
  baseRevision: number;
  revision: number;
  snapshot: JsonObject;
  snapshotJson: string;
  events: CivicEventInput[];
  artifacts: CivicArtifactInput[];
  requestBytes: number;
};

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 413; reason: string };

type DatabaseRow = Record<string, unknown>;

export const config = {
  api: {
    bodyParser: { sizeLimit: '256kb' },
  },
};

function header(request: ApiRequest, name: string): string {
  const direct = request.headers[name];
  const lower = request.headers[name.toLowerCase()];
  const value = direct ?? lower;
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function queryValue(request: ApiRequest, name: string): string {
  const value = request.query?.[name];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function cursorTimestamp(value: string): string | undefined {
  if (value.length > 40) return undefined;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return undefined;
  const year = new Date(milliseconds).getUTCFullYear();
  return year >= 2000 && year <= 2100 ? value : undefined;
}

function ledgerCursor(value: string): { recordedAt: string; id: string } | null | undefined {
  if (!value) return null;
  const separator = value.lastIndexOf('|');
  if (separator < 1) return undefined;
  // Preserve the database's microseconds. Normalizing through Date would round the
  // cursor to milliseconds and could skip siblings written in the same transaction.
  const recordedAt = cursorTimestamp(value.slice(0, separator));
  const id = value.slice(separator + 1);
  if (!recordedAt || !LEDGER_ID_PATTERN.test(id)) return undefined;
  return { recordedAt, id };
}

function worldKey(request: ApiRequest): string {
  const authorization = header(request, 'authorization');
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
  return bearer ?? header(request, 'x-nolybab-world-key');
}

function isJsonObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function jsonByteLength(serialized: string): number {
  return new TextEncoder().encode(serialized).byteLength;
}

function validateJsonTree(value: unknown, maximumBytes: number): { value: JsonObject; json: string } | null {
  if (!isJsonObject(value)) return null;

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return null;
  }
  if (jsonByteLength(serialized) > maximumBytes) return null;

  let nodes = 0;
  const visit = (candidate: unknown, depth: number): boolean => {
    nodes += 1;
    if (nodes > 24_000 || depth > 18) return false;
    if (candidate === null || typeof candidate === 'boolean') return true;
    if (typeof candidate === 'number') return Number.isFinite(candidate);
    if (typeof candidate === 'string') return candidate.length <= 32_768;
    if (Array.isArray(candidate)) return candidate.length <= 2_048 && candidate.every((item) => visit(item, depth + 1));
    if (!isJsonObject(candidate)) return false;
    const entries = Object.entries(candidate);
    return entries.length <= 1_024 && entries.every(([key, item]) => key.length <= 128 && visit(item, depth + 1));
  };

  return visit(value, 0) ? { value, json: serialized } : null;
}

function safeRevision(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeTimestamp(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 40) return undefined;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return undefined;
  const year = new Date(milliseconds).getUTCFullYear();
  if (year < 2000 || year > 2100) return undefined;
  return new Date(milliseconds).toISOString();
}

function parseBody(request: ApiRequest): ValidationResult<Record<string, unknown>> {
  const declaredLength = Number(header(request, 'content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return { ok: false, status: 413, reason: 'request_too_large' };
  }

  let body = request.body;
  if (typeof body === 'string') {
    if (jsonByteLength(body) > MAX_REQUEST_BYTES) return { ok: false, status: 413, reason: 'request_too_large' };
    try {
      body = JSON.parse(body) as unknown;
    } catch {
      return { ok: false, status: 400, reason: 'invalid_json' };
    }
  }
  if (!isJsonObject(body)) return { ok: false, status: 400, reason: 'invalid_body' };

  let serialized: string;
  try {
    serialized = JSON.stringify(body);
  } catch {
    return { ok: false, status: 400, reason: 'invalid_body' };
  }
  if (jsonByteLength(serialized) > MAX_REQUEST_BYTES) return { ok: false, status: 413, reason: 'request_too_large' };
  return { ok: true, value: body as Record<string, unknown> };
}

function parseEvents(value: unknown, checkpointRevision: number): ValidationResult<CivicEventInput[]> {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, status: 400, reason: 'invalid_events' };
  if (value.length > MAX_EVENTS_PER_REQUEST) return { ok: false, status: 413, reason: 'too_many_events' };

  const ids = new Set<string>();
  const events: CivicEventInput[] = [];
  for (const candidate of value) {
    if (!isJsonObject(candidate)) return { ok: false, status: 400, reason: 'invalid_event' };
    const id = typeof candidate.id === 'string' ? candidate.id : '';
    const kind = typeof candidate.kind === 'string' ? candidate.kind.trim() : '';
    const revision = safeRevision(candidate.revision);
    const payload = validateJsonTree(candidate.payload, MAX_EVENT_PAYLOAD_BYTES);
    const occurredAt = safeTimestamp(candidate.occurredAt);
    if (
      !LEDGER_ID_PATTERN.test(id) ||
      ids.has(id) ||
      !LEDGER_KIND_PATTERN.test(kind) ||
      revision === null ||
      revision > checkpointRevision ||
      !payload ||
      occurredAt === undefined
    ) {
      return { ok: false, status: 400, reason: 'invalid_event' };
    }
    ids.add(id);
    events.push({ id, kind, revision, payload: payload.value, occurredAt });
  }
  return { ok: true, value: events };
}

function parseArtifacts(value: unknown, checkpointRevision: number): ValidationResult<CivicArtifactInput[]> {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, status: 400, reason: 'invalid_artifacts' };
  if (value.length > MAX_ARTIFACTS_PER_REQUEST) return { ok: false, status: 413, reason: 'too_many_artifacts' };

  const ids = new Set<string>();
  const artifacts: CivicArtifactInput[] = [];
  for (const candidate of value) {
    if (!isJsonObject(candidate)) return { ok: false, status: 400, reason: 'invalid_artifact' };
    const id = typeof candidate.id === 'string' ? candidate.id : '';
    const kind = typeof candidate.kind === 'string' ? candidate.kind.trim() : '';
    const revision = safeRevision(candidate.revision);
    const payload = validateJsonTree(candidate.payload, MAX_ARTIFACT_PAYLOAD_BYTES);
    const createdAt = safeTimestamp(candidate.createdAt);
    if (
      !LEDGER_ID_PATTERN.test(id) ||
      ids.has(id) ||
      !LEDGER_KIND_PATTERN.test(kind) ||
      revision === null ||
      revision > checkpointRevision ||
      !payload ||
      createdAt === undefined
    ) {
      return { ok: false, status: 400, reason: 'invalid_artifact' };
    }
    ids.add(id);
    artifacts.push({ id, kind, revision, payload: payload.value, createdAt });
  }
  return { ok: true, value: artifacts };
}

function validatePost(request: ApiRequest): ValidationResult<WorldPostInput> {
  const parsed = parseBody(request);
  if (!parsed.ok) return parsed;
  const source = parsed.value;
  const worldId = typeof source.worldId === 'string' ? source.worldId : '';
  if (!WORLD_ID_PATTERN.test(worldId)) return { ok: false, status: 400, reason: 'invalid_world_id' };

  const checkpoint = isJsonObject(source.checkpoint) ? source.checkpoint : source;
  const revision = safeRevision(checkpoint.revision);
  if (revision === null) return { ok: false, status: 400, reason: 'invalid_revision' };
  const explicitBaseRevision = safeRevision(checkpoint.baseRevision);
  const baseRevision = explicitBaseRevision ?? Math.max(0, revision - 1);
  if (revision !== baseRevision && revision !== baseRevision + 1) {
    return { ok: false, status: 400, reason: 'invalid_revision_step' };
  }
  const snapshot = validateJsonTree(checkpoint.snapshot, MAX_SNAPSHOT_BYTES);
  if (!snapshot) return { ok: false, status: 400, reason: 'invalid_snapshot' };

  const events = parseEvents(source.events, revision);
  if (!events.ok) return events;
  const artifacts = parseArtifacts(source.artifacts, revision);
  if (!artifacts.ok) return artifacts;
  return {
    ok: true,
    value: {
      worldId,
      baseRevision,
      revision,
      snapshot: snapshot.value,
      snapshotJson: snapshot.json,
      events: events.value,
      artifacts: artifacts.value,
      requestBytes: Math.max(
        jsonByteLength(JSON.stringify(source)),
        Number.isSafeInteger(Number(header(request, 'content-length')))
          ? Math.max(0, Number(header(request, 'content-length')))
          : 0,
      ),
    },
  };
}

async function hashWorldKey(worldId: string, key: string): Promise<string> {
  const bytes = new TextEncoder().encode(`nolybab-world-key:v1:${worldId}\u0000${key}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function rowCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function revisionNumber(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function isoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const milliseconds = Date.parse(value);
    if (Number.isFinite(milliseconds)) return new Date(milliseconds).toISOString();
  }
  return new Date(0).toISOString();
}

function rateWindowState(value: unknown): { requests: number; bytes: number; startedAt: number } {
  const row = (Array.isArray(value) ? value[0] : null) as DatabaseRow | null;
  const startedAtValue = row?.windowStartedAt;
  const startedAt = startedAtValue instanceof Date
    ? startedAtValue.getTime()
    : Date.parse(typeof startedAtValue === 'string' ? startedAtValue : '');
  return {
    requests: Number(row?.requestCount) || 0,
    bytes: Number(row?.byteCount) || 0,
    startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
  };
}

function rateLimitResult(
  globalRows: unknown,
  worldRows: unknown,
  globalRequestLimit: number,
  globalByteLimit: number,
  worldRequestLimit: number,
  worldByteLimit: number,
): { allowed: boolean; retryAfter: number } {
  const global = rateWindowState(globalRows);
  const world = rateWindowState(worldRows);
  const allowed =
    global.requests <= globalRequestLimit &&
    global.bytes <= globalByteLimit &&
    world.requests <= worldRequestLimit &&
    world.bytes <= worldByteLimit;
  const retryAfter = Math.max(1, Math.ceil((Math.max(global.startedAt, world.startedAt) + 60_000 - Date.now()) / 1_000));
  return { allowed, retryAfter };
}

function rateLimited(response: ApiResponse, retryAfter: number): void {
  response.setHeader('Retry-After', String(retryAfter));
  response.status(429).json({ ok: false, reason: 'rate_limited', retryAfter });
}

function serviceUnavailable(response: ApiResponse, reason: 'database_not_configured' | 'database_unavailable'): void {
  response.setHeader('Retry-After', '30');
  response.status(503).json({ ok: false, reason });
}

async function handlePost(request: ApiRequest, response: ApiResponse): Promise<void> {
  const validated = validatePost(request);
  if (!validated.ok) {
    response.status(validated.status).json({ ok: false, reason: validated.reason });
    return;
  }

  const key = worldKey(request);
  if (!WRITE_KEY_PATTERN.test(key)) {
    response.status(401).json({ ok: false, reason: 'world_key_required' });
    return;
  }

  const sql = await getReadyNeonSql();
  if (!sql) {
    serviceUnavailable(response, 'database_not_configured');
    return;
  }

  const input = validated.value;
  const keyHash = await hashWorldKey(input.worldId, key);
  const globalRateScope = 'global:post';
  const worldRateScope = `world:post:${input.worldId}`;
  const eventsJson = JSON.stringify(
    input.events.map((event) => ({
      event_id: event.id,
      revision: event.revision,
      event_kind: event.kind,
      payload: event.payload,
      occurred_at: event.occurredAt,
    })),
  );
  const artifactsJson = JSON.stringify(
    input.artifacts.map((artifact) => ({
      artifact_id: artifact.id,
      revision: artifact.revision,
      artifact_kind: artifact.kind,
      payload: artifact.payload,
      created_at: artifact.createdAt,
    })),
  );

  const results = await sql.transaction((transaction) => [
    transaction`
      INSERT INTO api_rate_windows AS rate (scope, window_started_at, request_count, byte_count, updated_at)
      VALUES (${globalRateScope}, now(), 1, ${input.requestBytes}, now())
      ON CONFLICT (scope) DO UPDATE SET
        window_started_at = CASE
          WHEN rate.window_started_at <= now() - interval '1 minute' THEN now()
          ELSE rate.window_started_at
        END,
        request_count = CASE
          WHEN rate.window_started_at <= now() - interval '1 minute' THEN 1
          ELSE rate.request_count + 1
        END,
        byte_count = CASE
          WHEN rate.window_started_at <= now() - interval '1 minute' THEN ${input.requestBytes}
          ELSE rate.byte_count + ${input.requestBytes}
        END,
        updated_at = now()
      RETURNING request_count::text AS "requestCount", byte_count::text AS "byteCount",
                window_started_at AS "windowStartedAt"
    `,
    transaction`
      INSERT INTO api_rate_windows AS rate (scope, window_started_at, request_count, byte_count, updated_at)
      SELECT ${worldRateScope}, now(), 1, ${input.requestBytes}, now()
      WHERE NOT EXISTS (
        SELECT 1 FROM worlds WHERE world_id = ${input.worldId}
      ) OR EXISTS (
        SELECT 1 FROM worlds
        WHERE world_id = ${input.worldId} AND write_key_hash = ${keyHash}
      )
      ON CONFLICT (scope) DO UPDATE SET
        window_started_at = CASE
          WHEN rate.window_started_at <= now() - interval '1 minute' THEN now()
          ELSE rate.window_started_at
        END,
        request_count = CASE
          WHEN rate.window_started_at <= now() - interval '1 minute' THEN 1
          ELSE rate.request_count + 1
        END,
        byte_count = CASE
          WHEN rate.window_started_at <= now() - interval '1 minute' THEN ${input.requestBytes}
          ELSE rate.byte_count + ${input.requestBytes}
        END,
        updated_at = now()
      RETURNING request_count::text AS "requestCount", byte_count::text AS "byteCount",
                window_started_at AS "windowStartedAt"
    `,
    transaction`
      INSERT INTO worlds (world_id, write_key_hash, latest_revision, latest_snapshot)
      SELECT ${input.worldId}, ${keyHash}, ${input.revision}, ${input.snapshotJson}::jsonb
      WHERE ${input.baseRevision} = 0
        AND EXISTS (
          SELECT 1 FROM api_rate_windows
          WHERE scope = ${globalRateScope}
            AND request_count <= ${POST_GLOBAL_REQUESTS_PER_MINUTE}
            AND byte_count <= ${POST_GLOBAL_BYTES_PER_MINUTE}
        )
        AND EXISTS (
          SELECT 1 FROM api_rate_windows
          WHERE scope = ${worldRateScope}
            AND request_count <= ${POST_WORLD_REQUESTS_PER_MINUTE}
            AND byte_count <= ${POST_WORLD_BYTES_PER_MINUTE}
        )
      ON CONFLICT (world_id) DO NOTHING
      RETURNING world_id
    `,
    transaction`
      SELECT world_id
      FROM worlds
      WHERE world_id = ${input.worldId} AND write_key_hash = ${keyHash}
      FOR UPDATE
    `,
    transaction`
      UPDATE worlds
      SET latest_revision = ${input.revision},
          latest_snapshot = ${input.snapshotJson}::jsonb,
          updated_at = now()
      WHERE world_id = ${input.worldId}
        AND write_key_hash = ${keyHash}
        AND latest_revision = ${input.baseRevision}
        AND ${input.revision} > ${input.baseRevision}
        AND EXISTS (
          SELECT 1 FROM api_rate_windows
          WHERE scope = ${globalRateScope}
            AND request_count <= ${POST_GLOBAL_REQUESTS_PER_MINUTE}
            AND byte_count <= ${POST_GLOBAL_BYTES_PER_MINUTE}
        )
        AND EXISTS (
          SELECT 1 FROM api_rate_windows
          WHERE scope = ${worldRateScope}
            AND request_count <= ${POST_WORLD_REQUESTS_PER_MINUTE}
            AND byte_count <= ${POST_WORLD_BYTES_PER_MINUTE}
        )
      RETURNING world_id
    `,
    transaction`
      INSERT INTO civic_events (world_id, event_id, revision, event_kind, payload, occurred_at)
      SELECT ${input.worldId}, item.event_id, item.revision, item.event_kind, item.payload,
             COALESCE(item.occurred_at, now())
      FROM jsonb_to_recordset(${eventsJson}::jsonb)
        AS item(event_id text, revision bigint, event_kind text, payload jsonb, occurred_at timestamptz)
      WHERE EXISTS (
        SELECT 1 FROM worlds
        WHERE world_id = ${input.worldId}
          AND write_key_hash = ${keyHash}
          AND latest_revision = ${input.revision}
          AND latest_snapshot = ${input.snapshotJson}::jsonb
      )
        AND EXISTS (
          SELECT 1 FROM api_rate_windows
          WHERE scope = ${globalRateScope}
            AND request_count <= ${POST_GLOBAL_REQUESTS_PER_MINUTE}
            AND byte_count <= ${POST_GLOBAL_BYTES_PER_MINUTE}
        )
        AND EXISTS (
          SELECT 1 FROM api_rate_windows
          WHERE scope = ${worldRateScope}
            AND request_count <= ${POST_WORLD_REQUESTS_PER_MINUTE}
            AND byte_count <= ${POST_WORLD_BYTES_PER_MINUTE}
        )
      ON CONFLICT (world_id, event_id) DO NOTHING
      RETURNING event_id
    `,
    transaction`
      INSERT INTO civic_artifacts (world_id, artifact_id, revision, artifact_kind, payload, created_at)
      SELECT ${input.worldId}, item.artifact_id, item.revision, item.artifact_kind, item.payload,
             COALESCE(item.created_at, now())
      FROM jsonb_to_recordset(${artifactsJson}::jsonb)
        AS item(artifact_id text, revision bigint, artifact_kind text, payload jsonb, created_at timestamptz)
      WHERE EXISTS (
        SELECT 1 FROM worlds
        WHERE world_id = ${input.worldId}
          AND write_key_hash = ${keyHash}
          AND latest_revision = ${input.revision}
          AND latest_snapshot = ${input.snapshotJson}::jsonb
      )
        AND EXISTS (
          SELECT 1 FROM api_rate_windows
          WHERE scope = ${globalRateScope}
            AND request_count <= ${POST_GLOBAL_REQUESTS_PER_MINUTE}
            AND byte_count <= ${POST_GLOBAL_BYTES_PER_MINUTE}
        )
        AND EXISTS (
          SELECT 1 FROM api_rate_windows
          WHERE scope = ${worldRateScope}
            AND request_count <= ${POST_WORLD_REQUESTS_PER_MINUTE}
            AND byte_count <= ${POST_WORLD_BYTES_PER_MINUTE}
        )
      ON CONFLICT (world_id, artifact_id) DO NOTHING
      RETURNING artifact_id
    `,
    transaction`
      SELECT world_id AS "worldId", latest_revision::text AS revision,
             (latest_snapshot = ${input.snapshotJson}::jsonb) AS "snapshotMatches"
      FROM worlds
      WHERE world_id = ${input.worldId} AND write_key_hash = ${keyHash}
    `,
  ]);

  const rate = rateLimitResult(
    results[0],
    results[1],
    POST_GLOBAL_REQUESTS_PER_MINUTE,
    POST_GLOBAL_BYTES_PER_MINUTE,
    POST_WORLD_REQUESTS_PER_MINUTE,
    POST_WORLD_BYTES_PER_MINUTE,
  );
  if (!rate.allowed) {
    rateLimited(response, rate.retryAfter);
    return;
  }

  const authorizedRows = results[7] as DatabaseRow[];
  if (authorizedRows.length === 0) {
    response.status(404).json({ ok: false, reason: 'world_not_found_or_key_rejected' });
    return;
  }

  const created = rowCount(results[2]) > 0;
  const checkpointAdvanced = created || rowCount(results[4]) > 0;
  const storedRevision = revisionNumber(authorizedRows[0]?.revision);
  const snapshotMatches = authorizedRows[0]?.snapshotMatches === true;
  const insertedEvents = rowCount(results[5]);
  const insertedArtifacts = rowCount(results[6]);
  if (!checkpointAdvanced && (storedRevision !== input.revision || !snapshotMatches)) {
    response.status(409).json({
      ok: false,
      reason: 'revision_conflict',
      worldId: input.worldId,
      checkpoint: {
        baseRevision: input.baseRevision,
        requestedRevision: input.revision,
        storedRevision,
      },
    });
    return;
  }
  response.status(200).json({
    ok: true,
    worldId: input.worldId,
    created,
    checkpoint: {
      baseRevision: input.baseRevision,
      requestedRevision: input.revision,
      storedRevision,
      advanced: checkpointAdvanced,
    },
    inserted: { events: insertedEvents, artifacts: insertedArtifacts },
    ignored: {
      events: input.events.length - insertedEvents,
      artifacts: input.artifacts.length - insertedArtifacts,
    },
  });
}

async function handleGet(request: ApiRequest, response: ApiResponse): Promise<void> {
  const worldId = queryValue(request, 'worldId');
  const key = worldKey(request);
  if (!WORLD_ID_PATTERN.test(worldId)) {
    response.status(400).json({ ok: false, reason: 'invalid_world_id' });
    return;
  }
  if (!WRITE_KEY_PATTERN.test(key)) {
    response.status(401).json({ ok: false, reason: 'world_key_required' });
    return;
  }

  const rawLimit = queryValue(request, 'limit');
  const parsedLimit = rawLimit ? Number(rawLimit) : DEFAULT_LEDGER_LIMIT;
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
    response.status(400).json({ ok: false, reason: 'invalid_limit' });
    return;
  }
  const limit = Math.min(parsedLimit, MAX_LEDGER_LIMIT);
  const eventCursor = ledgerCursor(queryValue(request, 'eventCursor'));
  const artifactCursor = ledgerCursor(queryValue(request, 'artifactCursor'));
  if (eventCursor === undefined || artifactCursor === undefined) {
    response.status(400).json({ ok: false, reason: 'invalid_cursor' });
    return;
  }

  const sql = await getReadyNeonSql();
  if (!sql) {
    serviceUnavailable(response, 'database_not_configured');
    return;
  }

  const keyHash = await hashWorldKey(worldId, key);
  const globalRateScope = 'global:get';
  const worldRateScope = `world:get:${worldId}`;
  const results = await sql.transaction(
    [
      sql`
        INSERT INTO api_rate_windows AS rate (scope, window_started_at, request_count, byte_count, updated_at)
        VALUES (${globalRateScope}, now(), 1, 0, now())
        ON CONFLICT (scope) DO UPDATE SET
          window_started_at = CASE
            WHEN rate.window_started_at <= now() - interval '1 minute' THEN now()
            ELSE rate.window_started_at
          END,
          request_count = CASE
            WHEN rate.window_started_at <= now() - interval '1 minute' THEN 1
            ELSE rate.request_count + 1
          END,
          byte_count = CASE
            WHEN rate.window_started_at <= now() - interval '1 minute' THEN 0
            ELSE rate.byte_count
          END,
          updated_at = now()
        RETURNING request_count::text AS "requestCount", byte_count::text AS "byteCount",
                  window_started_at AS "windowStartedAt"
      `,
      sql`
        INSERT INTO api_rate_windows AS rate (scope, window_started_at, request_count, byte_count, updated_at)
        SELECT ${worldRateScope}, now(), 1, 0, now()
        WHERE EXISTS (
          SELECT 1 FROM worlds
          WHERE world_id = ${worldId} AND write_key_hash = ${keyHash}
        )
        ON CONFLICT (scope) DO UPDATE SET
          window_started_at = CASE
            WHEN rate.window_started_at <= now() - interval '1 minute' THEN now()
            ELSE rate.window_started_at
          END,
          request_count = CASE
            WHEN rate.window_started_at <= now() - interval '1 minute' THEN 1
            ELSE rate.request_count + 1
          END,
          byte_count = CASE
            WHEN rate.window_started_at <= now() - interval '1 minute' THEN 0
            ELSE rate.byte_count
          END,
          updated_at = now()
        RETURNING request_count::text AS "requestCount", byte_count::text AS "byteCount",
                  window_started_at AS "windowStartedAt"
      `,
      sql`
        SELECT world_id AS "worldId", latest_revision::text AS revision,
               latest_snapshot AS snapshot, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM worlds
        WHERE world_id = ${worldId} AND write_key_hash = ${keyHash}
          AND EXISTS (
            SELECT 1 FROM api_rate_windows
            WHERE scope = ${globalRateScope} AND request_count <= ${GET_GLOBAL_REQUESTS_PER_MINUTE}
          )
          AND EXISTS (
            SELECT 1 FROM api_rate_windows
            WHERE scope = ${worldRateScope} AND request_count <= ${GET_WORLD_REQUESTS_PER_MINUTE}
          )
      `,
      sql`
        SELECT event_id AS id, revision::text AS revision, event_kind AS kind,
               payload, occurred_at AS "occurredAt", recorded_at AS "recordedAt",
               to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt"
        FROM civic_events
        WHERE world_id = ${worldId}
          AND EXISTS (
            SELECT 1 FROM worlds
            WHERE world_id = ${worldId} AND write_key_hash = ${keyHash}
          )
          AND EXISTS (
            SELECT 1 FROM api_rate_windows
            WHERE scope = ${globalRateScope} AND request_count <= ${GET_GLOBAL_REQUESTS_PER_MINUTE}
          )
          AND EXISTS (
            SELECT 1 FROM api_rate_windows
            WHERE scope = ${worldRateScope} AND request_count <= ${GET_WORLD_REQUESTS_PER_MINUTE}
          )
          AND (
            ${eventCursor?.recordedAt ?? null}::timestamptz IS NULL
            OR (recorded_at, event_id) < (${eventCursor?.recordedAt ?? null}::timestamptz, ${eventCursor?.id ?? ''})
          )
        ORDER BY recorded_at DESC, event_id DESC
        LIMIT ${limit}
      `,
      sql`
        SELECT artifact_id AS id, revision::text AS revision, artifact_kind AS kind,
               payload, created_at AS "createdAt", recorded_at AS "recordedAt",
               to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt"
        FROM civic_artifacts
        WHERE world_id = ${worldId}
          AND EXISTS (
            SELECT 1 FROM worlds
            WHERE world_id = ${worldId} AND write_key_hash = ${keyHash}
          )
          AND EXISTS (
            SELECT 1 FROM api_rate_windows
            WHERE scope = ${globalRateScope} AND request_count <= ${GET_GLOBAL_REQUESTS_PER_MINUTE}
          )
          AND EXISTS (
            SELECT 1 FROM api_rate_windows
            WHERE scope = ${worldRateScope} AND request_count <= ${GET_WORLD_REQUESTS_PER_MINUTE}
          )
          AND (
            ${artifactCursor?.recordedAt ?? null}::timestamptz IS NULL
            OR (recorded_at, artifact_id) < (${artifactCursor?.recordedAt ?? null}::timestamptz, ${artifactCursor?.id ?? ''})
          )
        ORDER BY recorded_at DESC, artifact_id DESC
        LIMIT ${limit}
      `,
    ],
  );

  const rate = rateLimitResult(
    results[0],
    results[1],
    GET_GLOBAL_REQUESTS_PER_MINUTE,
    Number.MAX_SAFE_INTEGER,
    GET_WORLD_REQUESTS_PER_MINUTE,
    Number.MAX_SAFE_INTEGER,
  );
  if (!rate.allowed) {
    rateLimited(response, rate.retryAfter);
    return;
  }

  const worldRows = results[2] as DatabaseRow[];
  if (worldRows.length === 0) {
    response.status(404).json({ ok: false, reason: 'world_not_found_or_key_rejected' });
    return;
  }
  const world = worldRows[0] ?? {};
  const events = (results[3] as DatabaseRow[]).map((row) => ({
    id: row.id,
    revision: revisionNumber(row.revision),
    kind: row.kind,
    payload: row.payload,
    occurredAt: isoTimestamp(row.occurredAt),
    recordedAt: isoTimestamp(row.recordedAt),
    cursorAt: typeof row.cursorAt === 'string' ? row.cursorAt : isoTimestamp(row.recordedAt),
  }));
  const artifacts = (results[4] as DatabaseRow[]).map((row) => ({
    id: row.id,
    revision: revisionNumber(row.revision),
    kind: row.kind,
    payload: row.payload,
    createdAt: isoTimestamp(row.createdAt),
    recordedAt: isoTimestamp(row.recordedAt),
    cursorAt: typeof row.cursorAt === 'string' ? row.cursorAt : isoTimestamp(row.recordedAt),
  }));
  const lastEvent = events.at(-1);
  const lastArtifact = artifacts.at(-1);
  const nextEventCursor = events.length === limit && lastEvent ? `${lastEvent.cursorAt}|${String(lastEvent.id)}` : null;
  const nextArtifactCursor = artifacts.length === limit && lastArtifact ? `${lastArtifact.cursorAt}|${String(lastArtifact.id)}` : null;

  response.status(200).json({
    ok: true,
    world: {
      id: world.worldId,
      revision: revisionNumber(world.revision),
      snapshot: world.snapshot,
      createdAt: isoTimestamp(world.createdAt),
      updatedAt: isoTimestamp(world.updatedAt),
    },
    ledgers: {
      events: events.map(({ cursorAt: _cursorAt, ...event }) => event),
      artifacts: artifacts.map(({ cursorAt: _cursorAt, ...artifact }) => artifact),
      next: { eventCursor: nextEventCursor, artifactCursor: nextArtifactCursor },
    },
  });
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');

  try {
    const method = request.method?.toUpperCase();
    if (method === 'POST') {
      await handlePost(request, response);
      return;
    }
    if (method === 'GET') {
      await handleGet(request, response);
      return;
    }
    response.setHeader('Allow', 'GET, POST');
    response.status(405).json({ ok: false, reason: 'method_not_allowed' });
  } catch {
    serviceUnavailable(response, 'database_unavailable');
  }
}
