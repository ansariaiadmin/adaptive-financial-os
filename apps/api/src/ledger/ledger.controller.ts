import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { ReportsService } from './reports.service';
import { PostEntryDto } from './dto/post-entry.dto';

@Controller('ledger')
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly reports: ReportsService,
  ) {}

  @Post('entries')
  post(@Body() dto: PostEntryDto) {
    return this.ledger.postEntry(dto);
  }

  @Get('entries')
  list(@Query('tenantId') tenantId: string, @Query('limit') limit?: string) {
    return this.ledger.listEntries(tenantId, Number(limit || 20));
  }

  @Get('entries/:id')
  get(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    return this.ledger.getEntry(tenantId, id);
  }

  @Get('projection')
  listProjections(@Query('tenantId') tenantId: string, @Query('limit') limit?: string) {
    return this.ledger.listProjections(tenantId, Number(limit || 20));
  }

  @Get('projection/:id')
  getProjection(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    return this.ledger.getProjection(tenantId, id);
  }

  @Get('balances')
  listBalances(@Query('tenantId') tenantId: string) {
    return this.ledger.listBalances(tenantId);
  }

  // Reports — v3.2.2 — تاریکی روشن شد — همینا رو برو — حسابدار واقعی نیاز داره
  @Get('reports/trial-balance')
  trialBalance(@Query('tenantId') tenantId: string) {
    return this.reports.trialBalance(tenantId);
  }

  @Get('reports/balance-sheet')
  balanceSheet(@Query('tenantId') tenantId: string) {
    return this.reports.balanceSheet(tenantId);
  }

  @Get('reports/income-statement')
  incomeStatement(
    @Query('tenantId') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.incomeStatement(tenantId, from, to);
  }

  @Get('reports/ledger-export')
  ledgerExport(
    @Query('tenantId') tenantId: string,
    @Query('accountCode') accountCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.ledgerExport(tenantId, accountCode, from, to);
  }

  @Get('reports/hierarchy')
  hierarchy(@Query('tenantId') tenantId: string) {
    return this.reports.accountHierarchy(tenantId);
  }
}
