import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  link,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rmdir,
  unlink,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { parseEnv, promisify } from 'node:util';
import { parseProjectConfig } from '../project/config.mjs';

const execute = promisify(execFile);
const databaseNamePattern = /^renova_[a-f0-9]{12}_(local|test)$/;

export function assertLocalDatabaseTarget(connectionString, { expectedDatabase, target }) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('Alvo de banco inválido.');
  }
  if (
    !['local', 'test'].includes(target) ||
    !databaseNamePattern.test(expectedDatabase) ||
    !expectedDatabase.endsWith(`_${target}`) ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.pathname !== `/${expectedDatabase}` ||
    !['renova_runtime', 'renova_migrator'].includes(url.username) ||
    !url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Alvo recusado: use o banco local explicitamente vinculado ao projeto.');
  }
  return url;
}

export async function allocateLoopbackPort(preferred = 0, excluded = []) {
  const server = createServer();
  try {
    await new Promise((accept, reject) => {
      server.once('error', reject);
      server.listen(preferred, '127.0.0.1', accept);
    });
    const port = server.address().port;
    if (excluded.includes(port)) return allocateLoopbackPort(0, excluded);
    return port;
  } catch (error) {
    if (preferred && error.code === 'EADDRINUSE') return allocateLoopbackPort(0, excluded);
    throw new Error('Não foi possível selecionar uma porta local.');
  } finally {
    if (server.listening) await new Promise((accept) => server.close(accept));
  }
}

export async function assertPortAvailable(port) {
  const selected = await allocateLoopbackPort(port);
  if (selected !== port) throw new Error('Porta ocupada; nenhum processo foi encerrado.');
}

export function planLocalDatabase({ projectRoot, projectSlug, target, port, projectId }) {
  if (!['local', 'test'].includes(target) || !/^[a-z][a-z0-9-]{2,47}$/.test(projectSlug)) {
    throw new Error('Identidade do projeto inválida.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta inválida.');
  if (!/^[a-f0-9-]{36}$/.test(projectId)) throw new Error('Identidade do banco inválida.');
  const rootIdentity = createHash('sha256').update(resolve(projectRoot)).digest('hex').slice(0, 12);
  const identity =
    target === 'local'
      ? rootIdentity
      : createHash('sha256').update(projectId).digest('hex').slice(0, 12);
  const composeProject = `renova-${projectSlug}-${identity}-${target}`;
  return {
    schemaVersion: 1,
    rootIdentity,
    projectId,
    target,
    composeProject,
    databaseName: `renova_${identity}_${target}`,
    host: '127.0.0.1',
    port,
    volumeName: `${composeProject}_postgres_data`,
  };
}

export async function createDatabaseEnvironment(
  plan,
  { preferredPorts = false, profile = 'public' } = {},
) {
  if (!['public', 'authenticated'].includes(profile)) throw new Error('Perfil local inválido.');
  const password = () => randomBytes(32).toString('hex');
  const migratorPassword = password();
  const runtimePassword = password();
  const frontendPort = await allocateLoopbackPort(preferredPorts ? 43123 : 0, [plan.port]);
  const backendPort = await allocateLoopbackPort(preferredPorts ? 43124 : 0, [
    plan.port,
    frontendPort,
  ]);
  const auth = {};
  if (profile === 'authenticated') {
    const smtp = await allocateLoopbackPort(0, [plan.port, frontendPort, backendPort]);
    const mailpit = await allocateLoopbackPort(0, [plan.port, frontendPort, backendPort, smtp]);
    Object.assign(auth, {
      AUTH_SECRET: password(),
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtp),
      MAILPIT_PORT: String(mailpit),
      AUTH_EMAIL_FROM: 'acesso@renova.local',
    });
  }
  const connection = (role, secret) =>
    `postgresql://${role}:${secret}@127.0.0.1:${plan.port}/${plan.databaseName}`;
  return {
    RENOVA_COMPOSE_PROJECT: plan.composeProject,
    RENOVA_DB_PROJECT_ID: plan.projectId,
    POSTGRES_DB: plan.databaseName,
    POSTGRES_HOST_PORT: String(plan.port),
    POSTGRES_ADMIN_PASSWORD: password(),
    POSTGRES_MIGRATOR_PASSWORD: migratorPassword,
    POSTGRES_RUNTIME_PASSWORD: runtimePassword,
    DATABASE_URL: connection('renova_runtime', runtimePassword),
    MIGRATION_DATABASE_URL: connection('renova_migrator', migratorPassword),
    NODE_ENV: plan.target === 'test' ? 'test' : 'development',
    HOST: '127.0.0.1',
    PORT: String(backendPort),
    FRONTEND_URL: `http://127.0.0.1:${frontendPort}`,
    PROFILE: profile,
    ...auth,
  };
}

export async function runCompose(root, env, args) {
  try {
    return await execute(
      'docker',
      [
        'compose',
        '--file',
        join(root, 'docker-compose.yml'),
        '--project-name',
        env.RENOVA_COMPOSE_PROJECT,
        ...args,
      ],
      {
        cwd: root,
        env: { ...process.env, ...env },
        maxBuffer: 1024 * 1024,
      },
    );
  } catch {
    throw new Error(
      'Docker não concluiu a operação. Verifique o daemon, a imagem Postgres e a porta; dados existentes foram preservados.',
    );
  }
}

export function validateDatabaseEnvironment(plan, env) {
  validateLocalProfile(env);
  for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL']) {
    assertLocalDatabaseTarget(env[key], {
      expectedDatabase: plan.databaseName,
      target: plan.target,
    });
    if (new URL(env[key]).port !== String(plan.port))
      throw new Error('Porta do banco diverge do estado local.');
  }
  if (
    env.RENOVA_COMPOSE_PROJECT !== plan.composeProject ||
    env.POSTGRES_DB !== plan.databaseName ||
    env.RENOVA_DB_PROJECT_ID !== plan.projectId ||
    env.POSTGRES_HOST_PORT !== String(plan.port)
  ) {
    throw new Error('Ambiente e identidade do banco divergem; nenhum recurso foi alterado.');
  }
  if (
    ['POSTGRES_ADMIN_PASSWORD', 'POSTGRES_MIGRATOR_PASSWORD', 'POSTGRES_RUNTIME_PASSWORD'].some(
      (key) => !/^[a-f0-9]{64}$/.test(env[key] ?? ''),
    )
  ) {
    throw new Error('Credenciais locais inválidas.');
  }
  if (
    new URL(env.DATABASE_URL).username !== 'renova_runtime' ||
    new URL(env.DATABASE_URL).password !== env.POSTGRES_RUNTIME_PASSWORD ||
    new URL(env.MIGRATION_DATABASE_URL).username !== 'renova_migrator' ||
    new URL(env.MIGRATION_DATABASE_URL).password !== env.POSTGRES_MIGRATOR_PASSWORD
  ) {
    throw new Error('Credenciais do runtime e do migrador devem permanecer separadas.');
  }
}

export function validateLocalProfile(env, expectedProfile = env.PROFILE) {
  if (!['public', 'authenticated'].includes(expectedProfile) || env.PROFILE !== expectedProfile)
    throw new Error('Perfil do ambiente diverge do projeto.');
  const authKeys = ['AUTH_SECRET', 'SMTP_HOST', 'SMTP_PORT', 'MAILPIT_PORT', 'AUTH_EMAIL_FROM'];
  if (expectedProfile === 'public') {
    if (authKeys.some((key) => env[key] !== undefined))
      throw new Error('Login não pertence ao perfil público.');
    return;
  }
  const ports = [
    env.POSTGRES_HOST_PORT,
    env.PORT,
    new URL(env.FRONTEND_URL).port,
    env.SMTP_PORT,
    env.MAILPIT_PORT,
  ];
  if (
    !/^[a-f0-9]{64}$/.test(env.AUTH_SECRET ?? '') ||
    env.SMTP_HOST !== '127.0.0.1' ||
    env.AUTH_EMAIL_FROM !== 'acesso@renova.local' ||
    ports.some((port) => !/^\d+$/.test(port ?? '') || Number(port) < 1 || Number(port) > 65535) ||
    new Set(ports.map(Number)).size !== ports.length
  )
    throw new Error('Configuração de login/email local inválida.');
}

export async function startMailpit(root, handle) {
  validateDatabaseEnvironment(handle.plan, handle.env);
  if (handle.env.PROFILE !== 'authenticated')
    throw new Error('Email local exige perfil com login.');
  await runCompose(root, handle.env, [
    'up',
    '--detach',
    '--wait',
    '--wait-timeout',
    '60',
    'mailpit',
  ]);
  return handle;
}

async function inspectPath(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function safeDirectory(path, create = false) {
  if (create) {
    try {
      await mkdir(path, { mode: 0o700 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  const stat = await inspectPath(path);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Caminho local inseguro: diretório ou link simbólico recusado.');
  }
}

async function readRegularFile(path) {
  const stat = await inspectPath(path);
  if (!stat) return undefined;
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('Caminho local inseguro: arquivo ou link simbólico recusado.');
  }
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.ino !== stat.ino || opened.size > 1024 * 1024) {
      throw new Error('Arquivo local mudou durante a leitura; conteúdo preservado.');
    }
    return await file.readFile('utf8');
  } finally {
    await file.close();
  }
}

async function writeNewFile(path, text) {
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(text);
    await file.sync();
  } finally {
    await file.close();
  }
}

function assertMatchingPlan(plan, projectRoot, projectSlug) {
  const expected = planLocalDatabase({
    projectRoot,
    projectSlug,
    target: 'local',
    port: plan?.port,
    projectId: plan?.projectId,
  });
  if (JSON.stringify(plan) !== JSON.stringify(expected)) {
    throw new Error('Estado local pertence a outro projeto ou foi alterado.');
  }
}

function digest(text) {
  return createHash('sha256').update(text).digest('hex');
}

// Unique markers avoid a stale-lock remover accidentally deleting a new owner's lock.
async function acquirePreparationLock(directory, rootIdentity) {
  const locks = join(directory, 'db-setup-locks');
  await safeDirectory(locks, true);
  const ownName = `${rootIdentity}-${process.pid}-${randomUUID()}`;
  const ownPath = join(locks, ownName);
  await mkdir(ownPath, { mode: 0o700 });
  try {
    for (const name of await readdir(locks)) {
      if (name === ownName) continue;
      const owner = /^([a-f0-9]{12})-([1-9][0-9]*)-([a-f0-9-]{36})$/.exec(name);
      const path = join(locks, name);
      const stat = await inspectPath(path);
      if (!stat) continue;
      if (
        !owner ||
        owner[1] !== rootIdentity ||
        !Number.isSafeInteger(Number(owner[2])) ||
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        (await readdir(path)).length
      ) {
        throw new Error('Trava local inválida; execute pnpm run doctor antes de repetir o setup.');
      }
      let dead = false;
      try {
        process.kill(Number(owner[2]), 0);
      } catch (error) {
        dead = error.code === 'ESRCH';
      }
      if (!dead) {
        throw new Error('Outra preparação pode estar em execução. Aguarde e repita o setup.');
      }
      try {
        await rmdir(path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  } catch (error) {
    await rmdir(ownPath);
    throw error;
  }
  return () => rmdir(ownPath);
}

async function readPreparation(directory, projectRoot, projectSlug, { completed = false } = {}) {
  await safeDirectory(directory);
  const files = await readdir(directory);
  if (
    (!completed && files.length !== 3) ||
    files.some((name) => !['metadata.json', 'environment.env', 'state.json'].includes(name))
  ) {
    throw new Error(
      'Estágio local incompleto; execute pnpm run doctor. Arquivos foram preservados.',
    );
  }
  let metadata;
  try {
    metadata = JSON.parse(await readRegularFile(join(directory, 'metadata.json')));
  } catch {
    throw new Error('Metadados locais inválidos; arquivos foram preservados.');
  }
  if (
    metadata?.schemaVersion !== 1 ||
    Object.keys(metadata).sort().join(',') !== 'environmentSha256,plan,schemaVersion' ||
    !/^[a-f0-9]{64}$/.test(metadata.environmentSha256)
  ) {
    throw new Error('Metadados locais inválidos; arquivos foram preservados.');
  }
  assertMatchingPlan(metadata.plan, projectRoot, projectSlug);
  const publishedEnv = completed ? await readRegularFile(join(projectRoot, '.env')) : undefined;
  const publishedState = completed
    ? await readRegularFile(join(projectRoot, '.renova/db-state.json'))
    : undefined;
  const environment = (await readRegularFile(join(directory, 'environment.env'))) ?? publishedEnv;
  const state = (await readRegularFile(join(directory, 'state.json'))) ?? publishedState;
  if (
    environment === undefined ||
    digest(environment) !== metadata.environmentSha256 ||
    state !== `${JSON.stringify(metadata.plan, null, 2)}\n` ||
    (completed && (environment !== publishedEnv || state !== publishedState))
  ) {
    throw new Error('Estágio local foi alterado; execute pnpm run doctor. Conteúdo preservado.');
  }
  const env = parseEnv(environment);
  validateDatabaseEnvironment(metadata.plan, env);
  return { plan: metadata.plan, env, environment, state };
}

async function retirePreparation(
  directory,
  projectRoot,
  projectSlug,
  onCheckpoint = async () => {},
) {
  await safeDirectory(directory);
  if ((await readdir(directory)).length) {
    await readPreparation(directory, projectRoot, projectSlug, { completed: true });
    for (const [name, checkpoint] of [
      ['environment.env', 'environment-retired'],
      ['state.json', 'state-retired'],
      ['metadata.json', 'metadata-retired'],
    ]) {
      if (!(await inspectPath(join(directory, name)))) continue;
      await unlink(join(directory, name));
      await onCheckpoint(checkpoint);
    }
  }
  await rmdir(directory);
}

async function publishPreparedFile(source, target, expected) {
  if ((await readRegularFile(source)) !== expected) {
    throw new Error('Estágio local foi alterado; execute pnpm run doctor. Conteúdo preservado.');
  }
  const existing = await readRegularFile(target);
  if (existing !== undefined) {
    if (existing !== expected) {
      throw new Error('Arquivo local foi alterado; execute pnpm run doctor. Conteúdo preservado.');
    }
    return;
  }
  // link() publishes complete bytes atomically and refuses any existing destination.
  await link(source, target);
}

/** Read-only exception restricted to files owned by an interrupted DB preparation. */
export async function isPendingLocalDatabaseFile(root, relativePath) {
  const stageName = {
    '.env': 'environment.env',
    '.renova/db-state.json': 'state.json',
  }[relativePath];
  if (!stageName) return false;
  try {
    await safeDirectory(resolve(root));
    const projectRoot = await realpath(root);
    const directory = join(projectRoot, '.renova');
    await safeDirectory(directory);
    const config = parseProjectConfig(
      JSON.parse(await readRegularFile(join(projectRoot, 'renova.project.json'))),
    );
    const targetPath = join(projectRoot, relativePath);
    const targetStat = await inspectPath(targetPath);
    if (
      !targetStat?.isFile() ||
      targetStat.isSymbolicLink() ||
      targetStat.nlink !== 2 ||
      (targetStat.mode & 0o777) !== 0o600
    ) {
      return false;
    }
    const candidates = (await readdir(directory)).filter(
      (name) => name === 'db-setup.pending' || /^db-setup-complete-[a-f0-9-]{36}$/.test(name),
    );
    for (const name of candidates) {
      const journal = join(directory, name);
      const staged = await inspectPath(join(journal, stageName));
      if (
        !staged?.isFile() ||
        staged.isSymbolicLink() ||
        staged.nlink !== 2 ||
        staged.ino !== targetStat.ino ||
        staged.dev !== targetStat.dev
      ) {
        continue;
      }
      const prepared = await readPreparation(journal, projectRoot, config.project.slug, {
        completed: name.startsWith('db-setup-complete-'),
      });
      validateLocalProfile(prepared.env, config.profile);
      const state = await readRegularFile(join(directory, 'db-state.json'));
      if (state !== undefined && state !== prepared.state) return false;
      const environment = await readRegularFile(join(projectRoot, '.env'));
      if (environment !== undefined && environment !== prepared.environment) return false;
      const expected = relativePath === '.env' ? prepared.environment : prepared.state;
      return (await readRegularFile(targetPath)) === expected;
    }
  } catch {
    return false;
  }
  return false;
}

export function isPendingLocalDatabaseEnvironment(root) {
  return isPendingLocalDatabaseFile(root, '.env');
}

export async function prepareLocalDatabase(root, { onCheckpoint = async () => {} } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('Comando local recusado em produção.');
  await safeDirectory(resolve(root));
  const projectRoot = await realpath(root);
  const config = parseProjectConfig(
    JSON.parse(await readRegularFile(join(projectRoot, 'renova.project.json'))),
  );

  const directory = join(projectRoot, '.renova');
  await safeDirectory(directory, true);
  const rootIdentity = digest(projectRoot).slice(0, 12);
  const release = await acquirePreparationLock(directory, rootIdentity);
  try {
    const statePath = join(directory, 'db-state.json');
    const envPath = join(projectRoot, '.env');
    const pending = join(directory, 'db-setup.pending');
    const stateText = await readRegularFile(statePath);
    const envText = await readRegularFile(envPath);
    let state;
    if (stateText !== undefined) {
      try {
        state = JSON.parse(stateText);
      } catch {
        throw new Error('Estado local inválido; arquivo preservado.');
      }
      assertMatchingPlan(state, projectRoot, config.project.slug);
    }
    const directoryNames = await readdir(directory);
    for (const completed of directoryNames.filter((name) =>
      /^db-setup-complete-[a-f0-9-]{36}$/.test(name),
    )) {
      await retirePreparation(join(directory, completed), projectRoot, config.project.slug);
    }
    const stages = directoryNames.filter((name) => /^db-setup-stage-[a-f0-9-]{36}$/.test(name));
    const hasPending = await inspectPath(pending);
    if (stages.length > 1 || (stages.length && hasPending)) {
      throw new Error(
        'Há estágios locais conflitantes; execute pnpm run doctor. Nada foi sobrescrito.',
      );
    }
    if (!hasPending && !stages.length && state) {
      if (envText === undefined) throw new Error('Arquivo .env ausente; estado local preservado.');
      const env = parseEnv(envText);
      validateDatabaseEnvironment(state, env);
      validateLocalProfile(env, config.profile);
      return { plan: state, env };
    }
    if (!hasPending && !stages.length && (envText !== undefined || state)) {
      throw new Error(
        'Arquivo .env ou estado já existe sem preparação reconhecida. Conteúdo preservado; execute pnpm run doctor.',
      );
    }
    if (stages.length) {
      const stage = join(directory, stages[0]);
      const staged = await readPreparation(stage, projectRoot, config.project.slug);
      validateLocalProfile(staged.env, config.profile);
      await rename(stage, pending);
    } else if (!hasPending) {
      const plan = planLocalDatabase({
        projectRoot,
        projectSlug: config.project.slug,
        target: 'local',
        port: await allocateLoopbackPort(),
        projectId: randomUUID(),
      });
      const env = await createDatabaseEnvironment(plan, {
        preferredPorts: true,
        profile: config.profile,
      });
      const environment = `${Object.entries(env)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')}\n`;
      const stage = join(directory, `db-setup-stage-${randomUUID()}`);
      await mkdir(stage, { mode: 0o700 });
      await writeNewFile(
        join(stage, 'metadata.json'),
        `${JSON.stringify({ schemaVersion: 1, plan, environmentSha256: digest(environment) }, null, 2)}\n`,
      );
      await writeNewFile(join(stage, 'environment.env'), environment);
      await writeNewFile(join(stage, 'state.json'), `${JSON.stringify(plan, null, 2)}\n`);
      await onCheckpoint('staged');
      await rename(stage, pending);
    }
    const prepared = await readPreparation(pending, projectRoot, config.project.slug);
    validateLocalProfile(prepared.env, config.profile);
    // Check all existing destinations before publishing either file.
    if (
      (envText !== undefined && envText !== prepared.environment) ||
      (stateText !== undefined && stateText !== prepared.state)
    ) {
      throw new Error('Arquivo local foi alterado; execute pnpm run doctor. Conteúdo preservado.');
    }
    await onCheckpoint('prepared');
    await publishPreparedFile(join(pending, 'environment.env'), envPath, prepared.environment);
    await onCheckpoint('environment-published');
    await publishPreparedFile(join(pending, 'state.json'), statePath, prepared.state);
    await onCheckpoint('state-published');
    // Retire the journal atomically so interrupted cleanup cannot prevent a future setup.
    const completed = join(directory, `db-setup-complete-${randomUUID()}`);
    await rename(pending, completed);
    await onCheckpoint('completed');
    await retirePreparation(completed, projectRoot, config.project.slug, onCheckpoint);
    return { plan: prepared.plan, env: prepared.env };
  } finally {
    await release();
  }
}

export async function readLocalDatabase(root) {
  if (process.env.NODE_ENV === 'production') throw new Error('Comando local recusado em produção.');
  try {
    await safeDirectory(resolve(root));
    const projectRoot = await realpath(root);
    await safeDirectory(join(projectRoot, '.renova'));
    const config = parseProjectConfig(
      JSON.parse(await readRegularFile(join(projectRoot, 'renova.project.json'))),
    );
    const plan = JSON.parse(await readRegularFile(join(projectRoot, '.renova/db-state.json')));
    assertMatchingPlan(plan, projectRoot, config.project.slug);
    const env = parseEnv(await readRegularFile(join(projectRoot, '.env')));
    validateDatabaseEnvironment(plan, env);
    validateLocalProfile(env, config.profile);
    return { plan, env };
  } catch {
    throw new Error(
      'Estado local ausente ou inválido. Execute pnpm db:up; nenhum banco foi alterado.',
    );
  }
}

export async function startDatabase(root, handle) {
  validateDatabaseEnvironment(handle.plan, handle.env);
  await runCompose(root, handle.env, [
    'up',
    '--detach',
    '--wait',
    '--wait-timeout',
    '60',
    'postgres',
  ]);
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    connectionString: handle.env.MIGRATION_DATABASE_URL,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  try {
    await client.connect();
    const identity = await client.query(
      'select current_database() as database, project_id from renova_bootstrap.identity',
    );
    if (
      identity.rows.length !== 1 ||
      identity.rows[0].database !== handle.plan.databaseName ||
      identity.rows[0].project_id !== handle.plan.projectId
    ) {
      throw new Error('Identity mismatch');
    }
  } catch {
    throw new Error(
      'O banco não corresponde à identidade/credenciais do projeto; volume preservado.',
    );
  } finally {
    await client.end();
  }
  return handle;
}

export async function createTestDatabase(root, slug = 'integration') {
  const plan = planLocalDatabase({
    projectRoot: root,
    projectSlug: slug,
    target: 'test',
    port: await allocateLoopbackPort(),
    projectId: randomUUID(),
  });
  const config = parseProjectConfig(
    JSON.parse(await readRegularFile(join(root, 'renova.project.json'))),
  );
  const handle = { plan, env: await createDatabaseEnvironment(plan, { profile: config.profile }) };
  try {
    return await startDatabase(root, handle);
  } catch (error) {
    await stopTestDatabase(root, handle);
    throw error;
  }
}

export async function stopTestDatabase(root, handle) {
  if (handle.plan.target !== 'test') throw new Error('Limpeza recusada: banco não descartável.');
  validateDatabaseEnvironment(handle.plan, handle.env);
  await runCompose(root, handle.env, ['down', '--volumes']);
}
