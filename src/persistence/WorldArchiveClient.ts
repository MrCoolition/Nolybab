import type { NolybabSimulation } from '../simulation/NolybabSimulation';
import type { SimulationSnapshot, SimulationState } from '../simulation/types';

export type ArchiveStatus = 'local' | 'restoring' | 'saving' | 'rooted' | 'offline';
type StatusListener = (status: ArchiveStatus) => void;

interface ArchiveIdentity {
  worldId: string;
  writeKey: string;
  seedPhrase: string;
  revision: number;
}

interface WorldResponse {
  ok?: boolean;
  world?: {
    id?: string;
    revision?: number;
    snapshot?: unknown;
  };
}

interface CheckpointResponse {
  ok?: boolean;
  reason?: string;
  checkpoint?: {
    baseRevision?: number;
    requestedRevision?: number;
    storedRevision?: number;
  };
  retryAfter?: number;
}

type OutboxChannel = 'event' | 'artifact';

interface OutboxRecord {
  key: string;
  channel: OutboxChannel;
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  capturedAt: string;
}

interface OutboxState {
  version: 2;
  worldId: string;
  pending: OutboxRecord[];
  seen: string[];
  archiveSerial: number;
}

interface PostBatch {
  body: string;
  keys: string[];
  baseRevision: number;
  revision: number;
}

interface FlushResult {
  success: boolean;
  retryAfterMs?: number;
}

interface RemoteCheckpoint {
  state: SimulationState;
  revision: number;
}

const IDENTITY_KEY = 'nolybab.neon-world.v1';
const OUTBOX_KEY_PREFIX = 'nolybab.neon-outbox.v2:';
const MAX_OUTBOX_BYTES = 1_250_000;
const EMERGENCY_OUTBOX_BYTES = 700_000;
const MAX_OUTBOX_RECORDS = 768;
const MAX_SEEN_KEYS = 4_096;
const MAX_EVENT_PAYLOAD_BYTES = 10 * 1024;
const MAX_ARTIFACT_PAYLOAD_BYTES = 28 * 1024;
const MAX_BATCH_EVENTS = 48;
const MAX_BATCH_ARTIFACTS = 18;
const TARGET_REQUEST_BYTES = 232 * 1024;
const TARGET_SNAPSHOT_BYTES = 172 * 1024;
const MAX_CONFLICT_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 60_000;

const SNAPSHOT_PROFILES = [
  { history: 60, lessons: 80, lexicon: 100, laws: 30, works: 72 },
  { history: 42, lessons: 60, lexicon: 76, laws: 24, works: 56 },
  { history: 28, lessons: 42, lexicon: 54, laws: 18, works: 42 },
  { history: 16, lessons: 28, lexicon: 36, laws: 12, works: 30 },
  { history: 8, lessons: 16, lexicon: 22, laws: 8, works: 20 },
  { history: 4, lessons: 8, lexicon: 12, laws: 6, works: 12 },
] as const;

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function createIdentity(seedPhrase: string): ArchiveIdentity {
  return {
    worldId: `world_${crypto.randomUUID()}`,
    writeKey: randomKey(),
    seedPhrase,
    revision: 0,
  };
}

function isSimulationState(value: unknown): value is SimulationState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Partial<SimulationState>;
  return state.version === 1 && typeof state.seedPhrase === 'string' && typeof state.seed === 'number' && Array.isArray(state.voices);
}

function readIdentity(): ArchiveIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ArchiveIdentity>;
    if (
      typeof value.worldId !== 'string' ||
      !/^world_[a-z0-9-]{30,50}$/i.test(value.worldId) ||
      typeof value.writeKey !== 'string' ||
      value.writeKey.length < 24 ||
      typeof value.seedPhrase !== 'string'
    ) return null;
    const revision = Number(value.revision);
    return {
      worldId: value.worldId,
      writeKey: value.writeKey,
      seedPhrase: value.seedPhrase,
      revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
    };
  } catch {
    return null;
  }
}

function writeIdentity(identity: ArchiveIdentity): void {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // The simulation remains local when storage is restricted.
  }
}

function utf8Bytes(serialized: string): number {
  return new TextEncoder().encode(serialized).byteLength;
}

function jsonBytes(value: unknown): number {
  try {
    return utf8Bytes(JSON.stringify(value));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function retryAfterMilliseconds(response?: Response): number | null {
  const value = response?.headers.get('Retry-After')?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(1_000, Math.min(MAX_RETRY_DELAY_MS, seconds * 1_000));
  }
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.max(1_000, Math.min(MAX_RETRY_DELAY_MS, date - Date.now()));
}

function clonePayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const clone = JSON.parse(JSON.stringify(value)) as unknown;
    return clone && typeof clone === 'object' && !Array.isArray(clone) ? clone as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function safeLedgerId(base: string, suffix = ''): string {
  const cleanBase = base.replace(/[^A-Za-z0-9._:-]/g, '-').replace(/^[^A-Za-z0-9]+/, '') || 'entry';
  const cleanSuffix = suffix.replace(/[^A-Za-z0-9._:-]/g, '-');
  return `${cleanBase.slice(0, Math.max(1, 128 - cleanSuffix.length))}${cleanSuffix}`.slice(0, 128);
}

function payloadSummary(payload: Record<string, unknown>): string {
  const candidates = ['title', 'word', 'name', 'decision', 'summary', 'detail', 'text', 'account']
    .map((key) => payload[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .slice(0, 2);
  if (candidates.length > 0) return candidates.join(' — ').replace(/\s+/g, ' ').slice(0, 320);
  if (typeof payload.count === 'number') return `Archive capsule representing ${payload.count} earlier records.`;
  return 'Retained in a compact overflow capsule; the checkpoint carries its civic context.';
}

function makeOutboxRecord(
  channel: OutboxChannel,
  id: string,
  kind: string,
  value: unknown,
  capturedAt: string,
): OutboxRecord | null {
  const payload = clonePayload(value);
  if (!payload) return null;
  const maximum = channel === 'event' ? MAX_EVENT_PAYLOAD_BYTES : MAX_ARTIFACT_PAYLOAD_BYTES;
  const originalBytes = jsonBytes(payload);
  const retainedPayload = originalBytes <= maximum
    ? payload
    : {
        schema: 'nolybab.outbox-oversize.v1',
        originalId: id,
        originalKind: kind,
        originalBytes,
        summary: payloadSummary(payload),
        retainedAt: capturedAt,
      };
  const retainedKind = originalBytes <= maximum ? kind : 'outbox-oversize';
  const safeId = safeLedgerId(id);
  return {
    key: `${channel}:${safeId}`,
    channel,
    id: safeId,
    kind: retainedKind.slice(0, 64),
    payload: retainedPayload,
    capturedAt,
  };
}

function outboxStorageKey(worldId: string): string {
  return `${OUTBOX_KEY_PREFIX}${worldId}`;
}

function emptyOutbox(worldId: string): OutboxState {
  return { version: 2, worldId, pending: [], seen: [], archiveSerial: 0 };
}

function isOutboxRecord(value: unknown): value is OutboxRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<OutboxRecord>;
  return (
    typeof record.key === 'string' &&
    (record.channel === 'event' || record.channel === 'artifact') &&
    typeof record.id === 'string' &&
    typeof record.kind === 'string' &&
    typeof record.capturedAt === 'string' &&
    Boolean(record.payload) &&
    typeof record.payload === 'object' &&
    !Array.isArray(record.payload)
  );
}

function readOutbox(worldId: string): OutboxState {
  try {
    const raw = localStorage.getItem(outboxStorageKey(worldId));
    if (!raw) return emptyOutbox(worldId);
    const value = JSON.parse(raw) as Partial<OutboxState>;
    if (value.version !== 2 || value.worldId !== worldId) return emptyOutbox(worldId);
    return {
      version: 2,
      worldId,
      pending: Array.isArray(value.pending) ? value.pending.filter(isOutboxRecord).slice(-2_000) : [],
      seen: Array.isArray(value.seen) ? value.seen.filter((key): key is string => typeof key === 'string').slice(-MAX_SEEN_KEYS) : [],
      archiveSerial: Number.isSafeInteger(value.archiveSerial) && Number(value.archiveSerial) >= 0 ? Number(value.archiveSerial) : 0,
    };
  } catch {
    return emptyOutbox(worldId);
  }
}

function archiveOldestOutboxRecords(state: OutboxState, count: number): void {
  const selected = state.pending.slice(0, Math.max(2, Math.min(count, 48)));
  if (selected.length === 0) return;
  const selectedKeys = new Set(selected.map((record) => record.key));
  state.pending = state.pending.filter((record) => !selectedKeys.has(record.key));
  state.seen.push(...selected.map((record) => record.key));
  if (state.seen.length > MAX_SEEN_KEYS) state.seen.splice(0, state.seen.length - MAX_SEEN_KEYS);

  const capturedAt = selected.at(-1)?.capturedAt ?? new Date().toISOString();
  const id = safeLedgerId(`outbox-archive-${state.archiveSerial}-${crypto.randomUUID().slice(0, 8)}`);
  state.archiveSerial += 1;
  const payload = {
    schema: 'nolybab.outbox-archive.v1',
    count: selected.length,
    firstCapturedAt: selected[0]?.capturedAt,
    lastCapturedAt: capturedAt,
    entries: selected.map((record) => ({
      channel: record.channel,
      id: record.id,
      kind: record.kind,
      capturedAt: record.capturedAt,
      summary: payloadSummary(record.payload),
    })),
  };
  const capsule = makeOutboxRecord('artifact', id, 'outbox-archive', payload, capturedAt);
  if (capsule) state.pending.unshift(capsule);
}

function compactOutbox(state: OutboxState, targetBytes = MAX_OUTBOX_BYTES): void {
  if (state.seen.length > MAX_SEEN_KEYS) state.seen.splice(0, state.seen.length - MAX_SEEN_KEYS);
  let passes = 0;
  while ((state.pending.length > MAX_OUTBOX_RECORDS || jsonBytes(state) > targetBytes) && state.pending.length > 1 && passes < 32) {
    const overBy = Math.max(0, state.pending.length - MAX_OUTBOX_RECORDS);
    archiveOldestOutboxRecords(state, Math.max(24, overBy + 1));
    passes += 1;
  }
}

function persistOutbox(state: OutboxState): boolean {
  compactOutbox(state);
  try {
    localStorage.setItem(outboxStorageKey(state.worldId), JSON.stringify(state));
    return true;
  } catch {
    compactOutbox(state, EMERGENCY_OUTBOX_BYTES);
    try {
      localStorage.setItem(outboxStorageKey(state.worldId), JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }
}

function addOutboxRecord(state: OutboxState, record: OutboxRecord | null, known: Set<string>): boolean {
  if (!record || known.has(record.key)) return false;
  state.pending.push(record);
  known.add(record.key);
  return true;
}

function captureSnapshotLedgers(state: OutboxState, snapshot: SimulationSnapshot): boolean {
  const known = new Set([...state.seen, ...state.pending.map((record) => record.key)]);
  const capturedAt = new Date().toISOString();
  let changed = false;

  for (const entry of snapshot.history) {
    changed = addOutboxRecord(state, makeOutboxRecord('event', entry.id, `memory:${entry.kind}`, entry, capturedAt), known) || changed;
  }
  for (const work of snapshot.works) {
    const id = safeLedgerId(work.id, `:${work.status}`);
    changed = addOutboxRecord(state, makeOutboxRecord('artifact', id, `civic-work:${work.status}`, work, capturedAt), known) || changed;
  }
  for (const lesson of snapshot.lessons) {
    const stateName = lesson.resolved ? 'resolved' : 'open';
    const id = safeLedgerId(lesson.id, `:${stateName}`);
    changed = addOutboxRecord(state, makeOutboxRecord('artifact', id, lesson.resolved ? 'reframed-scar' : 'living-scar', lesson, capturedAt), known) || changed;
  }
  for (const word of snapshot.lexicon) {
    changed = addOutboxRecord(state, makeOutboxRecord('artifact', word.id, 'shared-word', word, capturedAt), known) || changed;
  }
  for (const law of snapshot.laws) {
    changed = addOutboxRecord(state, makeOutboxRecord('artifact', law.id, 'epoch-law', law, capturedAt), known) || changed;
  }

  if (changed) persistOutbox(state);
  return changed;
}

function acknowledgeOutbox(state: OutboxState, keys: string[]): void {
  if (keys.length === 0) return;
  const acknowledged = new Set(keys);
  state.pending = state.pending.filter((record) => !acknowledged.has(record.key));
  state.seen.push(...keys);
  if (state.seen.length > MAX_SEEN_KEYS) state.seen.splice(0, state.seen.length - MAX_SEEN_KEYS);
  persistOutbox(state);
}

function compactSnapshot(snapshot: SimulationSnapshot): SimulationSnapshot | null {
  for (const profile of SNAPSHOT_PROFILES) {
    const works = snapshot.works.slice(-profile.works);
    const candidate: SimulationSnapshot = {
      ...snapshot,
      history: snapshot.history.slice(0, profile.history),
      lessons: snapshot.lessons.slice(-profile.lessons),
      lexicon: snapshot.lexicon.slice(-profile.lexicon),
      laws: snapshot.laws.slice(-profile.laws),
      works,
      archivedWorkCount: snapshot.archivedWorkCount + Math.max(0, snapshot.works.length - works.length),
    };
    if (jsonBytes(candidate) <= TARGET_SNAPSHOT_BYTES) return candidate;
  }
  return null;
}

function buildBatch(snapshot: SimulationSnapshot, identity: ArchiveIdentity, outbox: OutboxState): PostBatch | null {
  const compact = compactSnapshot(snapshot);
  if (!compact) return null;
  const baseRevision = identity.revision;
  const revision = baseRevision + 1;
  const events: Record<string, unknown>[] = [];
  const artifacts: Record<string, unknown>[] = [];
  const keys: string[] = [];

  const body = () => ({
    worldId: identity.worldId,
    checkpoint: { baseRevision, revision, snapshot: compact },
    events,
    artifacts,
  });
  if (jsonBytes(body()) > TARGET_REQUEST_BYTES) return null;

  for (const record of outbox.pending) {
    if (record.channel === 'event' && events.length >= MAX_BATCH_EVENTS) continue;
    if (record.channel === 'artifact' && artifacts.length >= MAX_BATCH_ARTIFACTS) continue;
    const ledger = record.channel === 'event'
      ? { id: record.id, revision, kind: record.kind, payload: record.payload, occurredAt: record.capturedAt }
      : { id: record.id, revision, kind: record.kind, payload: record.payload, createdAt: record.capturedAt };
    const destination = record.channel === 'event' ? events : artifacts;
    destination.push(ledger);
    if (jsonBytes(body()) <= TARGET_REQUEST_BYTES) {
      keys.push(record.key);
    } else {
      destination.pop();
    }
  }

  const serialized = JSON.stringify(body());
  return utf8Bytes(serialized) <= TARGET_REQUEST_BYTES ? { body: serialized, keys, baseRevision, revision } : null;
}

function remoteIsAhead(remote: Pick<SimulationState, 'seed' | 'cycle' | 'elapsed'>, local: SimulationSnapshot): boolean {
  if (remote.seed !== local.seed) return true;
  return remote.cycle > local.cycle || remote.elapsed > local.elapsed + 2;
}

export class WorldArchiveClient {
  private identity: ArchiveIdentity | null = readIdentity();
  private outbox: OutboxState | null = this.identity ? readOutbox(this.identity.worldId) : null;
  private listeners = new Set<StatusListener>();
  private _status: ArchiveStatus = 'local';
  private timer = 0;
  private activeFlush: Promise<FlushResult> | null = null;
  private queuedSnapshot: SimulationSnapshot | null = null;
  private latestSnapshot: SimulationSnapshot | null = null;
  private lastSignature = '';
  private previousCycle = -1;
  private conflictFloor: Pick<SimulationState, 'seed' | 'cycle' | 'elapsed'> | null = null;
  private transientFailures = 0;

  get status(): ArchiveStatus {
    return this._status;
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this._status);
    return () => this.listeners.delete(listener);
  }

  async restore(): Promise<SimulationState | null> {
    const identity = this.identity;
    if (!identity) return null;
    this.setStatus('restoring');
    const remote = await this.fetchRemote(identity);
    if (this.identity !== identity) return null;
    if (!remote) {
      this.setStatus('offline');
      return null;
    }
    identity.revision = remote.revision;
    identity.seedPhrase = remote.state.seedPhrase;
    writeIdentity(identity);
    this.conflictFloor = null;
    this.setStatus('rooted');
    return remote.state;
  }

  attach(simulation: NolybabSimulation): void {
    simulation.subscribe((snapshot) => {
      const restarted = this.previousCycle >= 0 && snapshot.cycle < this.previousCycle;
      this.previousCycle = snapshot.cycle;
      if (!this.identity || this.identity.seedPhrase !== snapshot.seedPhrase || restarted) {
        this.identity = createIdentity(snapshot.seedPhrase);
        this.outbox = readOutbox(this.identity.worldId);
        writeIdentity(this.identity);
        this.lastSignature = '';
        this.conflictFloor = null;
        this.transientFailures = 0;
      }
      this.latestSnapshot = snapshot;
      if (this.outbox) captureSnapshotLedgers(this.outbox, snapshot);

      const signature = [
        snapshot.seed,
        snapshot.cycle,
        snapshot.epoch,
        snapshot.civicPhase,
        snapshot.works.length,
        snapshot.archivedWorkCount,
        snapshot.lessons.length,
        snapshot.lessons.filter((lesson) => lesson.resolved).length,
        snapshot.lexicon.length,
        snapshot.laws.length,
        snapshot.history[0]?.id ?? '',
        this.outbox?.pending.length ?? 0,
      ].join(':');
      if (signature === this.lastSignature) return;
      this.lastSignature = signature;
      this.schedule(snapshot, snapshot.civicPhase === 'growth' ? 250 : 1_400);
    });

    window.addEventListener('online', () => {
      const snapshot = simulation.snapshot;
      this.latestSnapshot = snapshot;
      if (this.outbox) captureSnapshotLedgers(this.outbox, snapshot);
      this.schedule(snapshot, 150);
    });
  }

  private schedule(snapshot: SimulationSnapshot, delay: number): void {
    this.queuedSnapshot = snapshot;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flushQueued(), delay);
  }

  private async flushQueued(): Promise<void> {
    if (this.activeFlush) return;
    const snapshot = this.queuedSnapshot ?? this.latestSnapshot;
    const identity = this.identity;
    if (!snapshot || !identity) return;
    this.queuedSnapshot = null;
    this.setStatus('saving');
    this.activeFlush = this.postCheckpoint(snapshot, identity);
    let result: FlushResult = { success: false };
    try {
      result = await this.activeFlush;
    } finally {
      this.activeFlush = null;
    }

    const hasPending = (this.outbox?.pending.length ?? 0) > 0;
    if (this.queuedSnapshot) {
      // A world switch or newer snapshot may have arrived while the old request
      // was in flight. Its timer could not flush while activeFlush was occupied.
      this.schedule(this.queuedSnapshot, 80);
    } else if (result.success && hasPending) {
      this.schedule(this.queuedSnapshot ?? this.latestSnapshot ?? snapshot, 80);
    } else if (!result.success && result.retryAfterMs) {
      this.schedule(this.queuedSnapshot ?? this.latestSnapshot ?? snapshot, result.retryAfterMs);
    }
  }

  private async postCheckpoint(snapshot: SimulationSnapshot, identity: ArchiveIdentity): Promise<FlushResult> {
    if (this.conflictFloor && remoteIsAhead(this.conflictFloor, snapshot)) {
      this.setStatus('offline');
      return { success: false };
    }
    this.conflictFloor = null;

    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt += 1) {
      if (this.identity !== identity) return { success: false };
      const outbox = this.outbox ?? readOutbox(identity.worldId);
      if (this.identity !== identity || outbox.worldId !== identity.worldId) return { success: false };
      this.outbox = outbox;
      const batch = buildBatch(snapshot, identity, outbox);
      if (!batch) {
        this.setStatus('offline');
        return { success: false };
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch('/api/world', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${identity.writeKey}`,
            'Content-Type': 'application/json',
          },
          body: batch.body,
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as CheckpointResponse | null;
        if (this.identity !== identity || this.outbox !== outbox) return { success: false };

        if (response.status === 409 && payload?.reason === 'revision_conflict') {
          const remote = await this.fetchRemote(identity);
          if (this.identity !== identity || this.outbox !== outbox) return { success: false };
          if (!remote) {
            this.setStatus('offline');
            return { success: false, retryAfterMs: this.nextTransientRetry() };
          }
          identity.revision = remote.revision;
          writeIdentity(identity);
          if (remoteIsAhead(remote.state, snapshot)) {
            this.conflictFloor = { seed: remote.state.seed, cycle: remote.state.cycle, elapsed: remote.state.elapsed };
            this.setStatus('offline');
            return { success: false };
          }
          continue;
        }

        if (response.status === 429) {
          const payloadSeconds = Number(payload?.retryAfter);
          const retryAfterMs = retryAfterMilliseconds(response)
            ?? (Number.isFinite(payloadSeconds)
              ? Math.max(1_000, Math.min(MAX_RETRY_DELAY_MS, payloadSeconds * 1_000))
              : 30_000);
          this.setStatus('offline');
          return { success: false, retryAfterMs };
        }

        if (response.status === 408 || response.status === 425 || response.status >= 500) {
          this.setStatus('offline');
          return { success: false, retryAfterMs: this.nextTransientRetry(response) };
        }

        if (!response.ok || !payload?.ok) {
          this.setStatus('offline');
          return { success: false };
        }

        const storedRevision = Number(payload.checkpoint?.storedRevision);
        identity.revision = Number.isSafeInteger(storedRevision) && storedRevision >= batch.revision ? storedRevision : batch.revision;
        identity.seedPhrase = snapshot.seedPhrase;
        writeIdentity(identity);
        acknowledgeOutbox(outbox, batch.keys);
        this.transientFailures = 0;
        this.setStatus('rooted');
        return { success: true };
      } catch {
        if (this.identity !== identity || this.outbox !== outbox) return { success: false };
        this.setStatus('offline');
        return { success: false, retryAfterMs: this.nextTransientRetry() };
      } finally {
        window.clearTimeout(timeout);
      }
    }

    this.setStatus('offline');
    return { success: false };
  }

  private nextTransientRetry(response?: Response): number {
    this.transientFailures = Math.min(this.transientFailures + 1, 7);
    return retryAfterMilliseconds(response)
      ?? Math.min(MAX_RETRY_DELAY_MS, 1_000 * (2 ** Math.min(this.transientFailures - 1, 5)));
  }

  private async fetchRemote(identity: ArchiveIdentity): Promise<RemoteCheckpoint | null> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(`/api/world?worldId=${encodeURIComponent(identity.worldId)}&limit=1`, {
        headers: { Authorization: `Bearer ${identity.writeKey}` },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as WorldResponse | null;
      const snapshot = payload?.world?.snapshot;
      const revision = Number(payload?.world?.revision);
      if (!response.ok || !payload?.ok || !isSimulationState(snapshot) || !Number.isSafeInteger(revision) || revision < 0) return null;
      return { state: snapshot, revision };
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private setStatus(status: ArchiveStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const listener of this.listeners) listener(status);
  }
}
