import type { Database } from '@renova/db-types';
import type { Kysely } from 'kysely';

export interface PublicExample {
  id: string;
  title: string;
  description: string;
}

export interface ExampleListInput {
  limit: number;
  cursor?: string | undefined;
}

export interface ExamplePage {
  items: PublicExample[];
  nextCursor: string | null;
}

export interface ExampleRepository {
  list(input: ExampleListInput): Promise<ExamplePage>;
}

export function createExampleRepository(database: Kysely<Database>): ExampleRepository {
  return {
    async list({ limit, cursor }) {
      let query = database
        .withSchema('public')
        .selectFrom('public_example_records')
        .select(['id', 'title', 'description'])
        .orderBy('id', 'asc')
        .limit(limit + 1);
      if (cursor) query = query.where('id', '>', cursor);
      const rows = await query.execute();
      const items = rows.slice(0, limit);
      return {
        items,
        nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
      };
    },
  };
}
