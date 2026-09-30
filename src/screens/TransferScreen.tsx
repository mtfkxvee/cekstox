import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { createTransfer, findByBarcode, getAvailable, Item, searchItems, TransferLine } from '../api';
import { loadTransferRules, TransferRules } from '../transferRules';
import { c, s } from '../ui';

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
  const ref = useRef<TransferLine[]>([]);
  const fromRef = useRef('');
  const [rules, setRules] = useState<TransferRules | null>(null);

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

  useEffect(() => {
    if (!focusItem) return;
    const t = setTimeout(() => {
      inputs.current[focusItem]?.focus();
      setFocusItem(null);
    }, 400);
    return () => clearTimeout(t);
  }, [focusItem, lines]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => searchItems(q).then(setResults).catch((e) => setErr(e.message)), 400);
    return () => clearTimeout(t);
  }, [q]);

  const pickWarehouse = (kind: 'from' | 'to') =>
    rules &&
    navigation.navigate('WarehousePicker', {
      title: kind === 'from' ? 'Gudang Asal' : 'Gudang Tujuan',
      names: ((kind === 'from' ? rules?.fromOptions : rules?.toOptions) ?? []),
      exclude: kind === 'from' ? to : from,
      onPick: async (w: string) => {
        if (kind === 'to') return setTo(w);
        setFrom(w);
        fromRef.current = w;
        // stok tersedia dihitung ulang terhadap gudang asal yang baru
        try {
          const upd = await Promise.all(ref.current.map(async (l) => ({ ...l, avail: await getAvailable(l.item, w) })));
          if (fromRef.current === w) update(upd);
        } catch (e: any) {
          setErr(e.message);
        }
      },
    });

  const addItem = useCallback(async (it: Item) => {
    const cur = ref.current;
    const idx = cur.findIndex((l) => l.item === it.name);
    if (idx >= 0) update([{ ...cur[idx], qty: cur[idx].qty + 1 }, ...cur.filter((_, i) => i !== idx)]);
    else {
      const avail = await getAvailable(it.name, fromRef.current);
      update([{ item: it.name, item_name: it.item_name, uom: it.stock_uom, qty: 1, avail }, ...ref.current]);
    }
    setFocusItem(it.name);
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

  // stok asal kurang hanya diberi peringatan; XERP mengizinkan stok minus
  const short = lines.filter((l) => l.qty > l.avail);
  const invalid = lines.some((l) => l.qty <= 0);
  const ready = !!from && !!to && lines.length > 0 && !invalid;

  const submit = () =>
    Alert.alert('Pindahkan stok?', `${lines.length} item dari\n${from}\nke\n${to}` + (short.length ? `\n\n⚠ ${short.length} item melebihi stok di gudang asal, stok asal akan menjadi minus.` : ''), [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Pindahkan',
        onPress: async () => {
          setBusy(true);
          setErr('');
          try {
            const name = await createTransfer(from, to, lines, {
              costCenter: rules?.costCenter,
            });
            update([]);
            Alert.alert('Berhasil', `Stock Entry ${name} tersimpan.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
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
      <TouchableOpacity style={[s.card, { marginBottom: 6 }]} onPress={() => pickWarehouse('from')}>
        <Text style={s.muted}>Dari gudang</Text>
        <Text style={s.title}>{from || 'Pilih gudang asal'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.card, { marginBottom: 10 }]} onPress={() => pickWarehouse('to')}>
        <Text style={s.muted}>Ke gudang</Text>
        <Text style={s.title}>{to || 'Pilih gudang tujuan'}</Text>
      </TouchableOpacity>

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
            data={lines}
            keyExtractor={(l) => l.item}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={s.muted}>Belum ada item. Scan barcode atau cari manual.</Text>}
            renderItem={({ item: l }) => (
              <View style={s.card}>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <Text style={[s.title, { flex: 1 }]}>{l.item_name}</Text>
                  <TouchableOpacity onPress={() => update(ref.current.filter((x) => x.item !== l.item))}>
                    <Text style={{ color: c.danger, fontSize: 18 }}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.muted}>{l.item} · stok asal {l.avail} {l.uom}</Text>
                <View style={[s.row, { marginTop: 8 }]}>
                  <TouchableOpacity style={[s.btn, s.btnAlt, { paddingHorizontal: 14 }]} onPress={() => setQty(l.item, String(Math.max(0, l.qty - 1)))}>
                    <Text style={[s.btnText, s.btnAltText]}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[s.input, { width: 90, textAlign: 'center' }, l.qty > l.avail && { borderColor: c.warn }]}
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
                  {l.qty > l.avail && <Text style={{ color: c.warn, marginLeft: 'auto', fontWeight: '600' }}>⚠ stok asal {l.avail}, jadi {l.avail - l.qty}</Text>}
                </View>
              </View>
            )}
          />
          <TouchableOpacity style={[s.btn, { marginTop: 8 }, (!ready || busy) && { opacity: 0.5 }]} onPress={submit} disabled={!ready || busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Pindahkan ({lines.length} item)</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
