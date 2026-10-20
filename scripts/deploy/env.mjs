const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function readRailwayTarget(env = process.env) {
  if (
    env.DEPLOY_TARGET !== 'railway' ||
    env.NODE_ENV !== 'production' ||
    ![env.RAILWAY_PROJECT_ID, env.RAILWAY_ENVIRONMENT_ID, env.RAILWAY_SERVICE_ID].every((value) =>
      uuid.test(value ?? ''),
    ) ||
    env.RENOVA_DB_PROJECT_ID !== env.RAILWAY_PROJECT_ID ||
    env.RENOVA_DB_ENVIRONMENT_ID !== env.RAILWAY_ENVIRONMENT_ID ||
    !/^[a-z][a-z0-9_]{0,62}$/.test(env.RENOVA_DB_NAME ?? '') ||
    ['postgres', 'template0', 'template1'].includes(env.RENOVA_DB_NAME)
  ) {
    throw new Error('Destino Railway ausente ou divergente; operação recusada.');
  }
  return {
    target: 'railway',
    projectId: env.RENOVA_DB_PROJECT_ID,
    environmentId: env.RENOVA_DB_ENVIRONMENT_ID,
    expectedDatabase: env.RENOVA_DB_NAME,
  };
}

export function assertRailwayDatabaseUrl(connectionString, target, role) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('Conexão Railway inválida; operação recusada.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !/^[a-z0-9][a-z0-9-]*\.railway\.internal$/.test(url.hostname) ||
    url.port !== '5432' ||
    url.username !== role ||
    !url.password ||
    url.pathname !== `/${target.expectedDatabase}` ||
    url.search ||
    url.hash
  ) {
    throw new Error('Conexão Railway inválida; operação recusada.');
  }
  return url;
}
