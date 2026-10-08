import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { createTransfer, findByBarcode, getAvailable, Item, searchItems, TransferLine } from '../api';
import { onScrollFail, revealRow } from '../scroll';
import { itemShelfStocks, listShelves, Shelf, shelfLabelOf } from '../shelving';
import { loadTransferRules, TransferRules } from '../transferRules';
import { c, s } from '../ui';

let seq = 0;
const newId = () => `${Date.now()}-${++seq}`;

export default function TransferScreen({ navigation }: any) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [focusItem, setFocusItem] = useState<string | null>(null);
  const inputs = useRef<Record<string, TextInput | null>>({});
  const listRef = useRef<FlatList<TransferLine>>(null);
  const ref = useRef<TransferLine[]>([]);
  const fromRef = useRef('');
  const [rules, setRules] = useState<TransferRules | null>(null);
  const [toShelves, setToShelves] = useState<Shelf[]>([]);
  const [defTo, setDefTo] = useState<string | null>(null);
  const defToRef = useRef<string | null>(null);

  const usesShelving = (w: string) => !!rules?.warehouses.find((x) => x.name === w)?.useShelving;
  const fromUses = !!from && usesShelving(from);
  const toUses = !!to && usesShelving(to);

  // aturan default gudang/cost center mengikuti outlet user di XERP
  useEffect(() => {
    loadTransferRules()
      .then((r) => {
        setRules(r);
        if (r.defaultFrom && !fromRef.current) {
          fromRef.current = r.defaultFrom;
          setFrom(r.defaultFrom);
        }
      })
      .catch((e) => setErr(e.message));
  }, []);

  const update = (next: TransferLine[]) => {
    ref.current = next;
    setLines(next);
  };

  const fromUsesRef = useRef(false);
  fromUsesRef.current = fromUses;

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
  }, [focusItem, lines]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => searchItems(q).then(setResults).catch((e) => setErr(e.message)), 400);
    return () => clearTimeout(t);
  }, [q]);

  const labelOfTo = (name: string | null | undefined) => (name ? toShelves.find((x) => x.name === name)?.label ?? shelfLabelOf(name) : '');

  /** Muat stok per rak untuk satu item di gudang asal; satu-satunya rak berisi dipilih otomatis. */
  const withStocks = async (l: TransferLine, warehouse: string, uses: boolean): Promise<TransferLine> => {
    if (!uses) return { ...l, stocks: undefined, fromShelving: null };
    const stocks = await itemShelfStocks(l.item, warehouse);
    return { ...l, stocks, fromShelving: stocks.length === 1 ? stocks[0].shelving : null };
  };

  const pickWarehouse = (kind: 'from' | 'to') =>
    rules &&
    navigation.navigate('WarehousePicker', {
      title: kind === 'from' ? 'Gudang Asal' : 'Gudang Tujuan',
      names: (kind === 'from' ? rules.fromOptions : rules.toOptions) ?? [],
      exclude: kind === 'from' ? to : from,
      onPick: async (w: string) => {
        setErr('');
        try {
          if (kind === 'to') {
            setTo(w);
            // rak tujuan harus dipilih ulang untuk gudang tujuan yang baru
            defToRef.current = null;
            setDefTo(null);
            update(ref.current.map((l) => ({ ...l, toShelving: null })));
            setToShelves(rules.warehouses.find((x) => x.name === w)?.useShelving ? await listShelves(w) : []);
            return;
          }
          setFrom(w);
          fromRef.current = w;
          const uses = !!rules.warehouses.find((x) => x.name === w)?.useShelving;
          // stok tersedia & stok per rak dihitung ulang terhadap gudang asal yang baru
          const upd = await Promise.all(ref.current.map(async (l) => withStocks({ ...l, avail: await getAvailable(l.item, w) }, w, uses)));
          if (fromRef.current === w) update(upd);
        } catch (e: any) {
          setErr(e.message);
        }
      },
    });

  /** Pilih rak tujuan untuk semua item (header) atau satu item (item != null). */
  const pickToShelf = (id: string | null) =>
    navigation.navigate('WarehousePicker', {
      title: 'Rak Tujuan',
      names: toShelves.map((x) => x.name),
      labels: Object.fromEntries(toShelves.map((x) => [x.name, x.label])),
      onPick: (name: string) => {
        if (id === null) {
          defToRef.current = name;
          setDefTo(name);
          update(ref.current.map((l) => ({ ...l, toShelving: name })));
        } else update(ref.current.map((l) => (l.id === id ? { ...l, toShelving: name } : l)));
      },
    });

  const pickFromShelf = (l: TransferLine) =>
    navigation.navigate('WarehousePicker', {
      title: 'Rak Asal',
      names: (l.stocks ?? []).map((x) => x.shelving),
      labels: Object.fromEntries((l.stocks ?? []).map((x) => [x.shelving, `${shelfLabelOf(x.shelving)} · stok ${x.qty}`])),
      onPick: (name: string) => update(ref.current.map((x) => (x.id === l.id ? { ...x, fromShelving: name } : x))),
    });

  // setiap scan/pilih membuat BARIS BARU (tidak menambah qty baris lama), karena rak tujuan bisa berbeda
  const addItem = useCallback(async (it: Item) => {
    const avail = await getAvailable(it.name, fromRef.current);
    const id = newId();
    const base: TransferLine = { id, item: it.name, item_name: it.item_name, uom: it.stock_uom, qty: 1, avail, toShelving: defToRef.current };
    update([...ref.current, await withStocks(base, fromRef.current, fromUsesRef.current)]);
    setFocusItem(id);
  }, []);

  const needFrom = () => {
    if (fromRef.current) return false;
    setErr('Pilih gudang asal dulu');
    return true;
  };

  const onScan = useCallback(
    async (code: string) => {
      setErr('');
      if (needFrom()) return;
      try {
        const it = await findByBarcode(code);
        if (!it) return setErr(`Barcode ${code} tidak ditemukan`);
        Vibration.vibrate(50);
        await addItem(it);
        setMsg(`Baris baru: ${it.item_name}`);
      } catch (e: any) {
        setErr(e.message);
      }
    },
    [addItem],
  );

  const setQty = (id: string, text: string) => {
    const n = parseFloat(text.replace(',', '.'));
    update(ref.current.map((l) => (l.id === id ? { ...l, qty: isNaN(n) || n < 0 ? 0 : n } : l)));
  };

  // stok asal / stok rak kurang hanya diberi peringatan; XERP mengizinkan stok minus
  const shelfQty = (l: TransferLine) => (l.fromShelving ? l.stocks?.find((x) => x.shelving === l.fromShelving)?.qty : undefined);
  const totalOf = (item: string) => lines.reduce((a, x) => (x.item === item ? a + x.qty : a), 0);
  const short = lines.filter((l, i) => totalOf(l.item) > l.avail && lines.findIndex((x) => x.item === l.item) === i);
  const shortShelf = lines.filter((l) => shelfQty(l) !== undefined && l.qty > (shelfQty(l) as number));
  const invalid = lines.some((l) => l.qty <= 0);
  // rak tujuan wajib bila gudang tujuan memakai rak; rak asal wajib bila item ada di lebih dari satu rak
  const needsTo = toUses && lines.some((l) => !l.toShelving);
  const needsFromShelf = fromUses && lines.some((l) => (l.stocks?.length ?? 0) > 1 && !l.fromShelving);
  const ready = !!from && !!to && lines.length > 0 && !invalid && !needsTo && !needsFromShelf;

  const submit = () =>
    Alert.alert(
      'Pindahkan stok?',
      `${lines.length} item dari\n${from}\nke\n${to}` +
        (short.length ? `\n\n⚠ ${short.length} item melebihi stok di gudang asal, stok asal akan menjadi minus.` : '') +
        (shortShelf.length ? `\n⚠ ${shortShelf.length} item melebihi stok di rak asal.` : ''),
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Pindahkan',
          onPress: async () => {
            setBusy(true);
            setErr('');
            try {
              const name = await createTransfer(from, to, lines, { costCenter: rules?.costCenter });
              update([]);
              Alert.alert('Berhasil', `Stock Entry ${name} tersimpan.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
            } catch (e: any) {
              setErr(e.message);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  return (
    <View style={s.screen}>
      <TouchableOpacity style={[s.card, { marginBottom: 6 }]} onPress={() => pickWarehouse('from')}>
        <Text style={s.muted}>Dari gudang{fromUses ? ' · memakai rak' : ''}</Text>
        <Text style={s.title}>{from || 'Pilih gudang asal'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.card, { marginBottom: toUses ? 6 : 10 }]} onPress={() => pickWarehouse('to')}>
        <Text style={s.muted}>Ke gudang{toUses ? ' · memakai rak' : ''}</Text>
        <Text style={s.title}>{to || 'Pilih gudang tujuan'}</Text>
      </TouchableOpacity>
      {toUses && (
        <TouchableOpacity style={[s.card, { marginBottom: 10 }, !defTo && { borderColor: c.warn }]} onPress={() => pickToShelf(null)}>
          <Text style={s.muted}>Rak tujuan (wajib, berlaku untuk semua item)</Text>
          <Text style={[s.title, !defTo && { color: c.warn }]}>{defTo ? labelOfTo(defTo) : 'Pilih rak tujuan'}</Text>
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
                if (needFrom()) return;
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
            keyExtractor={(l) => l.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={s.muted}>Belum ada item. Scan barcode atau cari manual.</Text>}
            renderItem={({ item: l, index }) => {
              const sq = shelfQty(l);
              const overShelf = sq !== undefined && l.qty > sq;
              const multi = (l.stocks?.length ?? 0) > 1;
              return (
                <View style={s.card}>
                  <View style={[s.row, { justifyContent: 'space-between' }]}>
                    <Text style={[s.title, { flex: 1 }]}>{index + 1}. {l.item_name}</Text>
                    <TouchableOpacity onPress={() => update(ref.current.filter((x) => x.id !== l.id))}>
                      <Text style={{ color: c.danger, fontSize: 18 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.muted}>{l.item} · stok asal {l.avail} {l.uom}</Text>

                  {fromUses && (l.stocks?.length ?? 0) > 0 && (
                    <TouchableOpacity
                      disabled={!multi}
                      onPress={() => pickFromShelf(l)}
                      style={{ marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#f1f4f8', borderWidth: 1, borderColor: multi && !l.fromShelving ? c.warn : c.border }}>
                      <Text style={{ color: multi && !l.fromShelving ? c.warn : c.text }}>
                        Rak asal: {l.fromShelving ? `${shelfLabelOf(l.fromShelving)} (stok ${sq})` : 'pilih rak asal (wajib)'}
                        {multi ? '  ▾' : ''}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {toUses && (
                    <TouchableOpacity
                      onPress={() => pickToShelf(l.id)}
                      style={{ marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#f1f4f8', borderWidth: 1, borderColor: l.toShelving ? c.border : c.warn }}>
                      <Text style={{ color: l.toShelving ? c.text : c.warn }}>Rak tujuan: {l.toShelving ? labelOfTo(l.toShelving) : 'pilih rak tujuan (wajib)'}  ▾</Text>
                    </TouchableOpacity>
                  )}

                  <View style={[s.row, { marginTop: 8 }]}>
                    <TouchableOpacity style={[s.btn, s.btnAlt, { paddingHorizontal: 14 }]} onPress={() => setQty(l.id, String(Math.max(0, l.qty - 1)))}>
                      <Text style={[s.btnText, s.btnAltText]}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={[s.input, { width: 90, textAlign: 'center' }, (totalOf(l.item) > l.avail || overShelf) && { borderColor: c.warn }]}
                      ref={(r) => {
                        inputs.current[l.id] = r;
                      }}
                      selectTextOnFocus
                      keyboardType="decimal-pad"
                      defaultValue={String(l.qty)}
                      key={`${l.id}-${l.qty}`}
                      onEndEditing={(e) => setQty(l.id, e.nativeEvent.text)}
                    />
                    <TouchableOpacity style={[s.btn, s.btnAlt, { paddingHorizontal: 14 }]} onPress={() => setQty(l.id, String(l.qty + 1))}>
                      <Text style={[s.btnText, s.btnAltText]}>+</Text>
                    </TouchableOpacity>
                    <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
                      {totalOf(l.item) > l.avail && <Text style={{ color: c.warn, fontWeight: '600' }}>⚠ stok asal {l.avail}, total item ini {totalOf(l.item)}</Text>}
                      {overShelf && <Text style={{ color: c.warn, fontWeight: '600' }}>⚠ stok rak {sq}</Text>}
                    </View>
                  </View>
                </View>
              );
            }}
          />
          {(needsTo || needsFromShelf) && lines.length > 0 && (
            <Text style={[s.err, { textAlign: 'center', marginBottom: 0 }]}>
              {needsTo ? 'Pilih rak tujuan dulu. ' : ''}
              {needsFromShelf ? 'Pilih rak asal untuk item yang ada di beberapa rak.' : ''}
            </Text>
          )}
          <TouchableOpacity style={[s.btn, { marginTop: 8 }, (!ready || busy) && { opacity: 0.5 }]} onPress={submit} disabled={!ready || busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Pindahkan ({lines.length} item)</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
