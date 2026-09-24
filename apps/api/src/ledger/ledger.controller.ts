import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { PostEntryDto } from './dto/post-entry.dto';

@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

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
}
