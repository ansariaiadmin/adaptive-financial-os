import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';

/**
 * Local copy of apps/api DatabaseService (self-contained app).
 * NOTE: the worker DB role must bypass RLS (table owner / superuser):
 * one claim batch spans multiple tenants, so we must NOT SET app.current_tenant.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'afos',
      password: process.env.PGPASSWORD || 'afos',
      database: process.env.PGDATABASE || 'afos',
      max: Number(process.env.PGPOOL_MAX || 10),
    });
  }

  async onModuleInit() {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  getPool(): Pool {
    return this.pool;
  }

  query<T extends QueryResultRow = QueryResultRow>(text: string, params: any[] = []): Promise<{ rows: T[] }> {
    return this.pool.query<T>(text, params);
  }
}
