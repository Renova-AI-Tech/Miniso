import { readEnv } from './env.js';
import { createApp } from './server/app.js';
import { createDatabase } from './database.js';

async function start() {
  const env = readEnv();
  const database = createDatabase(env);
  const app = await createApp(env, database);
  app.addHook('onClose', async () => database.close());
  const close = async () => {
    await app.close();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  await app.listen({ host: env.HOST, port: env.PORT });
}

start().catch(() => {
  process.stderr.write(
    'Backend startup failed. Check configuration and local service availability.\n',
  );
  process.exitCode = 1;
});
