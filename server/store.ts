import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import pg from 'pg';
import type { Run } from './engine.js';

const { Pool } = pg;
const storePath = process.env.VERCEL
  ? join('/tmp', 'agentproof', 'runs.json')
  : join(process.cwd(), 'data', 'runs.json');

export interface RunRepository {
  backend: 'json' | 'postgres';
  list(): Promise<Run[]>;
  save(run: Run): Promise<void>;
  close?(): Promise<void>;
}

export class JsonRunRepository implements RunRepository {
  backend = 'json' as const;
  private queue = Promise.resolve();
  async list(): Promise<Run[]> {
    try { return JSON.parse(await readFile(storePath, 'utf8')) as Run[]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  }
  async save(run: Run) {
    this.queue = this.queue.then(async () => {
      const runs = await this.list();
      await mkdir(dirname(storePath), { recursive: true });
      await writeFile(storePath, JSON.stringify([run, ...runs].slice(0, 100), null, 2));
    });
    await this.queue;
  }
}

export class PostgresRunRepository implements RunRepository {
  backend = 'postgres' as const;
  private pool: pg.Pool;
  constructor(connectionString: string) { this.pool = new Pool({ connectionString, max: 5 }); }
  async initialize() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS agentproof_runs (
      id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL,
      score NUMERIC NOT NULL, payload JSONB NOT NULL
    )`);
  }
  async list() {
    const result = await this.pool.query<{ payload: Run }>('SELECT payload FROM agentproof_runs ORDER BY created_at DESC LIMIT 100');
    return result.rows.map(row => row.payload);
  }
  async save(run: Run) {
    await this.pool.query(
      `INSERT INTO agentproof_runs (id, created_at, status, score, payload) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, score=EXCLUDED.score, payload=EXCLUDED.payload`,
      [run.id, run.createdAt, run.status, run.score, run],
    );
  }
  async close() { await this.pool.end(); }
}

export async function createRunRepository(): Promise<RunRepository> {
  if (!process.env.DATABASE_URL) return new JsonRunRepository();
  const repository = new PostgresRunRepository(process.env.DATABASE_URL);
  await repository.initialize();
  return repository;
}
