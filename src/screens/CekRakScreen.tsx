import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { listShelves, Shelf, shelfContents, ShelfItem, shelfSummaries, ShelfSummary } from '../shelving';
import { loadTransferRules, TransferRules } from '../transferRules';
import { c, s } from '../ui';

/** Lihat isi rak: pilih gudang, pilih / scan rak, lalu tampil semua item di rak tersebut. */
export default function CekRakScreen({ navigation }: any) {
  const [rules, setRules] = useState<TransferRules | null>(null);
  const [warehouse, setWarehouse] = useState('');
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [sums, setSums] = useState<Record<string, ShelfSummary>>({});
  const [sel, setSel] = useState<Shelf | null>(null);
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const shelvesRef = useRef<Shelf[]>([]);

  const chooseWarehouse = useCallback(async (w: string) => {
    setErr('');
    setWarehouse(w);
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

  const openShelf = useCallback(async (sh: Shelf) => {
    setSel(sh);
    setItems([]);
    setQ('');
    setErr('');
    setBusy(true);
    try {
      setItems(await shelfContents(sh.name));
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
            <Text style={{ fontSize: 20, fontWeight: '700', color: c.text }}>{sel.label}</Text>
            {!busy && <Text style={s.muted}>{items.length} item · total {total}</Text>}
          </View>
          <TouchableOpacity style={[s.btn, s.btnAlt]} onPress={() => { setSel(null); setQ(''); }}>
            <Text style={[s.btnText, s.btnAltText]}>Ganti Rak</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[s.row, { marginBottom: 8 }]}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder={sel ? 'Cari item di rak ini' : 'Cari rak'} value={q} onChangeText={setQ} autoCorrect={false} />
        <TouchableOpacity style={s.btn} onPress={scan}>
          <Text style={s.btnText}>Scan Rak</Text>
        </TouchableOpacity>
      </View>
      {busy && <ActivityIndicator style={{ marginVertical: 8 }} />}
      {!!err && <Text style={s.err}>{err}</Text>}

      {sel ? (
        <FlatList
          data={shownItems}
          keyExtractor={(x) => x.item}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={!busy ? <Text style={s.muted}>{k ? 'Tidak ada item yang cocok.' : 'Rak ini kosong.'}</Text> : null}
          renderItem={({ item: x, index }) => (
            <View style={[s.card, s.row, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{index + 1}. {x.item_name}</Text>
                <Text style={s.muted}>{x.item}</Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: x.qty > 0 ? c.ok : c.danger }}>
                {x.qty} <Text style={s.muted}>{x.uom}</Text>
              </Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={shownShelves}
          keyExtractor={(x) => x.name}
          keyboardShouldPersistTaps="handled"
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
