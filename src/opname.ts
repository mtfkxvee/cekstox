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
  lokasi_kosong?: number | null;
  itemCount: number;
};

export type CountLine = { id: string; item: string; item_name: string; uom: string; counted: number; method: 'Manual' | 'Scan'; notes?: string };

export type LocState = 'tersedia' | 'terisi' | 'cek' | 'menunggu' | 'divalidasi' | 'ditolak';

export function locState(l: Loc): LocState {
  if (l.docstatus === 2) return 'ditolak';
  if (l.docstatus === 1) {
    if (l.validation_status === 'Divalidasi') return 'divalidasi';
    return l.validation_status === 'Menunggu Validasi' ? 'menunggu' : 'cek';
  }
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
/** Role yang boleh klik Aksi > Cek Ulang (sama dengan API stock_opname_cek_ulang). */
export const OPNAME_ROLE = 'Stock Opname Staff';
/** Role dengan akses stok penuh. User yang hanya punya Stock Opname Staff hanya melihat menu Stok Opname. */
export const canUseStock = () => ['Stock User', 'Stock Manager', 'System Manager'].some((x) => roleCache.roles.includes(x));
export const canCekUlang = () => ['Stock User', OPNAME_ROLE, 'Stock Manager', 'System Manager'].some((x) => roleCache.roles.includes(x));
export const canValidate = () => roleCache.roles.includes('Stock Manager') || roleCache.roles.includes('System Manager');

/**
 * Role Stock Opname Staff tidak punya izin baca doctype Stock Opname, jadi daftar sesinya
 * diturunkan dari Stock Opname Location (sesi yang masih punya lokasi belum divalidasi).
 */
async function listOpnamesFromLocations(): Promise<Opname[]> {
  const r = await request('/api/resource/Stock Opname Location', {
    params: {
      fields: ['stock_opname', 'warehouse', 'count(name) as n'],
      filters: [['docstatus', 'in', [0, 1]], ['validation_status', '!=', 'Divalidasi']],
      group_by: 'stock_opname, warehouse',
      order_by: 'stock_opname desc',
      limit_page_length: 50,
    },
  });
  return r.data.map((x: any) => ({ name: x.stock_opname, warehouse: x.warehouse, opname_date: '', status: 'Berjalan', jumlah_lokasi: x.n, notes: `${x.n} lokasi belum divalidasi`, stock_reconciliation: null }));
}

export async function listOpnames(): Promise<Opname[]> {
  if (!canUseStock()) return listOpnamesFromLocations();
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
  if (!canUseStock()) {
    const r = await request('/api/resource/Stock Opname Location', { params: { fields: ['warehouse'], filters: [['stock_opname', '=', name]], limit_page_length: 1 } });
    return { name, warehouse: r.data[0]?.warehouse ?? name, opname_date: '', status: 'Berjalan', jumlah_lokasi: 0, stock_reconciliation: null };
  }
  const r = await request(`/api/resource/Stock Opname/${encodeURIComponent(name)}`);
  return r.data;
}

/** Semua lokasi milik satu opname. Lokasi yang ditolak & sudah di-amend disembunyikan. */
export async function listLocations(opname: string): Promise<Loc[]> {
  const r = await request('/api/resource/Stock Opname Location', {
    params: {
      fields: ['name', 'lokasi', 'docstatus', 'validation_status', 'rejection_reason', 'amended_from', 'counted_by', 'lokasi_kosong'],
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

/** Isi tabel items (urutan sesuai daftar) lalu submit lokasi. kosong = centang 'Lokasi Kosong' (tanpa item). */
export async function submitLocation(name: string, lines: CountLine[], kosong = false) {
  const put = await request(`/api/resource/Stock Opname Location/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: { lokasi_kosong: kosong ? 1 : 0, items: kosong ? [] : lines.map((l) => ({ item_code: l.item, counted_qty: l.counted, input_method: l.method, notes: l.notes ?? '' })) },
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

export type EditRow = { name?: string; item_code: string; counted_qty: number; input_method: string; notes?: string };

/** Simpan perubahan isi lokasi yang sudah di-submit (tombol Update di web). Boleh sampai status Divalidasi. */
export const updateLocationItems = (name: string, items: EditRow[], kosong = false) =>
  request(`/api/resource/Stock Opname Location/${encodeURIComponent(name)}`, { method: 'PUT', body: { lokasi_kosong: kosong ? 1 : 0, items: kosong ? [] : items } });

/** Aksi > Cek Ulang: Menunggu Cek Ulang -> Menunggu Validasi. */
export const cekUlangLocation = (name: string) => request('/api/method/stock_opname_cek_ulang', { method: 'POST', body: { name } });
export const makeReconciliation = (stock_opname: string) => request('/api/method/stock_opname_buat_reconciliation', { method: 'POST', body: { stock_opname } });
