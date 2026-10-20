import type { Generated } from 'kysely';

/** Contrato da migration 001; validado contra o schema real pelos testes de integração. */
export interface PublicExampleRecord {
  id: string;
  title: string;
  description: string;
  created_at: Generated<Date>;
}

export interface OwnedRecord {
  id: string;
  owner_id: string;
  title: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Database {
  owned_records: OwnedRecord;
  public_example_records: PublicExampleRecord;
}
