import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { OutboxRelayService } from './relay/outbox-relay.service';

async function bootstrap(): Promise<void> {
  // Standalone application context (no HTTP listener for a worker).
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  app.enableShutdownHooks();
  const relay = app.get(OutboxRelayService);
  relay.start();
}

bootstrap().catch((err) => {
  // Fatal config/bootstrap errors crash the process (do not swallow).
  console.error('outbox-relay bootstrap failed:', err);
  process.exit(1);
});
