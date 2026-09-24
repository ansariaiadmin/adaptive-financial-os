import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { OutboxRelayModule } from './relay/outbox-relay.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, OutboxRelayModule],
})
export class AppModule {}
