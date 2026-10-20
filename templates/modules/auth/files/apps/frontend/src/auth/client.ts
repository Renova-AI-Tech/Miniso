export interface AuthSession {
  user: { id: string; name: string; email: string };
  session: { expiresAt: string };
}

/** A sessão fica no cookie HttpOnly; nunca salve tokens no armazenamento do navegador. */
export async function readSession(signal?: AbortSignal): Promise<AuthSession | null> {
  const response = await fetch('/api/auth/get-session', {
    credentials: 'same-origin',
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error('Não foi possível verificar seu acesso. Tente novamente.');
  return response.json();
}

export async function csrfToken() {
  const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Não foi possível conectar. Tente novamente.');
  const body: { token: string } = await response.json();
  return body.token;
}

export async function authPost(path: string, body: object, failureMessage: string) {
  const token = await csrfToken();
  const response = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(failureMessage);
}

export function readableError(error: unknown) {
  return error instanceof Error && !(error instanceof TypeError)
    ? error.message
    : 'Não foi possível conectar. Confira sua conexão e tente novamente.';
}
