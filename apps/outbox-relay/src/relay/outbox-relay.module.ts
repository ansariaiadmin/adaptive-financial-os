import { Module } from '@nestjs/common';
import { OutboxRelayService } from './outbox-relay.service';
import { ProjectionService } from './projection.service';

@Module({
  providers: [OutboxRelayService, ProjectionService],
  exports: [OutboxRelayService, ProjectionService],
})
export class OutboxRelayModule {}
