import { Module } from '@nestjs/common';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { ReportsService } from './reports.service';
import { DatabaseService } from '../database/database.service';

@Module({
  controllers: [LedgerController],
  providers: [LedgerService, ReportsService, DatabaseService],
})
export class LedgerModule {}
