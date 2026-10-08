import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BinRow, findByBarcode, getStock, Item, searchItems } from '../api';
import { itemShelfStocksAll, ShelfStock, shelfLabelOf } from '../shelving';
import { loadWarehouses, Warehouse, warehousesUnder } from '../transferRules';
import { c, s } from '../ui';

const ALL = 'Semua gudang';

export default function StockScreen({ navigation }: any) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState<Item | null>(null);
  const [bins, setBins] = useState<BinRow[]>([]);
  const [shelves, setShelves] = useState<Record<string, ShelfStock[]>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [whs, setWhs] = useState<Warehouse[]>([]);
  const [parent, setParent] = useState<string | null>(null);

  useEffect(() => {
    loadWarehouses().then(setWhs).catch(() => {});
  }, []);

  const pickParent = () =>
    navigation.navigate('WarehousePicker', {
      title: 'Filter Parent Warehouse',
      names: [ALL, ...whs.filter((w) => w.isGroup).map((w) => w.name)],
      onPick: (w: string) => setParent(w === ALL ? null : w),
    });

  const allowed = parent ? warehousesUnder(whs, parent) : null;
  const shown = allowed ? bins.filter((b) => allowed.has(b.warehouse)) : bins;

  const open = useCallback(async (it: Item) => {
    setSel(it);
    setBins([]);
    setShelves({});
    setBusy(true);
    setErr('');
    try {
      // rak bersifat tambahan: kalau gagal dimuat, stok per gudang tetap tampil
      const [b, sv] = await Promise.all([getStock(it.name), itemShelfStocksAll(it.name).catch(() => ({}))]);
      setBins(b);
      setShelves(sv);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  // debounce pencarian nama
  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      setErr('');
      try {
        setItems(await searchItems(q));
      } catch (e: any) {
        setErr(e.message);
      } finally {
        setBusy(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const scan = () =>
    navigation.navigate('Scanner', {
      onScan: async (code: string) => {
        setBusy(true);
        setErr('');
        try {
          const it = await findByBarcode(code);
          if (it) {
            setQ('');
            open(it);
          } else setErr(`Barcode ${code} tidak ditemukan`);
        } catch (e: any) {
          setErr(e.message);
        } finally {
          setBusy(false);
        }
      },
    });

  const total = shown.reduce((a, b) => a + b.actual_qty, 0);

  return (
    <View style={s.screen}>
      <View style={[s.row, { marginBottom: 12 }]}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Nama / kode / barcode" value={q} onChangeText={(t) => { setQ(t); setSel(null); }} autoCorrect={false} />
        <TouchableOpacity style={s.btn} onPress={scan}>
          <Text style={s.btnText}>Scan</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={pickParent} style={[s.card, s.row, { justifyContent: 'space-between', paddingVertical: 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.muted}>Parent warehouse</Text>
          <Text style={s.title} numberOfLines={1}>{parent ?? ALL}</Text>
        </View>
        {parent ? (
          <TouchableOpacity onPress={() => setParent(null)} hitSlop={10}>
            <Text style={{ color: c.danger, fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ color: c.muted }}>▾</Text>
        )}
      </TouchableOpacity>
      {busy && <ActivityIndicator style={{ marginVertical: 8 }} />}
      {!!err && <Text style={s.err}>{err}</Text>}

      {sel ? (
        <FlatList
          data={shown.filter((b) => b.actual_qty !== 0 || b.reserved_qty !== 0)}
          keyExtractor={(b) => b.warehouse}
          ListHeaderComponent={
            <View style={[s.card, { borderColor: c.primary }]}>
              <Text style={s.title}>{sel.item_name}</Text>
              <Text style={s.muted}>{sel.name} · {sel.item_group}</Text>
              <Text style={{ fontSize: 22, fontWeight: '700', marginTop: 6 }}>{total} {sel.stock_uom}</Text>
              <Text style={s.muted}>total {parent ?? 'semua gudang'}</Text>
            </View>
          }
          ListEmptyComponent={!busy ? <Text style={s.muted}>Tidak ada stok di gudang manapun.</Text> : null}
          renderItem={({ item: b }) => (
            <View style={[s.card, s.row, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{b.warehouse}</Text>
                {b.reserved_qty > 0 && <Text style={s.muted}>reserved {b.reserved_qty} · projected {b.projected_qty}</Text>}
                {(shelves[b.warehouse] ?? []).map((r) => (
                  <View key={r.shelving} style={[s.row, { justifyContent: 'space-between', marginTop: 4, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: c.border }]}>
                    <Text style={s.muted}>Rak {shelfLabelOf(r.shelving)}</Text>
                    <Text style={{ color: r.qty > 0 ? c.text : c.danger, fontWeight: '600' }}>{r.qty}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: b.actual_qty > 0 ? c.ok : c.danger }}>{b.actual_qty}</Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.name}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => open(item)}>
              <Text style={s.title}>{item.item_name}</Text>
              <Text style={s.muted}>{item.name} · {item.stock_uom}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
