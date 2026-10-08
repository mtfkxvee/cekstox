import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { findByBarcode } from '../api';
import { clearReceiveDraft, createReceipt, getPO, loadReceiveDraft, PODoc, POItem, ReceiveLine, saveReceiveDraft } from '../receive';
import { onScrollFail, revealRow } from '../scroll';
import { c, s } from '../ui';

const rp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

/** Penerimaan barang dari PO: daftar mulai kosong, item hanya masuk lewat scan / pilih manual dari item PO. */
export default function ReceiveScreen({ navigation, route }: any) {
  const poName: string = route.params.po;
  const [po, setPo] = useState<PODoc | null>(null);
  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [focusItem, setFocusItem] = useState<string | null>(null);
  const ref = useRef<ReceiveLine[]>([]);
  const poRef = useRef<PODoc | null>(null);
  const inputs = useRef<Record<string, TextInput | null>>({});
  const listRef = useRef<FlatList<ReceiveLine>>(null);

  const update = useCallback(
    (next: ReceiveLine[]) => {
      ref.current = next;
      setLines(next);
      saveReceiveDraft(poName, next);
    },
    [poName],
  );

  useEffect(() => {
    navigation.setOptions({ title: poName });
    Promise.all([getPO(poName), loadReceiveDraft(poName)])
      .then(([p, draft]) => {
        poRef.current = p;
        setPo(p);
        ref.current = draft;
        setLines(draft);
      })
      .catch((e) => setErr(e.message));
  }, [poName, navigation]);

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

  /** PO bisa berisi item yang sama di beberapa baris; digabung per item_code. */
  const poItem = (code: string): ReceiveLine | null => {
    const rows = (poRef.current?.items ?? []).filter((i: POItem) => i.item_code === code);
    if (!rows.length) return null;
    const first = rows[0];
    return {
      item: code,
      item_name: first.item_name,
      uom: first.uom,
      qty: 0,
      poQty: rows.reduce((a, r) => a + r.qty, 0),
      done: rows.reduce((a, r) => a + r.received_qty, 0),
      rate: first.rate,
    };
  };

  const add = useCallback(
    (code: string) => {
      const cur = ref.current;
      const idx = cur.findIndex((l) => l.item === code);
      // sudah ada: qty +1 di tempatnya; baru: ditambah di paling bawah
      if (idx >= 0) update(cur.map((x, i) => (i === idx ? { ...x, qty: x.qty + 1 } : x)));
      else {
        const base = poItem(code);
        if (!base) return false;
        update([...cur, { ...base, qty: 1 }]);
      }
      setFocusItem(code);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [update],
  );

  const onScan = useCallback(
    async (code: string) => {
      setErr('');
      try {
        const it = await findByBarcode(code);
        const itemCode = it?.name ?? code;
        if (!add(itemCode)) return setErr(`${it?.item_name ?? code} tidak ada di PO ini`);
        Vibration.vibrate(50);
        setMsg(`+1 ${it?.item_name ?? code}`);
      } catch (e: any) {
        setErr(e.message);
      }
    },
    [add],
  );

  const setQty = (item: string, text: string) => {
    const n = parseFloat(text.replace(',', '.'));
    update(ref.current.map((l) => (l.item === item ? { ...l, qty: isNaN(n) || n < 0 ? 0 : n } : l)));
  };

  // pilih manual hanya dari item yang ada di PO
  const matches =
    q.trim().length >= 2
      ? Array.from(new Map((po?.items ?? []).filter((i) => (i.item_name + ' ' + i.item_code).toLowerCase().includes(q.trim().toLowerCase())).map((i) => [i.item_code, i])).values())
      : [];

  const over = lines.filter((l) => l.done + l.qty > l.poQty);
  const empty = lines.some((l) => l.qty <= 0);
  const totalQty = lines.reduce((a, l) => a + l.qty, 0);
  const totalAmt = lines.reduce((a, l) => a + l.qty * l.rate, 0);

  const submit = () =>
    Alert.alert(
      'Simpan penerimaan?',
      `${lines.length} item (${totalQty} pcs) dari ${poName}.\nDibuat sebagai draft Purchase Receipt.` +
        (over.length ? `\n\n⚠ ${over.length} item melebihi sisa PO.` : ''),
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Simpan Draft',
          onPress: async () => {
            setBusy(true);
            setErr('');
            try {
              const name = await createReceipt(poName, lines);
              await clearReceiveDraft(poName);
              ref.current = [];
              setLines([]);
              Alert.alert('Berhasil', `Draft ${name} tersimpan. Silakan review & submit di XERP.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
            } catch (e: any) {
              setErr(e.message);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  if (!po) return err ? <Text style={[s.err, { margin: 16 }]}>{err}</Text> : <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <View style={s.screen}>
      <View style={[s.card, { borderColor: c.primary }]}>
        <Text style={s.title}>{po.supplier_name}</Text>
        <Text style={s.muted}>{po.set_warehouse}</Text>
      </View>

      <View style={[s.row, { marginBottom: 8 }]}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Cari item di PO" value={q} onChangeText={setQ} autoCorrect={false} />
        <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Scanner', { onScan })}>
          <Text style={s.btnText}>Scan</Text>
        </TouchableOpacity>
      </View>
      {!!err && <Text style={s.err}>{err}</Text>}
      {!!msg && !q && <Text style={[s.muted, { marginBottom: 4 }]}>{msg}</Text>}

      {q.trim().length >= 2 ? (
        <FlatList
          data={matches}
          keyExtractor={(i) => i.item_code}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={s.muted}>Tidak ada item itu di PO ini.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              onPress={() => {
                add(item.item_code);
                setQ('');
              }}>
              <Text style={s.title}>{item.item_name}</Text>
              <Text style={s.muted}>{item.item_code} · PO {item.qty} {item.uom}</Text>
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
            ListEmptyComponent={<Text style={s.muted}>Belum ada barang diterima. Scan barcode barang yang datang.</Text>}
            renderItem={({ item: l, index }) => {
              const sisa = l.poQty - l.done;
              const lebih = l.done + l.qty > l.poQty;
              return (
                <View style={s.card}>
                  <View style={[s.row, { justifyContent: 'space-between' }]}>
                    <Text style={[s.title, { flex: 1 }]}>{index + 1}. {l.item_name}</Text>
                    <TouchableOpacity onPress={() => update(ref.current.filter((x) => x.item !== l.item))}>
                      <Text style={{ color: c.danger, fontSize: 18 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.muted}>{l.item} · PO {l.poQty} · sudah diterima {l.done} · sisa {sisa} {l.uom}</Text>
                  <Text style={s.muted}>@ {rp(l.rate)}</Text>
                  <View style={[s.row, { marginTop: 8 }]}>
                    <TouchableOpacity style={[s.btn, s.btnAlt, { paddingHorizontal: 14 }]} onPress={() => setQty(l.item, String(Math.max(0, l.qty - 1)))}>
                      <Text style={[s.btnText, s.btnAltText]}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={[s.input, { width: 90, textAlign: 'center' }, lebih && { borderColor: c.warn }]}
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
                    <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
                      <Text style={{ fontWeight: '700' }}>{rp(l.qty * l.rate)}</Text>
                      {lebih && <Text style={{ color: c.warn, fontSize: 12, fontWeight: '600' }}>⚠ melebihi sisa PO</Text>}
                    </View>
                  </View>
                </View>
              );
            }}
          />
          {lines.length > 0 && (
            <View style={[s.row, { justifyContent: 'space-between', paddingVertical: 8 }]}>
              <Text style={s.muted}>{lines.length} item · {totalQty} pcs</Text>
              <Text style={s.title}>{rp(totalAmt)}</Text>
            </View>
          )}
          <TouchableOpacity style={[s.btn, (!lines.length || empty || busy) && { opacity: 0.5 }]} onPress={submit} disabled={!lines.length || empty || busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Simpan Draft Penerimaan</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
