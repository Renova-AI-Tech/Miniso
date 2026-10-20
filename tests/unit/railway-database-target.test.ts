import { describe, expect, it } from 'vitest';
import { runMigrations, runRailwayMigrations } from '../../packages/dbmigrator/src/index.js';
import {
  bootstrapRailwayDatabase,
  renderRailwayBootstrapSql,
} from '../../scripts/deploy/bootstrap.mjs';
import { assertRailwayDatabaseUrl, readRailwayTarget } from '../../scripts/deploy/env.mjs';

const env = {
  DEPLOY_TARGET: 'railway',
  NODE_ENV: 'production',
  RAILWAY_PROJECT_ID: '11111111-1111-1111-1111-111111111111',
  RAILWAY_ENVIRONMENT_ID: '22222222-2222-2222-2222-222222222222',
  RAILWAY_SERVICE_ID: '33333333-3333-3333-3333-333333333333',
  RENOVA_DB_PROJECT_ID: '11111111-1111-1111-1111-111111111111',
  RENOVA_DB_ENVIRONMENT_ID: '22222222-2222-2222-2222-222222222222',
  RENOVA_DB_NAME: 'railway',
};
const connectionString =
  'postgresql://renova_migrator:secret@postgres.railway.internal:5432/railway';

describe('destino explícito do banco Railway', () => {
  it('exige concordância de projeto e ambiente com os identificadores Railway', () => {
    expect(readRailwayTarget(env)).toMatchObject({
      projectId: env.RAILWAY_PROJECT_ID,
      environmentId: env.RAILWAY_ENVIRONMENT_ID,
      expectedDatabase: 'railway',
    });
    for (const change of [
      { DEPLOY_TARGET: 'local' },
      { NODE_ENV: 'development' },
      { RAILWAY_SERVICE_ID: 'invalid' },
      { RENOVA_DB_PROJECT_ID: env.RAILWAY_ENVIRONMENT_ID },
      { RENOVA_DB_ENVIRONMENT_ID: env.RAILWAY_PROJECT_ID },
      { RENOVA_DB_NAME: 'postgres' },
      { RENOVA_DB_NAME: '' },
    ])
      expect(() => readRailwayTarget({ ...env, ...change })).toThrow('Destino Railway');
  });

  it('recusa proxy público, loopback, admin e parâmetros antes de conectar', async () => {
    const target = readRailwayTarget(env);
    expect(assertRailwayDatabaseUrl(connectionString, target, 'renova_migrator').hostname).toBe(
      'postgres.railway.internal',
    );
    for (const url of [
      connectionString.replace('postgres.railway.internal', 'proxy.rlwy.net'),
      connectionString.replace('postgres.railway.internal', '127.0.0.1'),
      connectionString.replace('renova_migrator', 'postgres'),
      connectionString.replace('renova_migrator', 'renova_runtime'),
      connectionString.replace(':5432', ':5433'),
      connectionString.replace('/railway', '/foreign'),
      `${connectionString}?host=other.railway.internal`,
      `${connectionString}#fragment`,
    ]) {
      expect(() => assertRailwayDatabaseUrl(url, target, 'renova_migrator')).toThrow(
        'Conexão Railway',
      );
      await expect(
        runRailwayMigrations({ ...target, connectionString: url }),
      ).rejects.toMatchObject({ code: 'INVALID_TARGET' });
    }
    await expect(runMigrations({ ...target, connectionString })).rejects.toMatchObject({
      code: 'INVALID_TARGET',
    });
  });

  it('bootstrap exige autorização e dois segredos fortes separados', async () => {
    const bootstrap = {
      ...env,
      BOOTSTRAP_DATABASE_URL: connectionString.replace('renova_migrator', 'postgres'),
    };
    await expect(bootstrapRailwayDatabase(bootstrap)).rejects.toThrow('autorização');
    await expect(
      bootstrapRailwayDatabase({
        ...bootstrap,
        RENOVA_BOOTSTRAP_NEW_DATABASE: '1',
        POSTGRES_RUNTIME_PASSWORD: 'a'.repeat(64),
        POSTGRES_MIGRATOR_PASSWORD: 'a'.repeat(64),
      }),
    ).rejects.toThrow('distintas');
  });

  it('SQL enviado ao servidor contém somente verificadores SCRAM com salts independentes', () => {
    const bootstrap = {
      ...env,
      RENOVA_BOOTSTRAP_NEW_DATABASE: '1',
      POSTGRES_RUNTIME_PASSWORD: 'a'.repeat(64),
      POSTGRES_MIGRATOR_PASSWORD: 'b'.repeat(64),
    };
    const salts = new Set<string>();
    for (let attempt = 0; attempt < 2; attempt++) {
      const sql = renderRailwayBootstrapSql(bootstrap);
      expect(sql).not.toContain(bootstrap.POSTGRES_RUNTIME_PASSWORD);
      expect(sql).not.toContain(bootstrap.POSTGRES_MIGRATOR_PASSWORD);
      const verifiers = [
        ...sql.matchAll(/PASSWORD 'SCRAM-SHA-256\$4096:([^$']+)\$([^:']+):([^']+)'/g),
      ];
      expect(verifiers).toHaveLength(2);
      for (const [, salt, storedKey, serverKey] of verifiers) {
        expect(Buffer.from(salt, 'base64')).toHaveLength(16);
        expect(Buffer.from(storedKey, 'base64')).toHaveLength(32);
        expect(Buffer.from(serverKey, 'base64')).toHaveLength(32);
        salts.add(salt);
      }
    }
    expect(salts.size).toBe(4);
  });
});
