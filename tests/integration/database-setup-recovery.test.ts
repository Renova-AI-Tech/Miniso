import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  lstat,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isPendingLocalDatabaseEnvironment,
  isPendingLocalDatabaseFile,
  prepareLocalDatabase,
  readLocalDatabase,
} from '../../scripts/db/local.mjs';

const roots: string[] = [];
const manifest = {
  schemaVersion: 1,
  project: { slug: 'recovery-project', displayName: 'Projeto de retomada' },
  profile: 'public',
  capabilities: [],
  initialTarget: 'local',
  origin: { templateVersion: '0.1.0-dev', sourceRevision: 'd0c2db9', uiVersion: '0.1.0-dev' },
};

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'renova-db-recovery-')));
  roots.push(root);
  await writeFile(join(root, 'renova.project.json'), JSON.stringify(manifest));
  return root;
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function interruptAt(root: string, checkpoint: string) {
  await expect(
    prepareLocalDatabase(root, {
      onCheckpoint: async (step: string) => {
        if (step === checkpoint) throw new Error('Interrupção sintética');
      },
    }),
  ).rejects.toThrow('Interrupção sintética');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('retomada da preparação local sem Docker', () => {
  it.each(['staged', 'prepared'])(
    'recusa retomar ambiente de outro perfil em %s sem publicar arquivos',
    async (checkpoint) => {
      const root = await fixture();
      await interruptAt(root, checkpoint);
      await writeFile(
        join(root, 'renova.project.json'),
        JSON.stringify({ ...manifest, profile: 'authenticated', capabilities: ['auth'] }),
      );
      const names = await readdir(join(root, '.renova'));
      await expect(prepareLocalDatabase(root)).rejects.toThrow('Perfil do ambiente diverge');
      expect(await readdir(join(root, '.renova'))).toEqual(names);
      await expect(lstat(join(root, '.env'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(lstat(join(root, '.renova/db-state.json'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      // The original choice can still resume its own preparation.
      await writeFile(join(root, 'renova.project.json'), JSON.stringify(manifest));
      expect((await prepareLocalDatabase(root)).env.PROFILE).toBe('public');
    },
  );

  it('retoma cada janela de publicação preservando credenciais e identidade', async () => {
    for (const checkpoint of ['staged', 'prepared', 'environment-published', 'state-published']) {
      const root = await fixture();
      await interruptAt(root, checkpoint);
      const directory = join(root, '.renova');
      const names = await readdir(directory);
      const journal = names.find(
        (name) => name === 'db-setup.pending' || name.startsWith('db-setup-stage-'),
      );
      expect(journal).toBeDefined();
      if (!journal) throw new Error('Estágio ausente');
      const stage = join(directory, journal);
      const stagedEnv = await readFile(join(stage, 'environment.env'), 'utf8');
      const metadataText = await readFile(join(stage, 'metadata.json'), 'utf8');
      const metadata = JSON.parse(metadataText);
      expect((await lstat(join(stage, 'environment.env'))).mode & 0o777).toBe(0o600);
      expect(metadata.environmentSha256).toBe(hash(stagedEnv));
      expect(metadataText.includes('PASSWORD')).toBe(false);
      expect(metadataText.includes('DATABASE_URL')).toBe(false);
      const first = await prepareLocalDatabase(root);
      const second = await prepareLocalDatabase(root);
      expect(
        Object.entries(first.env).some(
          ([name, value]) => name.endsWith('_PASSWORD') && metadataText.includes(value),
        ),
      ).toBe(false);
      expect(first.plan).toEqual(metadata.plan);
      expect(second.plan).toEqual(first.plan);
      expect(hash(JSON.stringify(second.env))).toBe(hash(JSON.stringify(first.env)));
      expect(hash(await readFile(join(root, '.env'), 'utf8'))).toBe(hash(stagedEnv));
      expect((await lstat(join(root, '.env'))).mode & 0o777).toBe(0o600);
      expect((await readLocalDatabase(root)).plan).toEqual(first.plan);
      expect((await readdir(directory)).sort()).toEqual(['db-setup-locks', 'db-state.json']);
    }
  });

  it('recusa env preexistente sem journal e preserva seus bytes', async () => {
    const root = await fixture();
    const original = 'CUSTOM_SETTING=preservar\n';
    await writeFile(join(root, '.env'), original, { mode: 0o600 });
    await expect(prepareLocalDatabase(root)).rejects.toThrow('sem preparação reconhecida');
    expect(hash(await readFile(join(root, '.env'), 'utf8'))).toBe(hash(original));
    expect(await readdir(join(root, '.renova'))).toEqual(['db-setup-locks']);
  });

  it('recusa edição entre tentativas sem publicar estado nem substituir env', async () => {
    const root = await fixture();
    await interruptAt(root, 'environment-published');
    const edited = `${await readFile(join(root, '.env'), 'utf8')}CUSTOM_SETTING=preservar\n`;
    await writeFile(join(root, '.env'), edited);
    await expect(prepareLocalDatabase(root)).rejects.toThrow('foi alterado');
    expect(hash(await readFile(join(root, '.env'), 'utf8'))).toBe(hash(edited));
    await expect(lstat(join(root, '.renova/db-state.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('reconhece apenas o hardlink temporário íntegro da própria preparação', async () => {
    const root = await fixture();
    expect(await isPendingLocalDatabaseEnvironment(root)).toBe(false);
    await interruptAt(root, 'environment-published');
    expect((await lstat(join(root, '.env'))).nlink).toBe(2);
    expect(await isPendingLocalDatabaseEnvironment(root)).toBe(true);
    await prepareLocalDatabase(root);
    expect((await lstat(join(root, '.env'))).nlink).toBe(1);
    expect(await isPendingLocalDatabaseEnvironment(root)).toBe(false);
    const other = await fixture();
    await link(join(root, '.env'), join(other, '.env'));
    expect(await isPendingLocalDatabaseEnvironment(root)).toBe(false);
    expect(await isPendingLocalDatabaseEnvironment(other)).toBe(false);
  });

  it('retoma limpeza interrompida e reconhece somente links pendentes do env e estado', async () => {
    for (const checkpoint of [
      'state-published',
      'completed',
      'environment-retired',
      'state-retired',
      'metadata-retired',
    ]) {
      const root = await fixture();
      await interruptAt(root, checkpoint);
      const before = hash(await readFile(join(root, '.env'), 'utf8'));
      for (const path of ['.env', '.renova/db-state.json']) {
        const pending = (await lstat(join(root, path))).nlink === 2;
        expect(await isPendingLocalDatabaseFile(root, path)).toBe(pending);
      }
      expect(await isPendingLocalDatabaseFile(root, 'renova.project.json')).toBe(false);
      expect(await isPendingLocalDatabaseFile(root, '../.env')).toBe(false);
      await prepareLocalDatabase(root);
      expect(hash(await readFile(join(root, '.env'), 'utf8'))).toBe(before);
      expect((await lstat(join(root, '.env'))).nlink).toBe(1);
      expect((await lstat(join(root, '.renova/db-state.json'))).nlink).toBe(1);
      expect((await readdir(join(root, '.renova'))).sort()).toEqual([
        'db-setup-locks',
        'db-state.json',
      ]);
    }
  });

  it('revalida o estágio imediatamente antes da publicação', async () => {
    const root = await fixture();
    await expect(
      prepareLocalDatabase(root, {
        onCheckpoint: async (step: string) => {
          if (step !== 'prepared') return;
          const envPath = join(root, '.renova/db-setup.pending/environment.env');
          await writeFile(envPath, `${await readFile(envPath, 'utf8')}CUSTOM_SETTING=preservar\n`);
        },
      }),
    ).rejects.toThrow('Estágio local foi alterado');
    await expect(lstat(join(root, '.env'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('recusa journal de outra identidade antes de publicar arquivos', async () => {
    const root = await fixture();
    await interruptAt(root, 'prepared');
    const metadataPath = join(root, '.renova/db-setup.pending/metadata.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    metadata.plan.rootIdentity = '000000000000';
    await writeFile(metadataPath, JSON.stringify(metadata));
    await expect(prepareLocalDatabase(root)).rejects.toThrow('outro projeto ou foi alterado');
    await expect(lstat(join(root, '.env'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('recusa raiz e diretório de estado simbólicos sem sair do projeto', async () => {
    const root = await fixture();
    const other = await fixture();
    const rootLink = join(other, 'project-link');
    await symlink(root, rootLink, 'dir');
    await expect(prepareLocalDatabase(rootLink)).rejects.toThrow('link simbólico recusado');
    await symlink(other, join(root, '.renova'), 'dir');
    await expect(prepareLocalDatabase(root)).rejects.toThrow('link simbólico recusado');
    expect((await readdir(other)).sort()).toEqual(['project-link', 'renova.project.json']);
  });

  it('recusa env e destino de estado simbólicos preservando o arquivo externo', async () => {
    for (const destination of ['.env', '.renova/db-state.json']) {
      const root = await fixture();
      const other = await fixture();
      const outside = join(other, 'untouched');
      await writeFile(outside, 'preservar\n');
      await mkdir(join(root, '.renova'));
      await symlink(outside, join(root, destination));
      await expect(prepareLocalDatabase(root)).rejects.toThrow('link simbólico recusado');
      expect(await readFile(outside, 'utf8')).toBe('preservar\n');
      expect((await lstat(join(root, destination))).isSymbolicLink()).toBe(true);
    }
  });

  it('não mistura credenciais em preparações concorrentes', async () => {
    const root = await fixture();
    let signalPrepared = () => {};
    let continuePreparation = () => {};
    const prepared = new Promise<void>((accept) => {
      signalPrepared = accept;
    });
    const proceed = new Promise<void>((accept) => {
      continuePreparation = accept;
    });
    const firstAttempt = prepareLocalDatabase(root, {
      onCheckpoint: async (checkpoint: string) => {
        if (checkpoint !== 'prepared') return;
        signalPrepared();
        await proceed;
      },
    });
    await prepared;
    try {
      await expect(prepareLocalDatabase(root)).rejects.toThrow('Outra preparação');
    } finally {
      continuePreparation();
    }
    const first = await firstAttempt;
    const resumed = await prepareLocalDatabase(root);
    expect(resumed.plan).toEqual(first.plan);
    expect(hash(JSON.stringify(resumed.env))).toBe(hash(JSON.stringify(first.env)));
    expect(await readdir(join(root, '.renova/db-setup-locks'))).toEqual([]);
  });

  it('retoma automaticamente após processo morto sem trocar credenciais', async () => {
    const root = await fixture();
    const moduleUrl = new URL('../../scripts/db/local.mjs', import.meta.url).href;
    const script = `
      import { prepareLocalDatabase } from ${JSON.stringify(moduleUrl)};
      await prepareLocalDatabase(${JSON.stringify(root)}, {
        onCheckpoint: async (step) => {
          if (step !== 'environment-published') return;
          process.stdout.write('checkpoint-ready\\n');
          await new Promise(() => setInterval(() => {}, 1000));
        },
      });
    `;
    const child = spawn(process.execPath, ['--input-type=module', '--eval', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
    });
    const exited = once(child, 'exit');
    try {
      await new Promise<void>((accept, reject) => {
        child.once('error', reject);
        child.once('exit', () => reject(new Error('Processo encerrou antes do checkpoint')));
        child.stdout.on('data', (chunk) => {
          if (chunk.toString().includes('checkpoint-ready')) accept();
        });
      });
      const originalHash = hash(await readFile(join(root, '.env'), 'utf8'));
      child.kill('SIGKILL');
      await exited;
      expect((await readdir(join(root, '.renova/db-setup-locks'))).length).toBe(1);
      const resumed = await prepareLocalDatabase(root);
      expect(resumed.plan.target).toBe('local');
      expect(hash(await readFile(join(root, '.env'), 'utf8'))).toBe(originalHash);
      expect(await readdir(join(root, '.renova/db-setup-locks'))).toEqual([]);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await exited;
      }
    }
  });

  it('recusa trava inválida e estágio incompleto sem apagar evidência', async () => {
    const root = await fixture();
    const locks = join(root, '.renova/db-setup-locks');
    await mkdir(locks, { recursive: true });
    await mkdir(join(locks, 'unknown-owner'));
    await expect(prepareLocalDatabase(root)).rejects.toThrow('Trava local inválida');
    expect(await readdir(locks)).toEqual(['unknown-owner']);
    await rm(join(locks, 'unknown-owner'), { recursive: true });
    const stage = join(root, '.renova/db-setup-stage-00000000-0000-4000-8000-000000000000');
    await mkdir(stage);
    await writeFile(join(stage, 'metadata.json'), '{}');
    await expect(prepareLocalDatabase(root)).rejects.toThrow('Estágio local incompleto');
    expect(await readdir(stage)).toEqual(['metadata.json']);
    await expect(lstat(join(root, '.env'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
