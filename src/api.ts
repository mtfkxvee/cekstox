import * as SecureStore from 'expo-secure-store';
import { COMPANY, ERP_URL } from './config';

export type Item = { name: string; item_name: string; stock_uom: string; item_group?: string };
export type BinRow = { warehouse: string; actual_qty: number; reserved_qty: number; projected_qty: number; valuation_rate: number };

const K_USER = 'erp_usr';
const K_PWD = 'erp_pwd';
const K_TOKEN = 'erp_token'; // login Google: 'api_key:api_secret' milik user (tanpa cookie/CSRF)

let csrf: string | null = null;
let token: string | null = null;
let tokenLoaded = false;

async function getToken() {
  if (!tokenLoaded) {
    token = await SecureStore.getItemAsync(K_TOKEN);
    tokenLoaded = true;
  }
  return token;
}
let loginPromise: Promise<void> | null = null;

async function doLogin(usr: string, pwd: string) {
  const res = await fetch(`${ERP_URL}/api/method/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ usr, pwd }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'Username atau password salah' : `Login gagal (${res.status})`);
  csrf = null;
}

export async function login(usr: string, pwd: string) {
  await doLogin(usr, pwd);
  await SecureStore.deleteItemAsync(K_TOKEN);
  token = null;
  tokenLoaded = true;
  await SecureStore.setItemAsync(K_USER, usr);
  await SecureStore.setItemAsync(K_PWD, pwd);
}

/** Login Google: server auth mengembalikan token API milik user. */
export async function loginWithToken(user: string, apiToken: string) {
  await SecureStore.setItemAsync(K_USER, user);
  await SecureStore.setItemAsync(K_TOKEN, apiToken);
  await SecureStore.deleteItemAsync(K_PWD);
  token = apiToken;
  tokenLoaded = true;
  csrf = null;
}

export async function logout() {
  if (!(await getToken())) {
    try {
      await fetch(`${ERP_URL}/api/method/logout`, { method: 'POST', credentials: 'include' });
    } catch {}
  }
  csrf = null;
  token = null;
  tokenLoaded = true;
  await SecureStore.deleteItemAsync(K_TOKEN);
  await SecureStore.deleteItemAsync(K_USER);
  await SecureStore.deleteItemAsync(K_PWD);
}

export const savedUser = () => SecureStore.getItemAsync(K_USER);

function relogin() {
  if (!loginPromise) {
    loginPromise = (async () => {
      const usr = await SecureStore.getItemAsync(K_USER);
      const pwd = await SecureStore.getItemAsync(K_PWD);
      if (!usr || !pwd) throw new Error('Sesi berakhir, silakan login lagi');
      await doLogin(usr, pwd);
    })().finally(() => {
      loginPromise = null;
    });
  }
  return loginPromise;
}

async function getCsrf() {
  if (csrf) return csrf;
  const res = await fetch(`${ERP_URL}/app`, { credentials: 'include' });
  const html = await res.text();
  const m = html.match(/csrf_token\s*[=:]\s*["']([^"']+)["']/);
  if (!m) throw new Error('Gagal mengambil CSRF token');
  csrf = m[1];
  return csrf;
}

type Init = { method?: string; body?: unknown; params?: Record<string, unknown> };

export async function request(path: string, init: Init = {}, retry = true): Promise<any> {
  const method = init.method ?? 'GET';
  let url = `${ERP_URL}${path.replace(/ /g, '%20')}`;
  if (init.params) {
    const q = Object.entries(init.params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))}`)
      .join('&');
    url += `?${q}`;
  }
  const apiToken = await getToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiToken) headers.Authorization = `token ${apiToken}`;
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    if (!apiToken) headers['X-Frappe-CSRF-Token'] = await getCsrf();
  }
  const res = await fetch(url, { method, credentials: apiToken ? 'omit' : 'include', headers, body: init.body ? JSON.stringify(init.body) : undefined });
  if (apiToken && res.status === 401) {
    // token tidak berlaku lagi (mis. login Google di HP lain) -> hapus agar app meminta login ulang
    await SecureStore.deleteItemAsync(K_TOKEN);
    await SecureStore.deleteItemAsync(K_USER);
    token = null;
    throw new Error('Sesi berakhir, tutup lalu buka aplikasi dan login lagi.');
  }
  if (!apiToken && (res.status === 401 || res.status === 403) && retry) {
    await relogin();
    return request(path, init, false);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = json?.exception || `Error ${res.status}`;
    try {
      const sm = JSON.parse(json._server_messages ?? '[]');
      if (sm.length) msg = JSON.parse(sm[0]).message.replace(/<[^>]+>/g, '');
    } catch {}
    throw new Error(msg);
  }
  return json;
}

const ITEM_FIELDS = ['name', 'item_name', 'stock_uom', 'item_group'];
const cleanBarcode = (s: string) => s.trim().replace(/^'/, '');

/** Barcode di data ini kadang diawali tanda petik ('), jadi dicoba dengan & tanpa. */
export async function findByBarcode(code: string): Promise<Item | null> {
  const c = cleanBarcode(code);
  if (!c) return null;
  for (const v of [c, `'${c}`]) {
    const r = await request('/api/resource/Item', {
      params: { fields: ITEM_FIELDS, filters: [['Item Barcode', 'barcode', '=', v]], limit_page_length: 1 },
    });
    if (r.data[0]) return r.data[0];
  }
  const r = await request('/api/resource/Item', {
    params: { fields: ITEM_FIELDS, filters: [['name', 'in', [c, `'${c}`]]], limit_page_length: 1 },
  });
  return r.data[0] ?? null;
}

/** Cari item lewat barcode/kode persis, lalu nama (semua kata harus cocok). */
export async function searchItems(q: string): Promise<Item[]> {
  q = q.trim();
  if (!q) return [];
  const exact = await findByBarcode(q);
  const words = q.split(/\s+/).filter(Boolean);
  const filters = [['disabled', '=', 0], ...words.map((w) => ['item_name', 'like', `%${w}%`])];
  const byName = await request('/api/resource/Item', {
    params: { fields: ITEM_FIELDS, filters, order_by: 'item_name asc', limit_page_length: 30 },
  });
  const list: Item[] = byName.data;
  return exact ? [exact, ...list.filter((i) => i.name !== exact.name)] : list;
}

export async function getStock(item: string): Promise<BinRow[]> {
  const r = await request('/api/resource/Bin', {
    params: {
      fields: ['warehouse', 'actual_qty', 'reserved_qty', 'projected_qty', 'valuation_rate'],
      filters: [['item_code', '=', item]],
      order_by: 'actual_qty desc',
      limit_page_length: 200,
    },
  });
  return r.data;
}

export async function getAvailable(item: string, warehouse: string): Promise<number> {
  const r = await request('/api/resource/Bin', {
    params: { fields: ['actual_qty'], filters: [['item_code', '=', item], ['warehouse', '=', warehouse]], limit_page_length: 1 },
  });
  return r.data[0]?.actual_qty ?? 0;
}

export type TransferLine = {
  /** id baris unik: item yang sama boleh muncul di beberapa baris (rak tujuan bisa berbeda) */
  id: string;
  item: string;
  item_name: string;
  uom: string;
  qty: number;
  avail: number;
  /** stok item ini per rak di gudang asal (hanya jika gudang asal memakai rak) */
  stocks?: { shelving: string; qty: number }[];
  fromShelving?: string | null;
  toShelving?: string | null;
};

/** Stock Entry bertipe PINDAH STOK (purpose Material Transfer): dibuat lalu langsung di-submit. Kalau submit gagal, draft tetap ada di XERP. */
export type TransferOpts = { costCenter?: string | null };

export async function createTransfer(from: string, to: string, lines: TransferLine[], opts: TransferOpts = {}): Promise<string> {
  const r = await request('/api/resource/Stock Entry', {
    method: 'POST',
    body: {
      doctype: 'Stock Entry',
      stock_entry_type: 'PINDAH STOK',
      purpose: 'Material Transfer',
      company: COMPANY,
      from_warehouse: from,
      to_warehouse: to,
      ...(opts.costCenter ? { cost_center: opts.costCenter } : {}),
      items: lines.map((l) => ({
        item_code: l.item,
        qty: l.qty,
        s_warehouse: from,
        t_warehouse: to,
        ...(l.fromShelving ? { from_shelving: l.fromShelving } : {}),
        ...(l.toShelving ? { to_shelving: l.toShelving } : {}),
        ...(opts.costCenter ? { cost_center: opts.costCenter } : {}),
      })),
    },
  });
  try {
    await request('/api/method/frappe.client.submit', { method: 'POST', body: { doc: r.data } });
  } catch (e: any) {
    throw new Error(`Draft ${r.data.name} sudah dibuat tapi gagal di-submit: ${e.message}`);
  }
  return r.data.name;
}
