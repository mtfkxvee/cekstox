import { request } from './api';

export type Opname = { name: string; warehouse: string; opname_date: string; status: string; jumlah_lokasi: number; notes?: string; stock_reconciliation?: string | null };

export type Loc = {
  name: string;
  lokasi: string;
  docstatus: 0 | 1 | 2;
  validation_status?: string | null;
  rejection_reason?: string | null;
  amended_from?: string | null;
  counted_by?: string | null;
  itemCount: number;
};

export type CountLine = { item: string; item_name: string; uom: string; counted: number; method: 'Manual' | 'Scan' };

export type LocState = 'tersedia' | 'terisi' | 'menunggu' | 'divalidasi' | 'ditolak';

export function locState(l: Loc): LocState {
  if (l.docstatus === 2) return 'ditolak';
  if (l.docstatus === 1) return l.validation_status === 'Divalidasi' ? 'divalidasi' : 'menunggu';
  return l.itemCount > 0 ? 'terisi' : 'tersedia';
}

const roleCache: { roles: string[] } = { roles: [] };
export async function loadRoles(user: string) {
  try {
    const r = await request('/api/method/frappe.core.doctype.user.user.get_roles', { params: { uid: user } });
    roleCache.roles = r.message ?? [];
  } catch {
    roleCache.roles = [];
  }
}
/** Role yang boleh membatalkan Stock Entry (mengikuti permission doctype Stock Entry). */
export const canCancelEntry = () => ['Stock Manager', 'System Manager', 'Manufacturing Manager', 'Manufacturing User'].some((x) => roleCache.roles.includes(x));
export const canValidate = () => roleCache.roles.includes('Stock Manager') || roleCache.roles.includes('System Manager');

export async function listOpnames(): Promise<Opname[]> {
  const r = await request('/api/resource/Stock Opname', {
    params: {
      fields: ['name', 'warehouse', 'opname_date', 'status', 'jumlah_lokasi', 'notes', 'stock_reconciliation'],
      filters: [['docstatus', '=', 1], ['status', '!=', 'Selesai']],
      order_by: 'opname_date desc, creation desc',
      limit_page_length: 50,
    },
  });
  return r.data;
}

export async function getOpname(name: string): Promise<Opname> {
  const r = await request(`/api/resource/Stock Opname/${encodeURIComponent(name)}`);
  return r.data;
}

/** Semua lokasi milik satu opname. Lokasi yang ditolak & sudah di-amend disembunyikan. */
export async function listLocations(opname: string): Promise<Loc[]> {
  const r = await request('/api/resource/Stock Opname Location', {
    params: {
      fields: ['name', 'lokasi', 'docstatus', 'validation_status', 'rejection_reason', 'amended_from', 'counted_by'],
      filters: [['stock_opname', '=', opname]],
      order_by: 'lokasi asc, creation asc',
      limit_page_length: 500,
    },
  });
  const rows: Omit<Loc, 'itemCount'>[] = r.data;
  const names = rows.map((x) => x.name);
  const counts: Record<string, number> = {};
  if (names.length) {
    const c = await request('/api/resource/Stock Opname Location Item', {
      params: {
        parent: 'Stock Opname Location',
        fields: ['parent', 'count(name) as n'],
        filters: [['parent', 'in', names]],
        group_by: 'parent',
        limit_page_length: 500,
      },
    });
    for (const x of c.data) counts[x.parent] = x.n;
  }
  const amended = new Set(rows.map((x) => x.amended_from).filter(Boolean));
  const naturalSort = (a: Loc, b: Loc) => a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true });
  return rows
    .filter((x) => !(x.docstatus === 2 && amended.has(x.name)))
    .map((x) => ({ ...x, itemCount: counts[x.name] ?? 0 }))
    .sort(naturalSort);
}

export async function getLocation(name: string): Promise<any> {
  const r = await request(`/api/resource/Stock Opname Location/${encodeURIComponent(name)}`);
  return r.data;
}

/** Isi tabel items lalu submit lokasi. */
export async function submitLocation(name: string, lines: CountLine[]) {
  const put = await request(`/api/resource/Stock Opname Location/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: { items: lines.map((l) => ({ item_code: l.item, counted_qty: l.counted, input_method: l.method })) },
  });
  await request('/api/method/frappe.client.submit', { method: 'POST', body: { doc: put.data } });
}

/** Lokasi yang ditolak (Cancelled) di-amend jadi dokumen baru untuk dihitung ulang. */
export async function amendLocation(old: string): Promise<string> {
  const d = await getLocation(old);
  const r = await request('/api/resource/Stock Opname Location', {
    method: 'POST',
    body: { doctype: 'Stock Opname Location', stock_opname: d.stock_opname, warehouse: d.warehouse, lokasi: d.lokasi, company: d.company, amended_from: old, items: [] },
  });
  return r.data.name;
}

export const validateLocation = (name: string) => request('/api/method/stock_opname_validasi_lokasi', { method: 'POST', body: { name } });
export const rejectLocation = (name: string, alasan: string) => request('/api/method/stock_opname_tolak_lokasi', { method: 'POST', body: { name, alasan } });
export const makeReconciliation = (stock_opname: string) => request('/api/method/stock_opname_buat_reconciliation', { method: 'POST', body: { stock_opname } });
