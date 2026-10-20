import { readFileSync } from 'node:fs';
import { defineRailway, preserve, project, service } from 'railway/iac';

// Manage only the application; a plan cannot remove the database or its volume.
export const partial = 'renova-app';
export default defineRailway((ctx) => {
  if (
    ctx.projectId !== process.env.RENOVA_DEPLOY_PROJECT_ID ||
    ctx.environmentId !== process.env.RENOVA_DEPLOY_ENVIRONMENT_ID
  )
    throw new Error('Destino explícito obrigatório. Use pnpm deploy:prepare.');
  const profile = JSON.parse(
    readFileSync(new URL('../renova.project.json', import.meta.url), 'utf8'),
  ).profile;
  if (!['public', 'authenticated'].includes(profile)) throw new Error('Perfil inválido.');
  const app = service('app', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 3 },
    start: 'sh scripts/deploy/start.sh',
    preDeploy: 'node scripts/deploy/predeploy.mjs',
    healthcheck: '/ready',
    healthcheckTimeout: 120,
    replicas: 1,
    env: {
      NODE_ENV: 'production',
      DEPLOY_TARGET: 'railway',
      HOST: '::',
      PORT: '8080',
      DATABASE_URL: preserve(),
      MIGRATION_DATABASE_URL: preserve(),
      FRONTEND_URL: preserve(),
      RENOVA_DB_PROJECT_ID: preserve(),
      RENOVA_DB_ENVIRONMENT_ID: preserve(),
      RENOVA_DB_NAME: preserve(),
      ...(profile === 'authenticated'
        ? { AUTH_SECRET: preserve(), RESEND_API_KEY: preserve(), AUTH_EMAIL_FROM: preserve() }
        : {}),
    },
  });
  return project(ctx.projectName, { resources: [app] });
});
