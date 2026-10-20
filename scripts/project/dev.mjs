import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile('.env');
  } catch {
    process.stderr.write('Ambiente local ausente. Execute pnpm run setup.\n');
    process.exit(1);
  }
}
const groups = new Set();
let stopping = false;
let shutdownPoll;
let shutdownDeadline;

function signalGroups(signal) {
  for (const group of groups) {
    try {
      process.kill(-group, signal);
    } catch (error) {
      if (error.code === 'ESRCH') groups.delete(group);
    }
  }
}

function collectExitedGroups() {
  signalGroups(0);
  if (groups.size === 0) {
    clearInterval(shutdownPoll);
    clearTimeout(shutdownDeadline);
  }
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  // Um wrapper pode sair antes dos seus descendentes; o grupo continua sendo nosso.
  signalGroups('SIGTERM');
  if (groups.size === 0) return;
  shutdownPoll = setInterval(collectExitedGroups, 50);
  // Termina antes dos 5 s concedidos pelo runner de navegador.
  shutdownDeadline = setTimeout(() => {
    signalGroups('SIGKILL');
    clearInterval(shutdownPoll);
  }, 4000);
}
for (const name of ['@renova/backend', '@renova/frontend']) {
  const child = spawn('pnpm', ['--filter', name, 'dev'], {
    stdio: 'inherit',
    detached: true,
    env: process.env,
  });
  if (child.pid) groups.add(child.pid);
  child.on('error', () => stop(1));
  child.on('exit', (code, signal) => {
    if (!stopping) stop(code ?? (signal ? 1 : 0));
    collectExitedGroups();
  });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
