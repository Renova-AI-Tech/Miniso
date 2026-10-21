import { spawn, type ChildProcess } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

export interface LinxSyncRequest {
  daysBack: number;
  profile: 'dashboard' | 'full';
}

export interface LinxSyncResult {
  accepted: true;
  profile: LinxSyncRequest['profile'];
  daysBack: number;
}

export interface LinxSyncRunner {
  start(request: LinxSyncRequest): Promise<LinxSyncResult>;
  isRunning(): boolean;
}

export function createLinxSyncRunner(
  root = process.cwd(),
  migrationDatabaseUrl?: string,
  credentialsConfigured = false,
): LinxSyncRunner {
  let child: ChildProcess | undefined;

  return {
    async start(request) {
      if (child && child.exitCode === null && !child.killed) {
        throw new Error('Uma coleta Linx já está em execução.');
      }
      if (!migrationDatabaseUrl) {
        throw new Error('MIGRATION_DATABASE_URL não está configurada para a coleta.');
      }
      if (!credentialsConfigured) {
        throw new Error(
          'Credenciais Linx não estão configuradas. Preencha LINX_USER, LINX_PASSWORD, LINX_KEY e LINX_PORTAL no .env.',
        );
      }
      const script = join(root, 'scripts', 'linx', 'sync.mjs');
      await access(script);
      child = spawn(
        process.execPath,
        [script, '--days-back', String(request.daysBack), '--profile', request.profile],
        { cwd: root, stdio: 'ignore', windowsHide: true },
      );
      child.once('exit', () => {
        child = undefined;
      });
      child.once('error', () => {
        child = undefined;
      });
      return { accepted: true, profile: request.profile, daysBack: request.daysBack };
    },
    isRunning() {
      return child !== undefined && child.exitCode === null && !child.killed;
    },
  };
}
