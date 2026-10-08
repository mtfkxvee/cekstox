import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Switch, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { findByBarcode, Item, searchItems } from '../api';
import { CountLine, submitLocation } from '../opname';
import { onScrollFail, revealRow } from '../scroll';
import { clearDraft, loadDraft, saveDraft } from '../storage';
import { c, s } from '../ui';

/** Hitung buta: qty sistem tidak ditampilkan. Item baru selalu masuk di paling bawah (urutan = urutan input). */
let seq = 0;
const newId = () => `${Date.now()}-${++seq}`;

export default function CountScreen({ navigation, route }: any) {
  const { loc, lokasi }: { loc: string; lokasi: string } = route.params;
  const [lines, setLines] = useState<CountLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [kosong, setKosong] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const ref = useRef<CountLine[]>([]);
  const inputs = useRef<Record<string, TextInput | null>>({});
  const listRef = useRef<FlatList<CountLine>>(null);
  const [focusItem, setFocusItem] = useState<string | null>(null);

  // gulir ke baris yang baru masuk, lalu fokus ke kolom qty-nya
  useEffect(() => {
    if (!focusItem) return;
    const t1 = setTimeout(() => revealRow(listRef.current, ref.current.findIndex((l) => l.id === focusItem), ref.current.length), 150);
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

  // setiap scan/pilih membuat BARIS BARU (tidak menambah qty baris lama), urutan = urutan input
  const addItem = useCallback(
    (it: Item, method: 'Manual' | 'Scan') => {
      const id = newId();
      update([...ref.current, { id, item: it.name, item_name: it.item_name, uom: it.stock_uom, counted: 1, method }]);
      setFocusItem(id);
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
        setMsg(`Baris baru: ${it.item_name}`);
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

  const setCounted = (id: string, text: string) => {
    const n = parseFloat(text.replace(',', '.'));
    update(ref.current.map((l) => (l.id === id ? { ...l, counted: isNaN(n) || n < 0 ? 0 : n } : l)));
  };
  const setNote = (id: string, notes: string) => update(ref.current.map((l) => (l.id === id ? { ...l, notes } : l)));
  const remove = (id: string) => update(ref.current.filter((l) => l.id !== id));

  const toggleKosong = (on: boolean) => {
    if (on && lines.length)
      return Alert.alert('Tandai lokasi kosong?', `${lines.length} item yang sudah dihitung akan dihapus.`, [
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

  const zeroNoNote = lines.find((l) => l.counted === 0 && !(l.notes ?? '').trim());
  const canSubmit = !busy && (kosong || (lines.length > 0 && !zeroNoNote));

  const submit = () =>
    Alert.alert('Submit hasil hitung?', (kosong ? `${lokasi} ditandai kosong.` : `${lines.length} item di ${lokasi}.`) + ' Setelah submit masih bisa diedit sampai divalidasi.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Submit',
        onPress: async () => {
          setBusy(true);
          setErr('');
          try {
            await submitLocation(loc, lines, kosong);
            await clearDraft(loc);
            Alert.alert('Berhasil', `${lokasi} terkirim, menunggu cek ulang.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
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
      <View style={[s.card, s.row, { justifyContent: 'space-between', paddingVertical: 8 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Lokasi Kosong</Text>
          <Text style={s.muted}>Centang jika lokasi ini memang tidak ada barang</Text>
        </View>
        <Switch value={kosong} onValueChange={toggleKosong} />
      </View>

      {kosong ? (
        <>
          <Text style={[s.muted, { flex: 1, textAlign: 'center', marginTop: 24 }]}>Lokasi ditandai kosong, tidak perlu menambah item.</Text>
          {!!err && <Text style={s.err}>{err}</Text>}
        </>
      ) : (
        <>
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
            <FlatList
              ref={listRef}
              data={lines}
              keyExtractor={(l) => l.id}
              keyboardShouldPersistTaps="handled"
              onScrollToIndexFailed={onScrollFail(listRef)}
              ListEmptyComponent={<Text style={s.muted}>Belum ada item. Scan barcode atau cari manual.</Text>}
              renderItem={({ item: l, index }) => (
                <View style={s.card}>
                  <View style={[s.row, { justifyContent: 'space-between' }]}>
                    <Text style={[s.title, { flex: 1 }]}>{index + 1}. {l.item_name}</Text>
                    <TouchableOpacity onPress={() => remove(l.id)}>
                      <Text style={{ color: c.danger, fontSize: 18 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.muted}>{l.item} · {l.uom}</Text>
                  <View style={[s.row, { marginTop: 8 }]}>
                    <TouchableOpacity style={[s.btn, s.btnAlt, { paddingHorizontal: 14 }]} onPress={() => setCounted(l.id, String(Math.max(0, l.counted - 1)))}>
                      <Text style={[s.btnText, s.btnAltText]}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={[s.input, { width: 90, textAlign: 'center' }]}
                      ref={(r) => {
                        inputs.current[l.id] = r;
                      }}
                      selectTextOnFocus
                      keyboardType="decimal-pad"
                      defaultValue={String(l.counted)}
                      key={`${l.id}-${l.counted}`}
                      onEndEditing={(e) => setCounted(l.id, e.nativeEvent.text)}
                    />
                    <TouchableOpacity style={[s.btn, s.btnAlt, { paddingHorizontal: 14 }]} onPress={() => setCounted(l.id, String(l.counted + 1))}>
                      <Text style={[s.btnText, s.btnAltText]}>+</Text>
                    </TouchableOpacity>
                    <Text style={[s.muted, { marginLeft: 'auto' }]}>{l.method}</Text>
                  </View>
                  {l.counted === 0 && (
                    <TextInput
                      style={[s.input, { marginTop: 8 }, !(l.notes ?? '').trim() && { borderColor: c.warn }]}
                      placeholder="Catatan wajib untuk qty 0 (mis. kosong)"
                      value={l.notes ?? ''}
                      onChangeText={(t) => setNote(l.id, t)}
                    />
                  )}
                </View>
              )}
            />
          )}
        </>
      )}

      {(kosong || q.trim().length < 2) && (
        <TouchableOpacity style={[s.btn, { marginTop: 8 }, !canSubmit && { opacity: 0.5 }]} onPress={submit} disabled={!canSubmit}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{kosong ? 'Submit Lokasi Kosong' : `Submit (${lines.length} item)`}</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}
