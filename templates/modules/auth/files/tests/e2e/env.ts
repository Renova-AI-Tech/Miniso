export function readTestEnvironment() {
  const environment = process.env;
  const database = new URL(environment.DATABASE_URL ?? '');
  if (
    environment.NODE_ENV !== 'test' ||
    database.hostname !== '127.0.0.1' ||
    !/^\/renova_[a-f0-9]{12}_test$/.test(database.pathname) ||
    !environment.MAILPIT_PORT
  ) {
    throw new Error('Auth E2E requires its disposable test database and Mailpit.');
  }
  return environment;
}
