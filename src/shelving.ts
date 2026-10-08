import { request } from './api';

export type Shelf = { name: string; label: string; priority: number; isDefault: boolean };
export type ShelfStock = { shelving: string; qty: number };

/** "G70-BISK-R3 - G70-BISK - X" -> "G70-BISK-R3" (cadangan bila daftar rak belum dimuat) */
export const shelfLabelOf = (name: string) => name.split(' - ')[0];

const cache = new Map<string, Shelf[]>();

/** Rak aktif milik satu gudang, urut prioritas (rak default "BELUM DITATA" paling akhir). */
export async function listShelves(warehouse: string): Promise<Shelf[]> {
  const hit = cache.get(warehouse);
  if (hit) return hit;
  const r = await request('/api/resource/Shelving', {
    params: {
      fields: ['name', 'shelving_name', 'priority', 'is_default'],
      filters: [['warehouse', '=', warehouse], ['disabled', '=', 0]],
      order_by: 'priority asc, shelving_name asc',
      limit_page_length: 500,
    },
  });
  const list: Shelf[] = r.data.map((x: any) => ({ name: x.name, label: x.shelving_name, priority: x.priority, isDefault: !!x.is_default }));
  cache.set(warehouse, list);
  return list;
}

/** Stok satu item per rak di satu gudang (hanya yang qty-nya lebih dari 0). */
export async function itemShelfStocks(item: string, warehouse: string): Promise<ShelfStock[]> {
  const r = await request('/api/resource/Shelving Bin', {
    params: { fields: ['shelving', 'actual_qty'], filters: [['item_code', '=', item], ['warehouse', '=', warehouse]], limit_page_length: 200 },
  });
  return r.data.filter((x: any) => x.actual_qty > 0).map((x: any) => ({ shelving: x.shelving, qty: x.actual_qty }));
}

export type ShelvingTransferType = 'Put-away' | 'Pindah Shelving' | 'Keluarkan dari Shelving';
export type ShelvingLine = { item: string; qty: number; from?: string | null; to?: string | null };

const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Shelving Transfer: dibuat lalu di-submit. Kalau submit gagal, draft tetap ada di XERP. */
export async function createShelvingTransfer(type: ShelvingTransferType, warehouse: string, lines: ShelvingLine[]): Promise<string> {
  const r = await request('/api/resource/Shelving Transfer', {
    method: 'POST',
    body: {
      doctype: 'Shelving Transfer',
      transfer_type: type,
      warehouse,
      posting_date: today(),
      items: lines.map((l) => ({ item_code: l.item, qty: l.qty, ...(l.from ? { from_shelving: l.from } : {}), ...(l.to ? { to_shelving: l.to } : {}) })),
    },
  });
  try {
    await request('/api/method/frappe.client.submit', { method: 'POST', body: { doc: r.data } });
  } catch (e: any) {
    throw new Error(`Draft ${r.data.name} sudah dibuat tapi gagal di-submit: ${e.message}`);
  }
  return r.data.name;
}

/** Stok satu item per rak di SEMUA gudang, dikelompokkan per gudang (untuk layar Cek Stok). */
export async function itemShelfStocksAll(item: string): Promise<Record<string, ShelfStock[]>> {
  const r = await request('/api/resource/Shelving Bin', {
    params: { fields: ['shelving', 'warehouse', 'actual_qty'], filters: [['item_code', '=', item]], order_by: 'actual_qty desc', limit_page_length: 500 },
  });
  const out: Record<string, ShelfStock[]> = {};
  for (const x of r.data) if (x.actual_qty !== 0) (out[x.warehouse] ??= []).push({ shelving: x.shelving, qty: x.actual_qty });
  return out;
}
