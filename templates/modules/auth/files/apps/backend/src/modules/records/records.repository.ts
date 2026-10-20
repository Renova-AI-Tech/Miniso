import { randomUUID } from 'node:crypto';
import type { Database } from '@renova/db-types';
import type { Kysely, Selectable } from 'kysely';
import type { OwnedRecord } from '@renova/db-types';
const fields = ['id', 'title', 'created_at', 'updated_at'] as const;
function publicRecord(row: Pick<Selectable<OwnedRecord>, (typeof fields)[number]>) {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
export function createRecordsRepository(database: Kysely<Database>) {
  return {
    async list(ownerId: string, input: { limit: number; cursor?: string | undefined }) {
      let query = database
        .selectFrom('owned_records')
        .select(fields)
        .where('owner_id', '=', ownerId);
      if (input.cursor) query = query.where('id', '>', input.cursor);
      const rows = await query
        .orderBy('id', 'asc')
        .limit(input.limit + 1)
        .execute();
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(publicRecord),
        nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
    async create(ownerId: string, title: string) {
      const row = await database
        .insertInto('owned_records')
        .values({ id: randomUUID(), owner_id: ownerId, title })
        .returning(fields)
        .executeTakeFirstOrThrow();
      return publicRecord(row);
    },
    async update(ownerId: string, id: string, title: string) {
      const row = await database
        .updateTable('owned_records')
        .set({ title, updated_at: new Date() })
        .where('owner_id', '=', ownerId)
        .where('id', '=', id)
        .returning(fields)
        .executeTakeFirst();
      return row ? publicRecord(row) : null;
    },
  };
}
export type RecordsRepository = ReturnType<typeof createRecordsRepository>;
