import { fileURLToPath } from 'node:url';
import { readLocalDatabase } from '../db/local.mjs';
import { createAuthService } from '../../packages/auth/src/index.ts';
import { parseEnv } from '../../apps/backend/src/env.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
let auth;
try {
  const args = process.argv.slice(2).filter((arg, index) => index !== 0 || arg !== '--');
  const [email, name, ...extra] = args;
  if (!email || !name || extra.length)
    throw new Error('Use pnpm auth:invite -- email "Nome da pessoa".');
  const { env } = await readLocalDatabase(root);
  const settings = parseEnv(env);
  auth = createAuthService(settings, {
    onEvent(event) {
      if (event === 'email_failed')
        process.stderr.write(
          'A entrega local falhou. Execute pnpm run doctor e tente novamente; a conta continua pendente.\n',
        );
    },
  });
  const result = await auth.invite(email, name);
  if (result.delivery === 'failed') process.exitCode = 1;
  else
    process.stdout.write(
      'Solicitação concluída. Consulte a caixa de email local indicada por pnpm run doctor. Nenhuma senha foi enviada.\n',
    );
} catch (error) {
  process.stderr.write(
    error instanceof Error && /^Informe|^Use |^Aguarde|^Conta já/.test(error.message)
      ? `${error.message}\n`
      : 'Não foi possível liberar o acesso. Execute pnpm run doctor; nenhum segredo foi exibido.\n',
  );
  process.exitCode = 1;
} finally {
  await auth?.close();
}
