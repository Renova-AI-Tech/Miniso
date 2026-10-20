import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const usage =
  'Use node scripts/auth/invite-remote.mjs --project ID --environment ID --service ID email "Nome da pessoa".';

export function parseRemoteInviteArgs(args) {
  const [
    projectFlag,
    projectId,
    environmentFlag,
    environmentId,
    serviceFlag,
    serviceId,
    email,
    name,
  ] = args;
  if (
    args.length !== 8 ||
    projectFlag !== '--project' ||
    environmentFlag !== '--environment' ||
    serviceFlag !== '--service' ||
    ![projectId, environmentId, serviceId].every((value) => uuid.test(value ?? '')) ||
    typeof email !== 'string' ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 80
  )
    throw new Error(usage);
  return { projectId, environmentId, serviceId, email, name };
}

export async function runtimeDependencies() {
  const [{ parseEnv }, { createAuthService, reportAuthEvent }, { default: pg }] = await Promise.all(
    [import('../../apps/backend/dist/env.js'), import('@renova/auth'), import('pg')],
  );
  return {
    parseEnv,
    createAuthService,
    reportAuthEvent,
    createClient: (settings) =>
      new pg.Client({
        connectionString: settings.DATABASE_URL,
        application_name: 'renova-auth-invite',
        connectionTimeoutMillis: 3000,
        statement_timeout: 5000,
        query_timeout: 6000,
      }),
  };
}

export async function runRemoteInvite(args, source = process.env, dependencies) {
  const selected = parseRemoteInviteArgs(args);
  if (
    source.NODE_ENV !== 'production' ||
    source.DEPLOY_TARGET !== 'railway' ||
    source.RAILWAY_PROJECT_ID !== selected.projectId ||
    source.RAILWAY_ENVIRONMENT_ID !== selected.environmentId ||
    source.RAILWAY_SERVICE_ID !== selected.serviceId
  )
    throw new Error('Destino remoto não corresponde ao serviço selecionado.');
  const runtime = dependencies ?? (await runtimeDependencies());
  const settings = runtime.parseEnv(source);
  const client = runtime.createClient(settings);
  try {
    await client.connect();
    const identity = await client.query(
      'SELECT current_user AS role, current_database() AS database, project_id, environment_id FROM renova_bootstrap.identity',
    );
    const row = identity.rows[0];
    if (
      identity.rows.length !== 1 ||
      row.role !== 'renova_runtime' ||
      row.database !== settings.RENOVA_DB_NAME ||
      row.project_id !== selected.projectId ||
      row.environment_id !== selected.environmentId
    )
      throw new Error('Identidade remota do banco não corresponde ao destino.');
  } finally {
    await client.end();
  }
  const auth = runtime.createAuthService(settings, { onEvent: runtime.reportAuthEvent });
  try {
    return await auth.invite(selected.email, selected.name);
  } finally {
    await auth.close();
  }
}

export async function executeRemoteInvite(
  args,
  source = process.env,
  dependencies,
  output = process,
) {
  try {
    const result = await runRemoteInvite(args, source, dependencies);
    if (result.delivery === 'accepted') {
      output.stdout.write('Convite aceito pelo provedor de email. Nenhuma senha foi enviada.\n');
      return 0;
    }
    output.stderr.write(
      'Entrega não confirmada. A conta continua pendente; confira a configuração do serviço.\n',
    );
  } catch {
    output.stderr.write(
      'Convite remoto não concluído. Confira argumentos, destino, identidade do banco e configuração do serviço; nenhum segredo foi exibido.\n',
    );
  }
  return 1;
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  process.exitCode = await executeRemoteInvite(process.argv.slice(2));
}
