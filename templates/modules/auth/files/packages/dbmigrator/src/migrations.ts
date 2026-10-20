export interface Migration {
  readonly id: string;
  readonly sql: string;
}

export const migrations: readonly Migration[] = Object.freeze([
  Object.freeze({
    id: '001_public_example',
    sql: `
CREATE TABLE public.public_example_records (
  id text PRIMARY KEY,
  title varchar(120) NOT NULL CHECK (length(title) > 0),
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO public.public_example_records (id, title, description, created_at) VALUES
  ('01-primeiro-projeto', 'Seu primeiro projeto', 'Exemplo sintético e público. Substitua pelo conteúdo da sua aplicação.', '2026-01-01T00:00:00Z'),
  ('02-design-system', 'Design system Renova', 'Componentes e identidade visual já fazem parte deste repositório.', '2026-01-01T00:00:00Z'),
  ('03-proximo-passo', 'Desenvolva sua ideia', 'O frontend consulta esta lista no Postgres por uma API somente leitura.', '2026-01-01T00:00:00Z');
GRANT SELECT ON public.public_example_records TO renova_runtime;
`,
  }),
  Object.freeze({
    id: '002_optional_auth',
    sql: `
CREATE TABLE public.auth_user (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false, image text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public.auth_session (
  id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamptz NOT NULL,
  "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES public.auth_user(id) ON DELETE CASCADE
);
CREATE INDEX auth_session_user ON public.auth_session("userId");
CREATE TABLE public.auth_account (
  id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES public.auth_user(id) ON DELETE CASCADE,
  "accessToken" text, "refreshToken" text, "idToken" text,
  "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text, password text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamptz NOT NULL,
  UNIQUE ("providerId", "accountId")
);
CREATE INDEX auth_account_user ON public.auth_account("userId");
CREATE TABLE public.auth_verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX auth_verification_identifier ON public.auth_verification(identifier);
CREATE TABLE public.auth_rate_limit (id text PRIMARY KEY, key text NOT NULL UNIQUE, count integer NOT NULL, "lastRequest" bigint NOT NULL);
CREATE TABLE public.auth_account_limits (key text PRIMARY KEY, count integer NOT NULL CHECK (count > 0), window_start timestamptz NOT NULL);
CREATE INDEX auth_account_limits_expiry ON public.auth_account_limits(window_start);
CREATE TABLE public.owned_records (
  id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES public.auth_user(id) ON DELETE CASCADE,
  title varchar(120) NOT NULL CHECK (length(btrim(title)) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX owned_records_owner ON public.owned_records(owner_id, id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_user, public.auth_session, public.auth_account, public.auth_verification, public.auth_rate_limit, public.auth_account_limits, public.owned_records TO renova_runtime;
`,
  }),
]);
