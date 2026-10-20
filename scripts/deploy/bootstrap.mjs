import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { assertRailwayDatabaseUrl, readRailwayTarget } from './env.mjs';

function clientFor(connectionString) {
  return new pg.Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 7000 });
}

async function verifyCredentials(adminUrl, passwords) {
  for (const [role, password] of Object.entries(passwords)) {
    const url = new URL(adminUrl);
    url.username = role;
    url.password = password;
    const client = clientFor(url.href);
    try {
      await client.connect();
      await client.query('SELECT 1');
    } finally {
      await client.end();
    }
  }
}

function scramVerifier(password) {
  // Bootstrap accepts only ASCII hex passwords, so SASLprep leaves them unchanged.
  const salt = randomBytes(16);
  const saltedPassword = pbkdf2Sync(password, salt, 4096, 32, 'sha256');
  const clientKey = createHmac('sha256', saltedPassword).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest('base64');
  const serverKey = createHmac('sha256', saltedPassword).update('Server Key').digest('base64');
  return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${storedKey}:${serverKey}`;
}

/** SQL para pg ou stdin do psql. Contém verificadores sensíveis, nunca senhas originais. */
export function renderRailwayBootstrapSql(env = process.env) {
  const target = readRailwayTarget(env);
  const passwords = {
    renova_migrator: env.POSTGRES_MIGRATOR_PASSWORD,
    renova_runtime: env.POSTGRES_RUNTIME_PASSWORD,
  };
  if (
    env.RENOVA_BOOTSTRAP_NEW_DATABASE !== '1' ||
    !Object.values(passwords).every((password) => /^[a-f0-9]{64}$/.test(password ?? '')) ||
    passwords.renova_migrator === passwords.renova_runtime
  ) {
    throw new Error('Bootstrap exige autorização de banco novo e credenciais distintas.');
  }
  const database = pg.escapeIdentifier(target.expectedDatabase);
  const project = pg.escapeLiteral(target.projectId);
  const environment = pg.escapeLiteral(target.environmentId);
  const roles = Object.entries(passwords)
    .map(
      ([role, password]) =>
        `CREATE ROLE ${pg.escapeIdentifier(role)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${pg.escapeLiteral(scramVerifier(password))};`,
    )
    .join('\n');
  return `BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5s';
SELECT pg_advisory_xact_lock(724839102);
DO $renova_bootstrap$
DECLARE role_name text;
BEGIN
  IF current_database() <> ${pg.escapeLiteral(target.expectedDatabase)} OR current_user <> 'postgres'
    OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'Bootstrap administrative identity mismatch';
  END IF;
  PERFORM set_config('renova.bootstrap_created', 'false', true);
  IF to_regclass('renova_bootstrap.identity') IS NOT NULL THEN
    IF (SELECT count(*) FROM renova_bootstrap.identity) <> 1 OR NOT EXISTS (
      SELECT 1 FROM renova_bootstrap.identity WHERE project_id = ${project} AND environment_id = ${environment}
    ) THEN RAISE EXCEPTION 'Bootstrap database identity mismatch'; END IF;
    IF (SELECT count(*) FROM pg_roles
      WHERE rolname IN ('renova_migrator', 'renova_runtime') AND rolcanlogin
      AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
      AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = pg_roles.oid)
    ) <> 2 THEN RAISE EXCEPTION 'Bootstrap roles mismatch'; END IF;
    FOREACH role_name IN ARRAY ARRAY['renova_migrator', 'renova_runtime'] LOOP
      IF NOT has_table_privilege(role_name, 'renova_bootstrap.identity', 'SELECT')
        OR has_table_privilege(role_name, 'renova_bootstrap.identity', 'INSERT,UPDATE,DELETE,TRUNCATE')
      THEN RAISE EXCEPTION 'Bootstrap identity permissions mismatch'; END IF;
    END LOOP;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public', 'information_schema') AND nspname !~ '^pg_')
    OR EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace)
    OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace)
    OR EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace)
    OR EXISTS (SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql')
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('renova_migrator', 'renova_runtime'))
  THEN RAISE EXCEPTION 'Bootstrap refuses existing database or roles'; END IF;
  ${roles}
  REVOKE ALL ON DATABASE ${database} FROM PUBLIC;
  GRANT CONNECT ON DATABASE ${database} TO renova_migrator, renova_runtime;
  GRANT CREATE ON DATABASE ${database} TO renova_migrator;
  REVOKE ALL ON SCHEMA public FROM PUBLIC;
  ALTER SCHEMA public OWNER TO renova_migrator;
  GRANT USAGE ON SCHEMA public TO renova_runtime;
  ALTER ROLE renova_runtime SET statement_timeout = '5s';
  ALTER ROLE renova_runtime SET lock_timeout = '5s';
  CREATE SCHEMA renova_bootstrap;
  CREATE TABLE renova_bootstrap.identity (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    project_id text NOT NULL,
    environment_id text NOT NULL
  );
  GRANT USAGE ON SCHEMA renova_bootstrap TO renova_migrator, renova_runtime;
  GRANT SELECT ON renova_bootstrap.identity TO renova_migrator, renova_runtime;
  INSERT INTO renova_bootstrap.identity(project_id, environment_id) VALUES (${project}, ${environment});
  PERFORM set_config('renova.bootstrap_created', 'true', true);
END
$renova_bootstrap$;
SELECT current_setting('renova.bootstrap_created')::boolean AS created;
COMMIT;
`;
}

/** One-off administrativo. Nunca imprime SQL, credenciais ou erro bruto do servidor. */
export async function bootstrapRailwayDatabase(env = process.env) {
  const sql = renderRailwayBootstrapSql(env);
  const target = readRailwayTarget(env);
  const adminUrl = assertRailwayDatabaseUrl(env.BOOTSTRAP_DATABASE_URL, target, 'postgres');
  const client = clientFor(adminUrl.href);
  try {
    await client.connect();
    const results = await client.query(sql);
    const result = results.find((entry) => typeof entry.rows[0]?.created === 'boolean');
    if (!result) throw new Error('Resultado de bootstrap ausente.');
    await verifyCredentials(adminUrl.href, {
      renova_migrator: env.POSTGRES_MIGRATOR_PASSWORD,
      renova_runtime: env.POSTGRES_RUNTIME_PASSWORD,
    });
    return { created: result.rows[0].created };
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    throw new Error(
      'Bootstrap Railway recusado: destino, identidade, credenciais ou banco não vazio.',
    );
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Argumentos recusados.');
    const result = await bootstrapRailwayDatabase();
    process.stdout.write(
      result.created
        ? 'Banco Railway vinculado.\n'
        : 'Identidade Railway já vinculada; credenciais preservadas.\n',
    );
  } catch {
    process.stderr.write('Bootstrap Railway recusado; nenhum segredo é exibido.\n');
    process.exitCode = 1;
  }
}
