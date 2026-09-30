import { request } from './api';
import { loadTransferRules } from './transferRules';

export const TRANSFER_TYPE = 'PINDAH STOK';
export const PAGE = 30;

export type HistoryRow = {
  name: string;
  posting_date: string;
  posting_time: string;
  from_warehouse: string | null;
  to_warehouse: string | null;
  docstatus: 0 | 1 | 2;
  owner: string;
};

export type HistoryScope = { warehouse: string; user: string };

/** Gudang default user (outlet). Kalau user tidak punya outlet, riwayat dibatasi ke entri miliknya sendiri. */
export async function getHistoryScope(): Promise<HistoryScope> {
  const [rules, who] = await Promise.all([loadTransferRules(), request('/api/method/frappe.auth.get_logged_user')]);
  return { warehouse: rules.defaultFrom, user: who.message };
}

/** Stock Entry bertipe PINDAH STOK yang gudang asal/tujuannya = gudang default user. */
export async function listHistory(scope: HistoryScope, start: number): Promise<HistoryRow[]> {
  const params: Record<string, unknown> = {
    fields: ['name', 'posting_date', 'posting_time', 'from_warehouse', 'to_warehouse', 'docstatus', 'owner'],
    filters: [['stock_entry_type', '=', TRANSFER_TYPE], ...(scope.warehouse ? [] : [['owner', '=', scope.user]])],
    order_by: 'posting_date desc, posting_time desc, creation desc',
    limit_start: start,
    limit_page_length: PAGE,
  };
  if (scope.warehouse)
    params.or_filters = [
      ['from_warehouse', '=', scope.warehouse],
      ['to_warehouse', '=', scope.warehouse],
    ];
  const r = await request('/api/resource/Stock Entry', { params });
  return r.data;
}

export async function getEntry(name: string): Promise<any> {
  const r = await request(`/api/resource/Stock Entry/${encodeURIComponent(name)}`);
  return r.data;
}

/** Batalkan Stock Entry yang sudah submit. Server menolak kalau stok item sudah bergerak di transaksi sesudahnya. */
export const cancelEntry = (name: string) => request('/api/method/frappe.client.cancel', { method: 'POST', body: { doctype: 'Stock Entry', name } });
