import { isIP } from 'node:net';
import type { FastifyRequest } from 'fastify';
import type { BackendEnv } from '../env.js';

/** The Railway deployment contract uses X-Real-IP from its HTTPS edge; other forwarding headers are untrusted. */
export function clientIp(env: BackendEnv, request: Pick<FastifyRequest, 'headers' | 'ip'>): string {
  const forwarded = request.headers['x-real-ip'];
  if (
    env.NODE_ENV === 'production' &&
    env.DEPLOY_TARGET === 'railway' &&
    env.RAILWAY_PROJECT_ID &&
    env.RAILWAY_ENVIRONMENT_ID &&
    env.RAILWAY_SERVICE_ID &&
    typeof forwarded === 'string' &&
    !forwarded.includes('%') &&
    isIP(forwarded) !== 0
  ) {
    return forwarded;
  }
  return request.ip;
}
