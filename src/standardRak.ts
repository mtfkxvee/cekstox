import { request } from './api';

export type RakSummary = { name: string; kode: string; area: string; kategori: string; nomor: number; jumlah_rak: number; total_item: number };
/** Satu tingkat (baris "Rak") di Standard Rak, mis. rak_no 3 = E1-BEAU-R3. */
export type RakLevel = { name?: string; rak_no: number; kode_rak: string; catatan: string };
/** key = id baris lokal; name = id baris di XERP (kosong untuk baris baru). */
export type RakItem = { key: string; name?: string; rak_no: number; item_code: string; item_name: string; qty: number; uom: string; catatan: string };
export type StandardRak = RakSummary & { outlet: string; modified: string; racks: RakLevel[]; items: RakItem[] };
export type OutletOpt = { name: string; label: string };
export type ItemSpot = { rak: string; kode: string; rak_no: number; qty: number };

let seq = 0;
export const newKey = () => `n${Date.now()}-${++seq}`;
export const levelCode = (kode: string, n: number) => `${kode}-R${n}`;

/** Outlet milik user login (User.outlet), null bila tidak diisi. */
export async function myOutlet(): Promise<string | null> {
  try {
    const who = (await request('/api/method/frappe.auth.get_logged_user')).message as string;
    const u = await request('/api/method/frappe.client.get_value', { params: { doctype: 'User', filters: { name: who }, fieldname: 'outlet' } });
    return u.message?.outlet ?? null;
  } catch {
    return null;
  }
}

/** Outlet yang sudah punya Standard Rak, berlabel nama outlet (kalau user boleh membaca Outlet). */
export async function listOutlets(): Promise<OutletOpt[]> {
  const r = await request('/api/resource/Standard Rak', {
    params: { fields: ['outlet'], filters: [['outlet', 'is', 'set']], group_by: 'outlet', order_by: 'outlet asc', limit_page_length: 200 },
  });
  const names: string[] = r.data.map((x: any) => x.outlet);
  if (!names.length) return [];
  const o = await request('/api/resource/Outlet', {
    params: { fields: ['name', 'nama'], filters: [['name', 'in', names]], limit_page_length: names.length },
  }).catch(() => ({ data: [] }));
  const nama = new Map<string, string>(o.data.map((x: any) => [x.name, x.nama]));
  return names.map((n) => ({ name: n, label: nama.get(n) ? `${n} · ${nama.get(n)}` : n }));
}

/** Semua Standard Rak aktif di satu outlet, urut area lalu nomor. */
export async function listStandardRak(outlet: string): Promise<RakSummary[]> {
  const r = await request('/api/resource/Standard Rak', {
    params: {
      fields: ['name', 'kode', 'area', 'kategori', 'nomor', 'jumlah_rak', 'total_item'],
      filters: [['outlet', '=', outlet], ['disabled', '=', 0]],
      order_by: 'area asc, nomor asc',
      limit_page_length: 2000,
    },
  });
  return r.data;
}

function normalize(d: any): StandardRak {
  const items: RakItem[] = (d.items ?? []).map((x: any) => ({
    key: x.name,
    name: x.name,
    rak_no: x.rak_no,
    item_code: x.item_code,
    item_name: x.item_name ?? x.item_code,
    qty: x.qty ?? 0,
    uom: x.uom ?? '',
    catatan: x.catatan ?? '',
  }));
  const racks: RakLevel[] = (d.racks ?? []).map((x: any) => ({ name: x.name, rak_no: x.rak_no, kode_rak: x.kode_rak ?? '', catatan: x.catatan ?? '' }));
  // item yang nomor raknya belum ada di daftar rak tetap tampil sebagai rak sendiri (ikut tersimpan saat Simpan)
  for (const n of new Set(items.map((x) => x.rak_no))) if (!racks.some((r) => r.rak_no === n)) racks.push({ rak_no: n, kode_rak: levelCode(d.kode, n), catatan: '' });
  racks.sort((a, b) => a.rak_no - b.rak_no);
  return {
    name: d.name,
    kode: d.kode,
    area: d.area ?? '',
    kategori: d.kategori ?? '',
    nomor: d.nomor ?? 0,
    jumlah_rak: d.jumlah_rak ?? 0,
    total_item: d.total_item ?? 0,
    outlet: d.outlet ?? '',
    modified: d.modified,
    racks,
    items,
  };
}

export async function getStandardRak(name: string): Promise<StandardRak> {
  return normalize((await request(`/api/resource/Standard Rak/${encodeURIComponent(name)}`)).data);
}

/**
 * Simpan daftar rak & item (tabel lama diganti seluruhnya). Ditolak bila dokumen sudah diubah
 * orang lain sejak dibuka, supaya perubahan mereka tidak tertimpa.
 */
export async function saveStandardRak(doc: StandardRak): Promise<StandardRak> {
  const cur = await request('/api/method/frappe.client.get_value', { params: { doctype: 'Standard Rak', filters: { name: doc.name }, fieldname: 'modified' } });
  if (cur.message?.modified !== doc.modified) throw new Error('Standar rak ini baru saja diubah orang lain. Keluar lalu buka lagi untuk memuat versi terbaru.');
  const items = [...doc.items].sort((a, b) => a.rak_no - b.rak_no);
  const r = await request(`/api/resource/Standard Rak/${encodeURIComponent(doc.name)}`, {
    method: 'PUT',
    body: {
      jumlah_rak: doc.racks.length,
      total_item: items.length,
      racks: doc.racks.map(({ name, rak_no, kode_rak, catatan }) => ({ ...(name ? { name } : {}), rak_no, kode_rak, catatan })),
      items: items.map(({ name, rak_no, item_code, item_name, qty, uom, catatan }) => ({ ...(name ? { name } : {}), rak_no, item_code, item_name, qty, uom: uom || null, catatan })),
    },
  });
  return normalize(r.data);
}

/** Di rak mana saja (di outlet ini) suatu item menjadi standar. */
export async function findItemInStandards(item: string, outlet: string): Promise<ItemSpot[]> {
  const r = await request('/api/resource/Standard Rak', {
    params: {
      fields: ['name', 'kode', '`tabStandard Rak Item`.rak_no', '`tabStandard Rak Item`.qty'],
      filters: [['Standard Rak Item', 'item_code', '=', item], ['outlet', '=', outlet], ['disabled', '=', 0]],
      limit_page_length: 50,
    },
  });
  return r.data.map((x: any) => ({ rak: x.name, kode: x.kode, rak_no: x.rak_no, qty: x.qty }));
}
