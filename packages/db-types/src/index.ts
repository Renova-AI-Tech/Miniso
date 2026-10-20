import type { Generated } from 'kysely';

/** Read model exposed to the application. Writes stay in the collector. */
export interface StoreRecord {
  portal: number;
  company_cnpj: string;
  company_code: number | null;
  legal_name: string | null;
  trade_name: string | null;
  active: boolean | null;
  raw_payload: unknown;
  updated_at: Generated<Date>;
}

export interface ProductRecord {
  portal: number;
  product_code: number;
  barcode: string | null;
  reference: string | null;
  name: string | null;
  basic_description: string | null;
  brand_name: string | null;
  line_name: string | null;
  sector_name: string | null;
  supplier_code: number | null;
  supplier_name: string | null;
  classification_name: string | null;
  category_name: string | null;
  class_name: string | null;
  subclass_name: string | null;
  origin_name: string | null;
  disabled: boolean | null;
  raw_payload: unknown;
  updated_at: Generated<Date>;
}

export interface SupplierRecord {
  portal: number;
  supplier_code: number;
  document: string | null;
  name: string | null;
  legal_name: string | null;
  active: boolean | null;
  raw_payload: unknown;
  updated_at: Generated<Date>;
}

export interface DailySalesRecord {
  portal: number;
  company_cnpj: string;
  store_name: string | null;
  document_date: Date;
  product_code: number;
  product_name: string | null;
  supplier_code: number | null;
  supplier_name: string | null;
  classification_name: string | null;
  category_name: string | null;
  class_name: string | null;
  subclass_name: string | null;
  origin_name: string | null;
  net_quantity: string;
  net_revenue: string;
  cost_value: string;
  gross_margin: string;
}

export interface InventorySnapshotRecord {
  portal: number;
  company_cnpj: string;
  product_code: number;
  snapshot_date: Date;
  quantity: string | null;
  average_cost: string | null;
  total_cost: string | null;
  cost_price: string | null;
  sale_price: string | null;
  location: string | null;
}

export interface CollectionRunRecord {
  id: Generated<number>;
  method: string;
  company_cnpj: string | null;
  window_start: Date | null;
  window_end: Date | null;
  status: 'running' | 'succeeded' | 'failed';
  pages: number;
  records_received: number;
  records_inserted: number;
  started_at: Generated<Date>;
  finished_at: Date | null;
  error_message: string | null;
}

export interface CollectionChangeRecord {
  id: Generated<number>;
  collection_run_id: number | null;
  table_name: string;
  record_key: string;
  change_type: 'insert' | 'update';
  previous_hash: string | null;
  current_hash: string;
  changed_at: Generated<Date>;
}

export interface Database {
  'analytics.store': StoreRecord;
  'analytics.product': ProductRecord;
  'analytics.supplier': SupplierRecord;
  'analytics.inventory_snapshot': InventorySnapshotRecord;
  'analytics.daily_sales': DailySalesRecord;
  'replica.collection_run': CollectionRunRecord;
  'replica.collection_change': CollectionChangeRecord;
}
