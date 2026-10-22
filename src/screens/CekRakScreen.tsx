import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, SectionList, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { listShelves, Shelf, shelfContents, ShelfItem, shelfLabelOf, shelfSummaries, ShelfSummary, warehouseShelfContents } from '../shelving';
import { loadTransferRules, TransferRules } from '../transferRules';
import { c, s } from '../ui';

/** Pilihan "Semua Rak": isi semua rak di gudang, dikelompokkan per rak. */
const ALL = 'ALL';

/** Lihat isi rak: pilih gudang, pilih / scan rak (atau Semua Rak), lalu tampil semua item di rak tersebut. */
export default function CekRakScreen({ navigation }: any) {
  const [rules, setRules] = useState<TransferRules | null>(null);
  const [warehouse, setWarehouse] = useState('');
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [sums, setSums] = useState<Record<string, ShelfSummary>>({});
  const [sel, setSel] = useState<Shelf | typeof ALL | null>(null);
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const shelvesRef = useRef<Shelf[]>([]);
  const whRef = useRef('');

  const chooseWarehouse = useCallback(async (w: string) => {
    setErr('');
    setWarehouse(w);
    whRef.current = w;
    setSel(null);
    setQ('');
    setBusy(true);
    try {
      // ringkasan bersifat tambahan: kalau gagal, daftar rak tetap tampil
      const [list, sm] = await Promise.all([listShelves(w), shelfSummaries(w).catch(() => ({}))]);
      shelvesRef.current = list;
      setShelves(list);
      setSums(sm);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  // gudang default user (outlet) langsung dipilih bila memakai rak
  useEffect(() => {
    loadTransferRules()
      .then((r) => {
        setRules(r);
        if (r.defaultFrom && r.warehouses.find((x) => x.name === r.defaultFrom)?.useShelving) chooseWarehouse(r.defaultFrom);
      })
      .catch((e) => setErr(e.message));
  }, [chooseWarehouse]);

  const openShelf = useCallback(async (sh: Shelf | typeof ALL) => {
    setSel(sh);
    setItems([]);
    setQ('');
    setErr('');
    setBusy(true);
    try {
      setItems(sh === ALL ? await warehouseShelfContents(whRef.current) : await shelfContents(sh.name));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  const pickWarehouse = () =>
    rules &&
    navigation.navigate('WarehousePicker', {
      title: 'Gudang (yang memakai rak)',
      names: rules.warehouses.filter((w) => w.useShelving && !w.isGroup).map((w) => w.name),
      onPick: chooseWarehouse,
    });

  // label rak bisa berisi nama rak (G70-BISK-R3) atau nama lengkap dokumen Shelving
  const scan = () => {
    if (!warehouse) return setErr('Pilih gudang dulu');
    navigation.navigate('Scanner', {
      onScan: (code: string) => {
        const k = code.trim().toLowerCase();
        const sh = shelvesRef.current.find((x) => x.name.toLowerCase() === k || x.label.toLowerCase() === k);
        if (!sh) return setErr(`Rak ${code} tidak ditemukan di gudang ini`);
        Vibration.vibrate(50);
        openShelf(sh);
      },
    });
  };

  const k = q.trim().toLowerCase();
  const shownShelves = k ? shelves.filter((x) => x.label.toLowerCase().includes(k)) : shelves;
  const shownItems = k ? items.filter((x) => (x.item + ' ' + x.item_name).toLowerCase().includes(k)) : items;
  const total = items.reduce((a, b) => a + b.qty, 0);
  const allSum = Object.values(sums).reduce((a, b) => ({ items: a.items + b.items, qty: a.qty + b.qty }), { items: 0, qty: 0 });

  const labelOf = (name: string) => shelves.find((x) => x.name === name)?.label ?? shelfLabelOf(name);
  // urutan rak mengikuti daftar rak (prioritas), rak yang tidak dikenal di akhir
  const order = (name: string) => {
    const i = shelves.findIndex((x) => x.name === name);
    return i < 0 ? shelves.length : i;
  };
  const sections =
    sel === ALL
      ? [...new Set(shownItems.map((x) => x.shelving))]
          .sort((a, b) => order(a) - order(b))
          .map((sh) => ({ title: sh, data: shownItems.filter((x) => x.shelving === sh) }))
      : [];

  const itemRow = (x: ShelfItem, index: number) => (
    <View style={[s.card, s.row, { justifyContent: 'space-between' }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{index + 1}. {x.item_name}</Text>
        <Text style={s.muted}>{x.item}</Text>
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          <View style={{ backgroundColor: '#f1e4fd', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: '#9333ea', fontSize: 12, fontWeight: '600' }}>Rak {labelOf(x.shelving)}</Text>
          </View>
        </View>
      </View>
      <Text style={{ fontSize: 18, fontWeight: '700', color: x.qty > 0 ? c.ok : c.danger }}>
        {x.qty} <Text style={s.muted}>{x.uom}</Text>
      </Text>
    </View>
  );

  const empty = !busy ? <Text style={s.muted}>{k ? 'Tidak ada item yang cocok.' : sel === ALL ? 'Semua rak di gudang ini kosong.' : 'Rak ini kosong.'}</Text> : null;

  return (
    <View style={s.screen}>
      <TouchableOpacity style={[s.card, { marginBottom: 10 }]} onPress={pickWarehouse}>
        <Text style={s.muted}>Gudang</Text>
        <Text style={s.title}>{warehouse || 'Pilih gudang'}</Text>
      </TouchableOpacity>

      {sel && (
        <View style={[s.card, s.row, { borderColor: c.primary, justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.muted}>Rak</Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: c.text }}>{sel === ALL ? 'Semua Rak' : sel.label}</Text>
            {!busy && <Text style={s.muted}>{sel === ALL ? `${sections.length} rak · ` : ''}{items.length} baris item · total {total}</Text>}
          </View>
          <TouchableOpacity style={[s.btn, s.btnAlt]} onPress={() => { setSel(null); setQ(''); }}>
            <Text style={[s.btnText, s.btnAltText]}>Ganti Rak</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[s.row, { marginBottom: 8 }]}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder={sel ? 'Cari item' : 'Cari rak'} value={q} onChangeText={setQ} autoCorrect={false} />
        <TouchableOpacity style={s.btn} onPress={scan}>
          <Text style={s.btnText}>Scan Rak</Text>
        </TouchableOpacity>
      </View>
      {busy && <ActivityIndicator style={{ marginVertical: 8 }} />}
      {!!err && <Text style={s.err}>{err}</Text>}

      {sel === ALL ? (
        <SectionList
          sections={sections}
          keyExtractor={(x) => `${x.shelving}|${x.item}`}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled
          ListEmptyComponent={empty}
          renderSectionHeader={({ section }) => (
            <View style={[s.row, { justifyContent: 'space-between', backgroundColor: c.bg, paddingVertical: 6 }]}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: c.primary }}>Rak {labelOf(section.title)}</Text>
              <Text style={s.muted}>{section.data.length} item · total {section.data.reduce((a, b) => a + b.qty, 0)}</Text>
            </View>
          )}
          renderItem={({ item, index }) => itemRow(item, index)}
        />
      ) : sel ? (
        <FlatList data={shownItems} keyExtractor={(x) => x.item} keyboardShouldPersistTaps="handled" ListEmptyComponent={empty} renderItem={({ item, index }) => itemRow(item, index)} />
      ) : (
        <FlatList
          data={shownShelves}
          keyExtractor={(x) => x.name}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            warehouse && shelves.length > 0 && !k ? (
              <TouchableOpacity style={[s.card, s.row, { justifyContent: 'space-between', borderColor: c.primary, backgroundColor: '#e3eeff' }]} onPress={() => openShelf(ALL)}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.title, { color: c.primary }]}>Semua Rak</Text>
                  <Text style={s.muted}>Tampilkan semua isi rak di gudang ini{allSum.items ? ` · ${allSum.items} baris item · total ${allSum.qty}` : ''}</Text>
                </View>
                <Text style={{ color: c.primary }}>›</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={!busy && warehouse ? <Text style={s.muted}>Tidak ada rak di gudang ini.</Text> : null}
          renderItem={({ item: x }) => {
            const sm = sums[x.name];
            return (
              <TouchableOpacity style={[s.card, s.row, { justifyContent: 'space-between' }]} onPress={() => openShelf(x)}>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{x.label}</Text>
                  <Text style={s.muted}>{sm ? `${sm.items} item · total ${sm.qty}` : 'kosong'}{x.isDefault ? ' · rak default' : ''}</Text>
                </View>
                <Text style={{ color: c.muted }}>›</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}
