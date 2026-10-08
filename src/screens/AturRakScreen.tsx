import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { findByBarcode, Item, searchItems } from '../api';
import { onScrollFail, revealRow } from '../scroll';
import { createShelvingTransfer, itemShelfStocks, listShelves, Shelf, shelfLabelOf, ShelfStock, ShelvingTransferType } from '../shelving';
import { loadTransferRules, TransferRules } from '../transferRules';
import { c, s } from '../ui';

type Line = { item: string; item_name: string; uom: string; qty: number; stocks: ShelfStock[]; from: string | null; to: string | null };

const TYPES: { key: ShelvingTransferType; label: string; hint: string; needFrom: boolean; needTo: boolean }[] = [
  { key: 'Put-away', label: 'Put-away', hint: 'Menata barang ke rak', needFrom: false, needTo: true },
  { key: 'Pindah Shelving', label: 'Pindah Rak', hint: 'Pindah dari satu rak ke rak lain', needFrom: true, needTo: true },
  { key: 'Keluarkan dari Shelving', label: 'Keluarkan', hint: 'Keluarkan barang dari rak', needFrom: true, needTo: false },
];

/** Atur rak di dalam satu gudang (doctype Shelving Transfer): Put-away, Pindah Shelving, Keluarkan dari Shelving. */
export default function AturRakScreen({ navigation }: any) {
  const [rules, setRules] = useState<TransferRules | null>(null);
  const [type, setType] = useState<ShelvingTransferType>('Pindah Shelving');
  const [warehouse, setWarehouse] = useState('');
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [defTo, setDefTo] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [focusItem, setFocusItem] = useState<string | null>(null);
  const ref = useRef<Line[]>([]);
  const whRef = useRef('');
  const defToRef = useRef<string | null>(null);
  const typeRef = useRef<ShelvingTransferType>('Pindah Shelving');
  const inputs = useRef<Record<string, TextInput | null>>({});
  const listRef = useRef<FlatList<Line>>(null);

  const T = TYPES.find((x) => x.key === type)!;
  typeRef.current = type;

  const update = (next: Line[]) => {
    ref.current = next;
    setLines(next);
  };

  const chooseWarehouse = useCallback(async (w: string) => {
    setErr('');
    try {
      setWarehouse(w);
      whRef.current = w;
      defToRef.current = null;
      setDefTo(null);
      update([]);
      setShelves(await listShelves(w));
    } catch (e: any) {
      setErr(e.message);
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

  useEffect(() => {
    if (!focusItem) return;
    const t1 = setTimeout(() => revealRow(listRef.current, ref.current.findIndex((x) => x.item === focusItem), ref.current.length), 150);
    const t2 = setTimeout(() => {
      inputs.current[focusItem]?.focus();
      setFocusItem(null);
    }, 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [focusItem, lines]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => searchItems(q).then(setResults).catch((e) => setErr(e.message)), 400);
    return () => clearTimeout(t);
  }, [q]);

  const labelOf = (name: string | null | undefined) => (name ? shelves.find((x) => x.name === name)?.label ?? shelfLabelOf(name) : '');

  const pickWarehouse = () =>
    rules &&
    navigation.navigate('WarehousePicker', {
      title: 'Gudang (yang memakai rak)',
      names: rules.fromOptions.filter((w) => rules.warehouses.find((x) => x.name === w)?.useShelving),
      onPick: chooseWarehouse,
    });

  const changeType = (k: ShelvingTransferType) => {
    setType(k);
    typeRef.current = k;
    const t = TYPES.find((x) => x.key === k)!;
    // tujuan tidak dipakai pada "Keluarkan"; asal otomatis bila hanya satu rak berisi
    update(ref.current.map((l) => ({ ...l, to: t.needTo ? l.to ?? defToRef.current : null, from: t.needFrom ? l.from ?? (l.stocks.length === 1 ? l.stocks[0].shelving : null) : l.from })));
  };

  const pickTo = (item: string | null) =>
    navigation.navigate('WarehousePicker', {
      title: 'Rak Tujuan',
      names: shelves.map((x) => x.name),
      labels: Object.fromEntries(shelves.map((x) => [x.name, x.label])),
      onPick: (name: string) => {
        if (item === null) {
          defToRef.current = name;
          setDefTo(name);
          update(ref.current.map((l) => ({ ...l, to: name })));
        } else update(ref.current.map((l) => (l.item === item ? { ...l, to: name } : l)));
      },
    });

  const pickFrom = (l: Line) =>
    navigation.navigate('WarehousePicker', {
      title: 'Rak Asal',
      names: l.stocks.map((x) => x.shelving),
      labels: Object.fromEntries(l.stocks.map((x) => [x.shelving, `${shelfLabelOf(x.shelving)} · stok ${x.qty}`])),
      onPick: (name: string) => update(ref.current.map((x) => (x.item === l.item ? { ...x, from: name } : x))),
    });

  const addItem = useCallback(async (it: Item) => {
    const cur = ref.current;
    const idx = cur.findIndex((l) => l.item === it.name);
    if (idx >= 0) update(cur.map((x, i) => (i === idx ? { ...x, qty: x.qty + 1 } : x)));
    else {
      const stocks = await itemShelfStocks(it.name, whRef.current);
      const t = TYPES.find((x) => x.key === typeRef.current)!;
      if (t.needFrom && !stocks.length) throw new Error(`${it.item_name} tidak punya stok di rak mana pun di gudang ini.`);
      update([
        ...ref.current,
        { item: it.name, item_name: it.item_name, uom: it.stock_uom, qty: 1, stocks, from: stocks.length === 1 ? stocks[0].shelving : null, to: t.needTo ? defToRef.current : null },
      ]);
    }
    setFocusItem(it.name);
  }, []);

  const needWh = () => {
    if (whRef.current) return false;
    setErr('Pilih gudang dulu');
    return true;
  };

  const onScan = useCallback(
    async (code: string) => {
      setErr('');
      if (needWh()) return;
      try {
        const it = await findByBarcode(code);
        if (!it) return setErr(`Barcode ${code} tidak ditemukan`);
        await addItem(it);
        Vibration.vibrate(50);
        setMsg(`+1 ${it.item_name}`);
      } catch (e: any) {
        setErr(e.message);
      }
    },
    [addItem],
  );

  const setQty = (item: string, text: string) => {
    const n = parseFloat(text.replace(',', '.'));
    update(ref.current.map((l) => (l.item === item ? { ...l, qty: isNaN(n) || n < 0 ? 0 : n } : l)));
  };

  const fromQty = (l: Line) => (l.from ? l.stocks.find((x) => x.shelving === l.from)?.qty : undefined);
  const over = lines.filter((l) => fromQty(l) !== undefined && l.qty > (fromQty(l) as number));
  const missingFrom = T.needFrom && lines.some((l) => !l.from);
  const missingTo = T.needTo && lines.some((l) => !l.to);
  const sameShelf = type === 'Pindah Shelving' && lines.some((l) => l.from && l.from === l.to);
  const ready = !!warehouse && lines.length > 0 && !lines.some((l) => l.qty <= 0) && !missingFrom && !missingTo && !sameShelf;

  const submit = () =>
    Alert.alert(`${T.label}?`, `${lines.length} item di\n${warehouse}` + (over.length ? `\n\n⚠ ${over.length} item melebihi stok di rak asal.` : ''), [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Simpan',
        onPress: async () => {
          setBusy(true);
          setErr('');
          try {
            const name = await createShelvingTransfer(type, warehouse, lines.map((l) => ({ item: l.item, qty: l.qty, from: T.needFrom || l.from ? l.from : null, to: T.needTo ? l.to : null })));
            update([]);
            Alert.alert('Berhasil', `${name} tersimpan.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
          } catch (e: any) {
            setErr(e.message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  return (
    <View style={s.screen}>
      <View style={[s.row, { marginBottom: 8 }]}>
        {TYPES.map((x) => (
          <TouchableOpacity
            key={x.key}
            onPress={() => changeType(x.key)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: type === x.key ? c.primary : c.border, backgroundColor: type === x.key ? '#e3eeff' : c.card }}>
            <Text style={{ fontWeight: '700', color: type === x.key ? c.primary : c.text }}>{x.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[s.muted, { marginBottom: 8 }]}>{T.hint}</Text>

      <TouchableOpacity style={[s.card, { marginBottom: 6 }]} onPress={pickWarehouse}>
        <Text style={s.muted}>Gudang</Text>
        <Text style={s.title}>{warehouse || 'Pilih gudang'}</Text>
      </TouchableOpacity>
      {T.needTo && !!warehouse && (
        <TouchableOpacity style={[s.card, { marginBottom: 10 }, !defTo && { borderColor: c.warn }]} onPress={() => pickTo(null)}>
          <Text style={s.muted}>Rak tujuan (wajib, berlaku untuk semua item)</Text>
          <Text style={[s.title, !defTo && { color: c.warn }]}>{defTo ? labelOf(defTo) : 'Pilih rak tujuan'}</Text>
        </TouchableOpacity>
      )}

      <View style={[s.row, { marginBottom: 8 }]}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Cari item manual" value={q} onChangeText={setQ} autoCorrect={false} />
        <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Scanner', { onScan })}>
          <Text style={s.btnText}>Scan</Text>
        </TouchableOpacity>
      </View>
      {!!err && <Text style={s.err}>{err}</Text>}
      {!!msg && !q && <Text style={[s.muted, { marginBottom: 4 }]}>{msg}</Text>}

      {q.trim().length >= 2 ? (
        <FlatList
          data={results}
          keyExtractor={(i) => i.name}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              onPress={async () => {
                if (needWh()) return;
                try {
                  await addItem(item);
                  setQ('');
                } catch (e: any) {
                  setErr(e.message);
                }
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
            data={lines}
            onScrollToIndexFailed={onScrollFail(listRef)}
            keyExtractor={(l) => l.item}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={s.muted}>Belum ada item. Scan barcode atau cari manual.</Text>}
            renderItem={({ item: l, index }) => {
              const fq = fromQty(l);
              const multi = l.stocks.length > 1;
              return (
                <View style={s.card}>
                  <View style={[s.row, { justifyContent: 'space-between' }]}>
                    <Text style={[s.title, { flex: 1 }]}>{index + 1}. {l.item_name}</Text>
                    <TouchableOpacity onPress={() => update(ref.current.filter((x) => x.item !== l.item))}>
                      <Text style={{ color: c.danger, fontSize: 18 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.muted}>{l.item} · {l.uom}</Text>

                  {(T.needFrom || l.stocks.length > 0) && (
                    <TouchableOpacity
                      disabled={!multi}
                      onPress={() => pickFrom(l)}
                      style={{ marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#f1f4f8', borderWidth: 1, borderColor: T.needFrom && !l.from ? c.warn : c.border }}>
                      <Text style={{ color: T.needFrom && !l.from ? c.warn : c.text }}>
                        Rak asal: {l.from ? `${shelfLabelOf(l.from)} (stok ${fq})` : T.needFrom ? 'pilih rak asal (wajib)' : 'tidak dipilih'}
                        {multi ? '  ▾' : ''}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {T.needTo && (
                    <TouchableOpacity
                      onPress={() => pickTo(l.item)}
                      style={{ marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#f1f4f8', borderWidth: 1, borderColor: l.to ? c.border : c.warn }}>
                      <Text style={{ color: l.to ? c.text : c.warn }}>Rak tujuan: {l.to ? labelOf(l.to) : 'pilih rak tujuan (wajib)'}  ▾</Text>
                    </TouchableOpacity>
                  )}

                  <View style={[s.row, { marginTop: 8 }]}>
                    <TouchableOpacity style={[s.btn, s.btnAlt, { paddingHorizontal: 14 }]} onPress={() => setQty(l.item, String(Math.max(0, l.qty - 1)))}>
                      <Text style={[s.btnText, s.btnAltText]}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={[s.input, { width: 90, textAlign: 'center' }, fq !== undefined && l.qty > fq && { borderColor: c.warn }]}
                      ref={(r) => {
                        inputs.current[l.item] = r;
                      }}
                      selectTextOnFocus
                      keyboardType="decimal-pad"
                      defaultValue={String(l.qty)}
                      key={`${l.item}-${l.qty}`}
                      onEndEditing={(e) => setQty(l.item, e.nativeEvent.text)}
                    />
                    <TouchableOpacity style={[s.btn, s.btnAlt, { paddingHorizontal: 14 }]} onPress={() => setQty(l.item, String(l.qty + 1))}>
                      <Text style={[s.btnText, s.btnAltText]}>+</Text>
                    </TouchableOpacity>
                    {fq !== undefined && l.qty > fq && <Text style={{ color: c.warn, marginLeft: 'auto', fontWeight: '600' }}>⚠ stok rak {fq}</Text>}
                  </View>
                </View>
              );
            }}
          />
          {lines.length > 0 && (missingFrom || missingTo || sameShelf) && (
            <Text style={[s.err, { textAlign: 'center', marginBottom: 0 }]}>
              {missingFrom ? 'Pilih rak asal. ' : ''}
              {missingTo ? 'Pilih rak tujuan. ' : ''}
              {sameShelf ? 'Rak asal dan tujuan tidak boleh sama.' : ''}
            </Text>
          )}
          <TouchableOpacity style={[s.btn, { marginTop: 8 }, (!ready || busy) && { opacity: 0.5 }]} onPress={submit} disabled={!ready || busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Simpan {T.label} ({lines.length} item)</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
