import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { findByBarcode, Item, searchItems } from '../api';
import { CountLine, submitLocation } from '../opname';
import { clearDraft, loadDraft, saveDraft } from '../storage';
import { c, s } from '../ui';

/** Hitung buta: qty sistem tidak ditampilkan. */
export default function CountScreen({ navigation, route }: any) {
  const { loc, lokasi }: { loc: string; lokasi: string } = route.params;
  const [lines, setLines] = useState<CountLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const ref = useRef<CountLine[]>([]);
  const inputs = useRef<Record<string, TextInput | null>>({});
  const [focusItem, setFocusItem] = useState<string | null>(null);

  // tunggu layar scanner tertutup & list ter-render, baru fokus ke kolom qty
  useEffect(() => {
    if (!focusItem) return;
    const t = setTimeout(() => {
      inputs.current[focusItem]?.focus();
      setFocusItem(null);
    }, 400);
    return () => clearTimeout(t);
  }, [focusItem, lines]);

  useEffect(() => {
    navigation.setOptions({ title: lokasi });
    loadDraft(loc).then((l) => {
      ref.current = l;
      setLines(l);
      setLoaded(true);
    });
  }, [loc, lokasi, navigation]);

  const update = useCallback(
    (next: CountLine[]) => {
      ref.current = next;
      setLines(next);
      saveDraft(loc, next);
    },
    [loc],
  );

  const addItem = useCallback(
    (it: Item, method: 'Manual' | 'Scan') => {
      const cur = ref.current;
      const idx = cur.findIndex((l) => l.item === it.name);
      // item yang baru di-scan dipindah ke paling atas, lalu kursor diarahkan ke kolom qty-nya
      if (idx >= 0) {
        const l = cur[idx];
        update([{ ...l, counted: l.counted + 1, method: method === 'Scan' ? 'Scan' : l.method }, ...cur.filter((_, i) => i !== idx)]);
      } else update([{ item: it.name, item_name: it.item_name, uom: it.stock_uom, counted: 1, method }, ...cur]);
      setFocusItem(it.name);
    },
    [update],
  );

  const onScan = useCallback(
    async (code: string) => {
      setErr('');
      try {
        const it = await findByBarcode(code);
        if (!it) return setErr(`Barcode ${code} tidak ditemukan`);
        Vibration.vibrate(50);
        addItem(it, 'Scan');
        setMsg(`+1 ${it.item_name}`);
      } catch (e: any) {
        setErr(e.message);
      }
    },
    [addItem],
  );

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => searchItems(q).then(setResults).catch((e) => setErr(e.message)), 400);
    return () => clearTimeout(t);
  }, [q]);

  const setCounted = (item: string, text: string) => {
    const n = parseFloat(text.replace(',', '.'));
    update(ref.current.map((l) => (l.item === item ? { ...l, counted: isNaN(n) || n < 0 ? 0 : n } : l)));
  };
  const remove = (item: string) => update(ref.current.filter((l) => l.item !== item));

  const submit = () =>
    Alert.alert('Submit hasil hitung?', `${lines.length} item di ${lokasi}. Setelah submit tidak bisa diubah.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Submit',
        onPress: async () => {
          setBusy(true);
          setErr('');
          try {
            await submitLocation(loc, lines);
            await clearDraft(loc);
            Alert.alert('Berhasil', `${lokasi} terkirim, menunggu validasi.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
          } catch (e: any) {
            setErr(e.message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  if (!loaded) return <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <View style={s.screen}>
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
            data={lines}
            keyExtractor={(l) => l.item}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={s.muted}>Belum ada item. Scan barcode atau cari manual.</Text>}
            renderItem={({ item: l }) => (
              <View style={s.card}>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <Text style={[s.title, { flex: 1 }]}>{l.item_name}</Text>
                  <TouchableOpacity onPress={() => remove(l.item)}>
                    <Text style={{ color: c.danger, fontSize: 18 }}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.muted}>{l.item} · {l.uom}</Text>
                <View style={[s.row, { marginTop: 8 }]}>
                  <TouchableOpacity style={[s.btn, s.btnAlt, { paddingHorizontal: 14 }]} onPress={() => setCounted(l.item, String(Math.max(0, l.counted - 1)))}>
                    <Text style={[s.btnText, s.btnAltText]}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[s.input, { width: 90, textAlign: 'center' }]}
                    ref={(r) => {
                      inputs.current[l.item] = r;
                    }}
                    selectTextOnFocus
                    keyboardType="decimal-pad"
                    defaultValue={String(l.counted)}
                    key={`${l.item}-${l.counted}`}
                    onEndEditing={(e) => setCounted(l.item, e.nativeEvent.text)}
                  />
                  <TouchableOpacity style={[s.btn, s.btnAlt, { paddingHorizontal: 14 }]} onPress={() => setCounted(l.item, String(l.counted + 1))}>
                    <Text style={[s.btnText, s.btnAltText]}>+</Text>
                  </TouchableOpacity>
                  <Text style={[s.muted, { marginLeft: 'auto' }]}>{l.method}</Text>
                </View>
              </View>
            )}
          />
          <TouchableOpacity style={[s.btn, { marginTop: 8 }, (!lines.length || busy) && { opacity: 0.5 }]} onPress={submit} disabled={!lines.length || busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Submit ({lines.length} item)</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
