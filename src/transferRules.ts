import { request } from './api';

export type Warehouse = { name: string; parent: string | null; isGroup: boolean; type: string | null };

let whCache: Warehouse[] | null = null;
export async function loadWarehouses(): Promise<Warehouse[]> {
  if (whCache) return whCache;
  const w = await request('/api/resource/Warehouse', {
    params: { fields: ['name', 'parent_warehouse', 'is_group', 'warehouse_type'], filters: [['disabled', '=', 0]], order_by: 'name asc', limit_page_length: 5000 },
  });
  whCache = w.data.map((x: any) => ({ name: x.name, parent: x.parent_warehouse, isGroup: !!x.is_group, type: x.warehouse_type }));
  return whCache!;
}

/** Nama semua gudang di bawah (turunan dari) gudang grup `parent`, termasuk dirinya sendiri. */
export function warehousesUnder(all: Warehouse[], parent: string): Set<string> {
  const by = new Map(all.map((x) => [x.name, x]));
  const out = new Set<string>();
  for (const w of all) {
    let cur: string | null | undefined = w.name;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      if (cur === parent) {
        out.add(w.name);
        break;
      }
      seen.add(cur);
      cur = by.get(cur)?.parent;
    }
  }
  return out;
}

export type TransferRules = {
  warehouses: Warehouse[];
  /** gudang leaf yang boleh dipilih sebagai gudang asal */
  fromOptions: string[];
  /** gudang leaf yang boleh dipilih sebagai gudang tujuan */
  toOptions: string[];
  defaultFrom: string;
  costCenter: string | null;
};

/**
 * Meniru aturan client script "STOCK ENTRY DEFAULT" di XERP:
 * - User.outlet -> Outlet.warehouse dipakai sebagai gudang asal default
 * - Gudang asal hanya boleh outlet warehouse itu sendiri atau yang satu grup dengan parent_warehouse-nya
 * - Outlet.cost_center dipakai sebagai cost center (server script menyalinnya ke tiap baris item)
 * User tanpa outlet / outlet tanpa warehouse: tidak ada default & tidak ada pembatasan.
 */
export async function loadTransferRules(): Promise<TransferRules> {
  const warehouses = await loadWarehouses();
  const leaves = warehouses.filter((x) => !x.isGroup).map((x) => x.name);
  const base: TransferRules = { warehouses, fromOptions: leaves, toOptions: leaves, defaultFrom: '', costCenter: null };

  try {
    const who = (await request('/api/method/frappe.auth.get_logged_user')).message as string;
    const u = await request('/api/method/frappe.client.get_value', { params: { doctype: 'User', filters: { name: who }, fieldname: 'outlet' } });
    const outletName = u.message?.outlet;
    if (!outletName) return base;
    const o = (await request(`/api/resource/Outlet/${encodeURIComponent(outletName)}`)).data;
    const byName = new Map(warehouses.map((x) => [x.name, x]));
    const ancestors = (n: string) => {
      const out: string[] = [];
      let cur = byName.get(n)?.parent;
      while (cur && !out.includes(cur)) {
        out.push(cur);
        cur = byName.get(cur)?.parent;
      }
      return out;
    };
    const outletParent = o.warehouse ? byName.get(o.warehouse)?.parent : null;
    return {
      ...base,
      defaultFrom: o.warehouse ?? '',
      costCenter: o.cost_center ?? null,
      fromOptions: outletParent ? leaves.filter((n) => n === o.warehouse || ancestors(n).includes(outletParent)) : leaves,
    };
  } catch {
    return base;
  }
}
