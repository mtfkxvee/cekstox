import AsyncStorage from '@react-native-async-storage/async-storage';
import { request } from './api';
import { loadTransferRules } from './transferRules';

// Akun pajak yang dipaksa oleh client script "PR DEFAULT" di XERP
const TAX_ACCOUNT_HEAD = '2115.000 - Stock diterima tapi tidak di tagih (PAJAK) - X';
export const PAGE = 30;

export type PORow = {
  name: string;
  supplier_name: string | null;
  transaction_date: string;
  schedule_date: string | null;
  set_warehouse: string | null;
  per_received: number;
  status: string;
};

export type POItem = { name: string; item_code: string; item_name: string; uom: string; qty: number; received_qty: number; rate: number };
export type PODoc = { name: string; supplier: string; supplier_name: string | null; set_warehouse: string | null; status: string; items: POItem[] };

export type ReceiveLine = { item: string; item_name: string; uom: string; qty: number; poQty: number; done: number; rate: number };

/** Gudang default user (outlet); kosong = tidak ada pembatasan. */
export async function getDefaultWarehouse(): Promise<string> {
  return (await loadTransferRules()).defaultFrom;
}

/** PO submitted yang barangnya belum diterima penuh, untuk gudang default user. */
export async function listPOs(warehouse: string, q: string, start: number): Promise<PORow[]> {
  const filters: unknown[] = [['docstatus', '=', 1], ['status', 'in', ['To Receive', 'To Receive and Bill']], ['per_received', '<', 100]];
  if (warehouse) filters.push(['set_warehouse', '=', warehouse]);
  const params: Record<string, unknown> = {
    fields: ['name', 'supplier_name', 'transaction_date', 'schedule_date', 'set_warehouse', 'per_received', 'status'],
    filters,
    order_by: 'transaction_date desc, creation desc',
    limit_start: start,
    limit_page_length: PAGE,
  };
  const t = q.trim();
  if (t)
    params.or_filters = [
      ['name', 'like', `%${t}%`],
      ['supplier_name', 'like', `%${t}%`],
    ];
  return (await request('/api/resource/Purchase Order', { params })).data;
}

export async function getPO(name: string): Promise<PODoc> {
  const d = (await request(`/api/resource/Purchase Order/${encodeURIComponent(name)}`)).data;
  return {
    name: d.name,
    supplier: d.supplier,
    supplier_name: d.supplier_name,
    set_warehouse: d.set_warehouse,
    status: d.status,
    items: d.items.map((i: any) => ({ name: i.name, item_code: i.item_code, item_name: i.item_name, uom: i.uom, qty: i.qty, received_qty: i.received_qty ?? 0, rate: i.rate })),
  };
}

/**
 * Buat Purchase Receipt (Draft) dari PO memakai fungsi bawaan ERPNext, hanya berisi item yang discan.
 * Aturan client script "PR DEFAULT": cost center header dipakai semua item & pajak, pajak dipaksa kategori/akun tertentu.
 */
export async function createReceipt(po: string, lines: ReceiveLine[]): Promise<string> {
  const m = (await request('/api/method/erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt', { params: { source_name: po } })).message;
  const byItem = new Map<string, any[]>();
  for (const r of m.items) byItem.set(r.item_code, [...(byItem.get(r.item_code) ?? []), r]);

  const items: any[] = [];
  for (const l of lines) {
    const rows = byItem.get(l.item);
    if (!rows) throw new Error(`Item ${l.item} tidak ada lagi di sisa PO ${po} (sudah diterima penuh?)`);
    let left = l.qty;
    rows.forEach((r, i) => {
      const take = i === rows.length - 1 ? left : Math.min(left, r.qty);
      if (take > 0) {
        items.push({ ...r, qty: take, received_qty: take, stock_qty: take * (r.conversion_factor || 1) });
        left -= take;
      }
    });
  }

  const doc: any = {};
  for (const [k, v] of Object.entries(m)) if (!k.startsWith('__')) doc[k] = v;
  doc.docstatus = 0;
  doc.items = items.map((r, i) => {
    const row: any = {};
    for (const [k, v] of Object.entries(r)) if (!k.startsWith('__') && k !== 'name') row[k] = v;
    row.idx = i + 1;
    if (doc.cost_center) row.cost_center = doc.cost_center;
    return row;
  });
  doc.taxes = (doc.taxes ?? []).map((t: any) => {
    const row: any = {};
    for (const [k, v] of Object.entries(t)) if (!k.startsWith('__') && k !== 'name') row[k] = v;
    row.category = 'Valuation and Total';
    row.account_head = TAX_ACCOUNT_HEAD;
    if (doc.cost_center) row.cost_center = doc.cost_center;
    return row;
  });

  return (await request('/api/resource/Purchase Receipt', { method: 'POST', body: doc })).data.name;
}

const key = (po: string) => `receive:${po}`;
export async function loadReceiveDraft(po: string): Promise<ReceiveLine[]> {
  try {
    const s = await AsyncStorage.getItem(key(po));
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}
export const saveReceiveDraft = (po: string, l: ReceiveLine[]) => AsyncStorage.setItem(key(po), JSON.stringify(l));
export const clearReceiveDraft = (po: string) => AsyncStorage.removeItem(key(po));
