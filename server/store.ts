/**
 * Persistence layer. MongoDB when MONGODB_URI is set; otherwise an in-memory
 * store so the app still runs end-to-end (data is lost on restart — the
 * health endpoint and the dashboard banner say which one is active).
 *
 * The multi-step operations that must not race (assigning a team, advancing a
 * status) are single conditional updates, so two admins can never assign the
 * same team or the same incident twice.
 */
import dns from 'dns';
import { MongoClient, type Collection, type Db } from 'mongodb';
import type { RescueTeam, SOSIncident, SOSStatus } from '../src/types/sos';
import { initialRescueTeams } from '../src/data/rescueTeams';

export type IncidentDoc = Omit<SOSIncident, 'timestamp' | 'statusHistory'> & {
  createdAt: string; // ISO
  statusHistory: { status: SOSStatus; timestamp: string }[]; // ISO timestamps
};

export interface IncidentGuard {
  /** Only match if the current status is one of these. */
  status?: SOSStatus[];
  /** Only match if the incident is assigned to exactly this team (null = unassigned). */
  assignedTeamId?: string | null;
}

export interface Store {
  readonly kind: 'mongodb' | 'memory';
  init(): Promise<void>;
  close(): Promise<void>;
  listIncidents(filter?: { citizenId?: string }): Promise<IncidentDoc[]>;
  getIncident(id: string): Promise<IncidentDoc | null>;
  findIncidentByClientRequest(citizenId: string, clientRequestId: string): Promise<IncidentDoc | null>;
  insertIncident(doc: IncidentDoc): Promise<void>;
  updateIncident(
    id: string,
    guard: IncidentGuard,
    set: Partial<IncidentDoc>,
    history: { status: SOSStatus; timestamp: string }
  ): Promise<IncidentDoc | null>;
  listTeams(): Promise<RescueTeam[]>;
  getTeam(id: string): Promise<RescueTeam | null>;
  /** Update a team only if its current status is one of `onlyIfStatus` (when given). */
  updateTeam(id: string, set: Partial<RescueTeam>, onlyIfStatus?: RescueTeam['status'][]): Promise<boolean>;
  savePlan(plan: Record<string, unknown> & { id: string }): Promise<void>;
  saveCapBroadcast(doc: Record<string, unknown> & { identifier: string }): Promise<void>;
}

const clone = <T>(v: T): T => structuredClone(v);

// ---------------------------------------------------------------------------
// In-memory
// ---------------------------------------------------------------------------
class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private incidents: IncidentDoc[] = [];
  private teams: RescueTeam[] = clone(initialRescueTeams);
  private plans = new Map<string, unknown>();
  private caps = new Map<string, unknown>();

  async init() {}
  async close() {}

  async listIncidents(filter?: { citizenId?: string }) {
    const rows = filter?.citizenId ? this.incidents.filter((i) => i.citizenId === filter.citizenId) : this.incidents;
    return clone([...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  async getIncident(id: string) {
    const found = this.incidents.find((i) => i.id === id);
    return found ? clone(found) : null;
  }
  async findIncidentByClientRequest(citizenId: string, clientRequestId: string) {
    const found = this.incidents.find((i) => i.citizenId === citizenId && i.clientRequestId === clientRequestId);
    return found ? clone(found) : null;
  }
  async insertIncident(doc: IncidentDoc) {
    this.incidents.push(clone(doc));
  }
  async updateIncident(id: string, guard: IncidentGuard, set: Partial<IncidentDoc>, history: { status: SOSStatus; timestamp: string }) {
    const inc = this.incidents.find((i) => i.id === id);
    if (!inc) return null;
    if (guard.status && !guard.status.includes(inc.status)) return null;
    if (guard.assignedTeamId !== undefined && (inc.assignedTeamId ?? null) !== guard.assignedTeamId) return null;
    Object.assign(inc, clone(set));
    inc.statusHistory.push(history);
    return clone(inc);
  }
  async listTeams() {
    return clone(this.teams);
  }
  async getTeam(id: string) {
    const t = this.teams.find((x) => x.id === id);
    return t ? clone(t) : null;
  }
  async updateTeam(id: string, set: Partial<RescueTeam>, onlyIfStatus?: RescueTeam['status'][]) {
    const t = this.teams.find((x) => x.id === id);
    if (!t) return false;
    if (onlyIfStatus && !onlyIfStatus.includes(t.status)) return false;
    Object.assign(t, set);
    return true;
  }
  async savePlan(plan: { id: string }) {
    this.plans.set(plan.id, clone(plan));
  }
  async saveCapBroadcast(doc: { identifier: string }) {
    this.caps.set(doc.identifier, clone(doc));
  }
}

// ---------------------------------------------------------------------------
// MongoDB
// ---------------------------------------------------------------------------
class MongoStore implements Store {
  readonly kind = 'mongodb' as const;
  private client: MongoClient;
  private db!: Db;
  private incidents!: Collection<IncidentDoc>;
  private teams!: Collection<RescueTeam>;
  private plans!: Collection<any>;
  private caps!: Collection<any>;

  constructor(private uri: string, private dbName: string) {
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, appName: 'suraksha-x' });
  }

  async init() {
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    this.incidents = this.db.collection<IncidentDoc>('sos_incidents');
    this.teams = this.db.collection<RescueTeam>('rescue_teams');
    this.plans = this.db.collection('relocation_plans');
    this.caps = this.db.collection('cap_broadcasts');

    await this.incidents.createIndex({ id: 1 }, { unique: true });
    await this.incidents.createIndex({ citizenId: 1, createdAt: -1 });
    // One SOS per (citizen, clientRequestId): re-sending a queued SOS can never duplicate it.
    await this.incidents.createIndex(
      { citizenId: 1, clientRequestId: 1 },
      { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } }
    );
    await this.teams.createIndex({ id: 1 }, { unique: true });
    await this.plans.createIndex({ id: 1 }, { unique: true });
    await this.caps.createIndex({ identifier: 1 }, { unique: true });

    // Seed the roster once; never overwrite live team status on restart.
    for (const team of initialRescueTeams) {
      await this.teams.updateOne({ id: team.id }, { $setOnInsert: team }, { upsert: true });
    }
  }

  async close() {
    await this.client.close();
  }

  private noId = { projection: { _id: 0 } } as const;

  async listIncidents(filter?: { citizenId?: string }) {
    return (await this.incidents
      .find(filter?.citizenId ? { citizenId: filter.citizenId } : {}, this.noId)
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray()) as IncidentDoc[];
  }
  async getIncident(id: string) {
    return (await this.incidents.findOne({ id }, this.noId)) as IncidentDoc | null;
  }
  async findIncidentByClientRequest(citizenId: string, clientRequestId: string) {
    return (await this.incidents.findOne({ citizenId, clientRequestId }, this.noId)) as IncidentDoc | null;
  }
  async insertIncident(doc: IncidentDoc) {
    await this.incidents.insertOne({ ...doc } as any);
  }
  async updateIncident(id: string, guard: IncidentGuard, set: Partial<IncidentDoc>, history: { status: SOSStatus; timestamp: string }) {
    const filter: Record<string, unknown> = { id };
    if (guard.status) filter.status = { $in: guard.status };
    if (guard.assignedTeamId !== undefined) filter.assignedTeamId = guard.assignedTeamId;
    const res = await this.incidents.findOneAndUpdate(
      filter as any,
      { $set: set as any, $push: { statusHistory: history } as any },
      { returnDocument: 'after', projection: { _id: 0 } }
    );
    return (res as unknown as IncidentDoc | null) ?? null;
  }
  async listTeams() {
    return (await this.teams.find({}, this.noId).toArray()) as RescueTeam[];
  }
  async getTeam(id: string) {
    return (await this.teams.findOne({ id }, this.noId)) as RescueTeam | null;
  }
  async updateTeam(id: string, set: Partial<RescueTeam>, onlyIfStatus?: RescueTeam['status'][]) {
    const filter: Record<string, unknown> = { id };
    if (onlyIfStatus) filter.status = { $in: onlyIfStatus };
    const res = await this.teams.updateOne(filter as any, { $set: set as any });
    return res.matchedCount > 0;
  }
  async savePlan(plan: { id: string }) {
    await this.plans.replaceOne({ id: plan.id }, { ...plan, savedAt: new Date().toISOString() }, { upsert: true });
  }
  async saveCapBroadcast(doc: { identifier: string }) {
    await this.caps.replaceOne({ identifier: doc.identifier }, { ...doc, savedAt: new Date().toISOString() }, { upsert: true });
  }
}

/**
 * mongodb+srv:// URIs need a DNS SRV lookup. Some local DNS setups (a stub
 * resolver on 127.0.0.1, certain VPNs/routers) refuse SRV queries even though
 * the internet works, giving "querySrv ECONNREFUSED". If the system resolver
 * can't answer, retry through public DNS for this process.
 */
export async function ensureSrvResolvable(uri: string): Promise<void> {
  const m = uri.match(/^mongodb\+srv:\/\/(?:[^@]*@)?([^/?]+)/);
  if (!m) return;
  const host = `_mongodb._tcp.${m[1]}`;
  const ok = await new Promise<boolean>((resolve) => dns.resolveSrv(host, (err) => resolve(!err)));
  if (ok) return;
  console.warn('[DB] System DNS could not resolve the Atlas SRV record; retrying through public DNS (8.8.8.8, 1.1.1.1).');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

export async function createStore(): Promise<Store> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.warn('[DB] MONGODB_URI is not set — using the in-memory store. Data is lost when the server restarts.');
    return new MemoryStore();
  }
  await ensureSrvResolvable(uri);
  const store = new MongoStore(uri, process.env.MONGODB_DB?.trim() || 'suraksha_x');
  try {
    await store.init();
    console.log('[DB] Connected to MongoDB.');
    return store;
  } catch (err: any) {
    // Never fail silently into memory mode with a configured URI: say so loudly.
    console.error(`[DB] Could not connect to MongoDB (${err?.message || err}). Falling back to the in-memory store.`);
    return new MemoryStore();
  }
}
