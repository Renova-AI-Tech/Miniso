import { describe, expect, it, vi } from 'vitest';
import { executeRemoteInvite, runRemoteInvite } from '../../scripts/auth/invite-remote.mjs';
import { parseEnv } from '../../apps/backend/src/env.js';

const projectId = '21f5f513-6571-4a84-98e7-f7a385a14b94';
const environmentId = '16167aac-e3b0-4d9a-bc18-d9629a0dc96c';
const serviceId = '86284bf6-94d4-45b0-b8dd-5e1b1237e904';
const source = {
  NODE_ENV: 'production',
  DEPLOY_TARGET: 'railway',
  HOST: '::',
  RAILWAY_PROJECT_ID: projectId,
  RAILWAY_ENVIRONMENT_ID: environmentId,
  RAILWAY_SERVICE_ID: serviceId,
  RENOVA_DB_NAME: 'renova_app',
  DATABASE_URL:
    'postgresql://renova_runtime:synthetic-private-password-123@postgres.railway.internal:5432/renova_app',
  FRONTEND_URL: 'https://app.example.com',
  AUTH_SECRET: '0123456789abcdef'.repeat(4),
  RESEND_API_KEY: 're_SYNTHETIC_PRIVATE_KEY',
  AUTH_EMAIL_FROM: 'access@example.com',
};
const args = [
  '--project',
  projectId,
  '--environment',
  environmentId,
  '--service',
  serviceId,
  'person@example.com',
  'Synthetic person',
];
const identity = {
  role: 'renova_runtime',
  database: 'renova_app',
  project_id: projectId,
  environment_id: environmentId,
};
function fixture(row = identity) {
  const client = {
    connect: vi.fn(),
    query: vi.fn().mockResolvedValue({ rows: [row] }),
    end: vi.fn(),
  };
  const auth = { invite: vi.fn().mockResolvedValue({ delivery: 'accepted' }), close: vi.fn() };
  return {
    client,
    auth,
    dependencies: {
      parseEnv,
      createClient: vi.fn(() => client),
      createAuthService: vi.fn(() => auth),
      reportAuthEvent: vi.fn(),
    },
  };
}

describe('convite executado no serviço Railway', () => {
  it('confere alvo e identidade usando runtime antes de criar conta', async () => {
    const { client, auth, dependencies } = fixture();
    expect(await runRemoteInvite(args, source, dependencies)).toEqual({ delivery: 'accepted' });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM renova_bootstrap.identity'),
    );
    expect(client.end.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.createAuthService.mock.invocationCallOrder[0] ?? 0,
    );
    expect(auth.invite).toHaveBeenCalledWith('person@example.com', 'Synthetic person');
    expect(auth.close).toHaveBeenCalledOnce();
  });

  it.each([
    { NODE_ENV: 'development' },
    { DEPLOY_TARGET: 'local' },
    { RAILWAY_PROJECT_ID: environmentId },
    { RAILWAY_ENVIRONMENT_ID: projectId },
    { RAILWAY_SERVICE_ID: projectId },
    { DATABASE_URL: source.DATABASE_URL.replace('renova_runtime:', 'postgres:') },
    { DATABASE_URL: source.DATABASE_URL.replace('postgres.railway.internal', '127.0.0.1') },
  ])('recusa ambiente ou alvo divergente antes de conectar: %j', async (change) => {
    const { dependencies } = fixture();
    await expect(runRemoteInvite(args, { ...source, ...change }, dependencies)).rejects.toThrow();
    expect(dependencies.createClient).not.toHaveBeenCalled();
    expect(dependencies.createAuthService).not.toHaveBeenCalled();
  });

  it.each([
    { role: 'renova_migrator' },
    { database: 'other_db' },
    { project_id: environmentId },
    { environment_id: projectId },
  ])('recusa identidade DB divergente sem criar conta: %j', async (change) => {
    const { client, dependencies } = fixture({ ...identity, ...change });
    await expect(runRemoteInvite(args, source, dependencies)).rejects.toThrow('Identidade remota');
    expect(dependencies.createAuthService).not.toHaveBeenCalled();
    expect(client.end).toHaveBeenCalledOnce();
  });

  it('não interpreta argumentos adicionais como comando ou configuração', async () => {
    const { dependencies } = fixture();
    await expect(runRemoteInvite([...args, '--override'], source, dependencies)).rejects.toThrow(
      'Use node',
    );
    expect(dependencies.createClient).not.toHaveBeenCalled();
  });

  it('retorna entrega não confirmada e sempre encerra os recursos', async () => {
    const { client, auth, dependencies } = fixture();
    auth.invite.mockResolvedValue({ delivery: 'failed' });
    expect(await runRemoteInvite(args, source, dependencies)).toEqual({ delivery: 'failed' });
    expect(client.end).toHaveBeenCalledOnce();
    expect(auth.close).toHaveBeenCalledOnce();
  });

  it.each([{ rows: [] }, { rows: [identity, identity] }])(
    'recusa identidade ausente ou ambígua: %j',
    async ({ rows }) => {
      const { client, dependencies } = fixture();
      client.query.mockResolvedValue({ rows });
      await expect(runRemoteInvite(args, source, dependencies)).rejects.toThrow(
        'Identidade remota',
      );
      expect(dependencies.createAuthService).not.toHaveBeenCalled();
      expect(client.end).toHaveBeenCalledOnce();
    },
  );

  it('falha de banco encerra conexão e a CLI não expõe diagnóstico bruto', async () => {
    const { client, dependencies } = fixture();
    client.connect.mockRejectedValue(new Error(`SENTINEL_DB ${source.DATABASE_URL}`));
    const output = { stdout: { write: vi.fn() }, stderr: { write: vi.fn() } };
    expect(await executeRemoteInvite(args, source, dependencies, output)).toBe(1);
    expect(dependencies.createAuthService).not.toHaveBeenCalled();
    expect(client.end).toHaveBeenCalledOnce();
    expect(output.stdout.write).not.toHaveBeenCalled();
    expect(JSON.stringify(output.stderr.write.mock.calls)).not.toMatch(
      /SENTINEL|postgresql|re_SYNTHETIC/,
    );
  });

  it('a CLI distingue aceitação de falha sem expor destinatário nem link', async () => {
    for (const delivery of ['accepted', 'failed']) {
      const { auth, dependencies } = fixture();
      auth.invite.mockResolvedValue({ delivery });
      const output = { stdout: { write: vi.fn() }, stderr: { write: vi.fn() } };
      expect(await executeRemoteInvite(args, source, dependencies, output)).toBe(
        delivery === 'accepted' ? 0 : 1,
      );
      const printed = JSON.stringify([
        output.stdout.write.mock.calls,
        output.stderr.write.mock.calls,
      ]);
      expect(printed).not.toContain('person@example.com');
      expect(printed).not.toContain('https://');
      expect(printed).not.toContain(source.RESEND_API_KEY);
    }
  });
});
