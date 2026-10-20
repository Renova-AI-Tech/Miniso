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
]);
