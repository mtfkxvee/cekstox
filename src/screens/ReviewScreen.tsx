import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Switch, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { findByBarcode, Item, searchItems } from '../api';
import { canCekUlang, cekUlangLocation, EditRow, getLocation, updateLocationItems } from '../opname';
import { onScrollFail, revealRow } from '../scroll';
import { c, s } from '../ui';

let seq = 0;
const newId = () => `n${Date.now()}-${++seq}`;

type Row = { id: string; name?: string; item_code: string; item_name: string; uom: string; counted_qty: number; input_method: string; notes: string };

const sig = (rows: Row[], kosong: boolean) => JSON.stringify([kosong, rows.map((r) => [r.name, r.item_code, r.counted_qty, r.notes])]);

/**
 * Isi lokasi yang sudah di-submit. Seperti di web: isi masih bisa diubah (Update) sampai status Divalidasi.
 * Satu-satunya aksi di aplikasi: Cek Ulang. Validasi & Tolak dilakukan di web.
 */
export default function ReviewScreen({ navigation, route }: any) {
  const { loc, lokasi }: { loc: string; lokasi: string } = route.params;
  const [doc, setDoc] = useState<any>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState('');
  const [kosong, setKosong] = useState(false);
  const listRef = useRef<FlatList<Row>>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [focusItem, setFocusItem] = useState<string | null>(null);
  const ref = useRef<Row[]>([]);
  const inputs = useRef<Record<string, TextInput | null>>({});

  const apply = (d: any) => {
    const r: Row[] = (d.items ?? []).map((i: any) => ({
      id: i.name,
      name: i.name,
      item_code: i.item_code,
      item_name: i.item_name,
      uom: i.uom,
      counted_qty: i.counted_qty,
      input_method: i.input_method ?? 'Manual',
      notes: i.notes ?? '',
    }));
    ref.current = r;
    setRows(r);
    setKosong(!!d.lokasi_kosong);
    setSaved(sig(r, !!d.lokasi_kosong));
    setDoc(d);
  };

  useEffect(() => {
    navigation.setOptions({ title: lokasi });
    getLocation(loc)
      .then(apply)
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  }, [loc, lokasi, navigation]);

  useEffect(() => {
    if (!focusItem) return;
    const t1 = setTimeout(() => revealRow(listRef.current, ref.current.findIndex((x) => x.id === focusItem), ref.current.length), 150);
    const t2 = setTimeout(() => {
      inputs.current[focusItem]?.focus();
      setFocusItem(null);
    }, 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [focusItem, rows]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => searchItems(q).then(setResults).catch((e) => setErr(e.message)), 400);
    return () => clearTimeout(t);
  }, [q]);

  const status: string | null = doc?.validation_status ?? null;
  const locked = status === 'Divalidasi' || doc?.docstatus !== 1;
  const dirty = sig(rows, kosong) !== saved;

  const update = (next: Row[]) => {
    ref.current = next;
    setRows(next);
  };

  // setiap scan/pilih membuat BARIS BARU (tidak menambah qty baris lama), urutan = urutan input
  const addItem = useCallback((it: Item, method: 'Manual' | 'Scan') => {
    const id = newId();
    update([...ref.current, { id, item_code: it.name, item_name: it.item_name, uom: it.stock_uom, counted_qty: 1, input_method: method, notes: '' }]);
    setFocusItem(id);
  }, []);

  const onScan = useCallback(
    async (code: string) => {
      setErr('');
      try {
        const it = await findByBarcode(code);
        if (!it) return setErr(`Barcode ${code} tidak ditemukan`);
        Vibration.vibrate(50);
        addItem(it, 'Scan');
        setMsg(`Baris baru: ${it.item_name}`);
      } catch (e: any) {
        setErr(e.message);
      }
    },
    [addItem],
  );

  const setQty = (id: string, text: string) => {
    const n = parseFloat(text.replace(',', '.'));
    update(ref.current.map((r) => (r.id === id ? { ...r, counted_qty: isNaN(n) || n < 0 ? 0 : n } : r)));
  };
  const setNote = (id: string, notes: string) => update(ref.current.map((r) => (r.id === id ? { ...r, notes } : r)));

  const toggleKosong = (on: boolean) => {
    if (on && rows.length)
      return Alert.alert('Tandai lokasi kosong?', `${rows.length} item di lokasi ini akan dihapus saat disimpan.`, [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya, kosong',
          style: 'destructive',
          onPress: () => {
            update([]);
            setKosong(true);
          },
        },
      ]);
    setKosong(on);
  };

  /** Sama dengan aturan server: kosong = tanpa item; selain itu min. 1 item dan qty 0 wajib catatan. */
  const problem = () => {
    if (kosong) return rows.length ? 'Lokasi kosong tidak boleh punya item.' : '';
    if (!rows.length) return 'Lokasi harus punya minimal 1 item, atau centang Lokasi Kosong.';
    const z = rows.find((r) => r.counted_qty === 0 && !r.notes.trim());
    return z ? `Item ${z.item_name} berqty 0. Isi catatannya (mis. "kosong") atau hapus barisnya.` : '';
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const p = problem();
    if (p) return setErr(p);
    run(async () => {
      const payload: EditRow[] = rows.map((r) => ({ name: r.name, item_code: r.item_code, counted_qty: r.counted_qty, input_method: r.input_method, notes: r.notes }));
      const res = await updateLocationItems(loc, payload, kosong);
      apply(res.data);
      setMsg('Perubahan tersimpan');
    });
  };

  const cekUlang = () =>
    Alert.alert('Cek ulang?', 'Hasil hitung lokasi ini sudah dicek ulang dan benar?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Ya, Cek Ulang',
        onPress: () =>
          run(async () => {
            await cekUlangLocation(loc);
            apply(await getLocation(loc));
            setMsg('Sudah dicek ulang, menunggu validasi');
          }),
      },
    ]);

  if (!doc) return err ? <Text style={[s.err, { margin: 16 }]}>{err}</Text> : <ActivityIndicator style={{ marginTop: 40 }} />;

  const banner =
    status === 'Divalidasi'
      ? { t: 'Sudah divalidasi. Isi lokasi ini tidak bisa diubah lagi.', bg: '#dcf5e3', fg: c.ok }
      : status === 'Menunggu Validasi'
        ? { t: `Sudah dicek ulang${doc.dicek_oleh ? ' oleh ' + doc.dicek_oleh : ''}. Menunggu validasi. Isi masih bisa diubah sampai divalidasi.`, bg: '#e3eeff', fg: c.primary }
        : { t: 'Menunggu cek ulang. Isi masih bisa diubah, simpan perubahan lalu tekan Cek Ulang kalau sudah benar.', bg: '#fff7e0', fg: c.warn };

  return (
    <View style={s.screen}>
      <View style={{ backgroundColor: banner.bg, borderRadius: 10, padding: 10, marginBottom: 8 }}>
        <Text style={{ color: banner.fg, fontWeight: '600' }}>{banner.t}</Text>
        <Text style={[s.muted, { marginTop: 2 }]}>dihitung {doc.counted_by ?? '-'}</Text>
      </View>

      {!locked && (
        <View style={[s.card, s.row, { justifyContent: 'space-between', paddingVertical: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Lokasi Kosong</Text>
            <Text style={s.muted}>Centang jika lokasi ini memang tidak ada barang</Text>
          </View>
          <Switch value={kosong} onValueChange={toggleKosong} />
        </View>
      )}
      {!locked && !kosong && (
        <View style={[s.row, { marginBottom: 8 }]}>
          <TextInput style={[s.input, { flex: 1 }]} placeholder="Cari item untuk ditambah" value={q} onChangeText={setQ} autoCorrect={false} />
          <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Scanner', { onScan })}>
            <Text style={s.btnText}>Scan</Text>
          </TouchableOpacity>
        </View>
      )}
      {!!err && <Text style={s.err}>{err}</Text>}
      {!!msg && !q && <Text style={[s.muted, { marginBottom: 4 }]}>{msg}</Text>}

      {q.trim().length >= 2 && !locked && !kosong ? (
        <FlatList
          data={results}
          keyExtractor={(i) => i.name}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              onPress={() => {
                addItem(item, 'Manual');
                setQ('');
              }}>
              <Text style={s.title}>{item.item_name}</Text>
              <Text style={s.muted}>{item.name} · {item.stock_uom}</Text>
            </TouchableOpacity>
          )}
        />
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(r) => r.id}
            keyboardShouldPersistTaps="handled"
            onScrollToIndexFailed={onScrollFail(listRef)}
            ListEmptyComponent={<Text style={s.muted}>{kosong ? 'Lokasi ini ditandai kosong (tidak ada barang).' : 'Belum ada item.'}</Text>}
            renderItem={({ item: r, index }) => (
              <View style={s.card}>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <Text style={[s.title, { flex: 1 }]}>{index + 1}. {r.item_name}</Text>
                  {!locked && (
                    <TouchableOpacity onPress={() => update(ref.current.filter((x) => x.id !== r.id))}>
                      <Text style={{ color: c.danger, fontSize: 18 }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={s.muted}>{r.item_code} · {r.input_method}</Text>
                {locked ? (
                  <Text style={{ fontSize: 18, fontWeight: '700', marginTop: 4 }}>{r.counted_qty} <Text style={s.muted}>{r.uom}</Text></Text>
                ) : (
                  <>
                    <View style={[s.row, { marginTop: 8 }]}>
                      <TouchableOpacity style={[s.btn, s.btnAlt, { paddingHorizontal: 14 }]} onPress={() => setQty(r.id, String(Math.max(0, r.counted_qty - 1)))}>
                        <Text style={[s.btnText, s.btnAltText]}>−</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={[s.input, { width: 90, textAlign: 'center' }]}
                        ref={(x) => {
                          inputs.current[r.id] = x;
                        }}
                        selectTextOnFocus
                        keyboardType="decimal-pad"
                        defaultValue={String(r.counted_qty)}
                        key={`${r.id}-${r.counted_qty}`}
                        onEndEditing={(e) => setQty(r.id, e.nativeEvent.text)}
                      />
                      <TouchableOpacity style={[s.btn, s.btnAlt, { paddingHorizontal: 14 }]} onPress={() => setQty(r.id, String(r.counted_qty + 1))}>
                        <Text style={[s.btnText, s.btnAltText]}>+</Text>
                      </TouchableOpacity>
                      <Text style={[s.muted, { marginLeft: 'auto' }]}>{r.uom}</Text>
                    </View>
                    {(r.counted_qty === 0 || !!r.notes) && (
                      <TextInput
                        style={[s.input, { marginTop: 8 }, r.counted_qty === 0 && !r.notes.trim() && { borderColor: c.warn }]}
                        placeholder={r.counted_qty === 0 ? 'Catatan wajib untuk qty 0 (mis. kosong)' : 'Catatan'}
                        value={r.notes}
                        onChangeText={(t) => setNote(r.id, t)}
                      />
                    )}
                  </>
                )}
              </View>
            )}
          />
          {!locked && (
            <View style={{ marginTop: 8 }}>
              {dirty && (
                <TouchableOpacity style={[s.btn, busy && { opacity: 0.5 }]} disabled={busy} onPress={save}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Simpan Perubahan</Text>}
                </TouchableOpacity>
              )}
              {!dirty && status !== 'Menunggu Validasi' && canCekUlang() && (
                <TouchableOpacity style={[s.btn, { backgroundColor: c.ok }, busy && { opacity: 0.5 }]} disabled={busy} onPress={cekUlang}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Aksi: Cek Ulang</Text>}
                </TouchableOpacity>
              )}
              {dirty && status !== 'Menunggu Validasi' && canCekUlang() && <Text style={[s.muted, { textAlign: 'center', marginTop: 6 }]}>Simpan perubahan dulu sebelum Cek Ulang.</Text>}
            </View>
          )}
        </>
      )}
    </View>
  );
}
