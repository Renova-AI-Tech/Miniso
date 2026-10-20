import { spawn } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyProject, planProject } from './generate.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (
  args.length &&
  (args.length !== 2 || args[0] !== '--profile' || !['public', 'authenticated'].includes(args[1]))
)
  throw new Error('Use pnpm test:profiles [--profile public|authenticated].');
const profiles = args.length ? [args[1]] : ['public', 'authenticated'];
let child;
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted = true;
    child?.kill(signal);
  });
}
const env = { ...process.env };
for (const name of Object.keys(env)) {
  if (
    /^(?:POSTGRES_|RENOVA_|AUTH_|SMTP_|MAILPIT_|RESEND_|RAILWAY_)/.test(name) ||
    [
      'DATABASE_URL',
      'MIGRATION_DATABASE_URL',
      'HOST',
      'PORT',
      'FRONTEND_URL',
      'PROFILE',
      'NODE_ENV',
      'DEPLOY_TARGET',
      'BOOTSTRAP_DATABASE_URL',
    ].includes(name)
  )
    delete env[name];
}
async function command(command, args, cwd, capture = false) {
  if (interrupted) throw new Error('Validation interrupted');
  let output = '';
  await new Promise((accept, reject) => {
    child = spawn(command, args, {
      cwd,
      env,
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    });
    if (capture)
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? accept() : reject(new Error('Profile command failed')),
    );
  });
  return output;
}

let work;
try {
  const paths = (
    await command(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      root,
      true,
    )
  )
    .split('\0')
    .filter(Boolean);
  work = await mkdtemp(join(tmpdir(), 'renova-profiles-'));
  for (const profile of profiles) {
    process.stdout.write(`Validando projeto independente: ${profile}\n`);
    const destination = join(work, profile);
    await mkdir(destination);
    for (const path of paths) {
      // Git's inventory excludes env, caches and generated output; deletions in WIP are respected.
      try {
        await lstat(join(root, path));
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      await mkdir(dirname(join(destination, path)), { recursive: true });
      await cp(join(root, path), join(destination, path), { verbatimSymlinks: true });
    }
    await command('git', ['init', '--quiet'], destination);
    const current = JSON.parse(await readFile(join(destination, 'renova.project.json'), 'utf8'));
    const config = {
      ...current,
      project: { slug: `profile-${profile}`, displayName: `Ensaio ${profile}` },
      profile,
      capabilities: profile === 'authenticated' ? ['auth'] : [],
    };
    await applyProject(await planProject(destination, config));
    await command('pnpm', ['install', '--frozen-lockfile'], destination);
    try {
      await command('pnpm', ['check:full'], destination);
      await command('pnpm', ['test:containers'], destination);
    } finally {
      for (const path of ['test-results', 'playwright-report']) {
        try {
          await cp(join(destination, path), join(root, 'test-results', 'profiles', profile, path), {
            recursive: true,
          });
        } catch (error) {
          if (error.code !== 'ENOENT') {
            process.stderr.write('Não foi possível copiar os artefatos do navegador.\n');
            process.exitCode = 1;
          }
        }
      }
    }
  }
} catch {
  process.stderr.write(
    'A validação dos perfis falhou. Confira o gate acima; nenhum ambiente local existente foi alterado.\n',
  );
  process.exitCode = 1;
} finally {
  if (work) await rm(work, { recursive: true, force: true });
}
