import type { Generated } from 'kysely';

/** Contrato da migration 001; validado contra o schema real pelos testes de integração. */
export interface PublicExampleRecord {
  id: string;
  title: string;
  description: string;
  created_at: Generated<Date>;
}

export interface Database {
  public_example_records: PublicExampleRecord;
}
