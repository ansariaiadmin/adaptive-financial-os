import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async check() {
    const dbOk = await this.db.ping();
    return { status: dbOk ? 'ok' : 'degraded', db: dbOk ? 'up' : 'down', ts: new Date().toISOString() };
  }
}
