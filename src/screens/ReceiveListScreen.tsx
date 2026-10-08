import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDefaultWarehouse, listPOs, PAGE, PORow } from '../receive';
import { c, s } from '../ui';

export default function ReceiveListScreen({ navigation }: any) {
  const [rows, setRows] = useState<PORow[]>([]);
  const [wh, setWh] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(true);
  const [more, setMore] = useState(true);
  const [err, setErr] = useState('');
  const loading = useRef(false);
  const whRef = useRef<string | null>(null);

  const load = useCallback(async (reset: boolean, query: string, current: PORow[]) => {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    setErr('');
    try {
      if (whRef.current === null) {
        whRef.current = await getDefaultWarehouse();
        setWh(whRef.current);
      }
      const data = await listPOs(whRef.current, query, reset ? 0 : current.length);
      setRows(reset ? data : [...current, ...data]);
      setMore(data.length === PAGE);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      loading.current = false;
      setBusy(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(true, q, []);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // cari berdasarkan no. PO / nama supplier
  useEffect(() => {
    const t = setTimeout(() => load(true, q, []), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <View style={s.screen}>
      {wh !== null && (
        <View style={[s.card, { backgroundColor: '#e3eeff', borderColor: '#c5dbff' }]}>
          <Text style={s.muted}>PO yang menunggu barang untuk</Text>
          <Text style={s.title}>{wh || 'semua gudang'}</Text>
        </View>
      )}
      <TextInput style={[s.input, { marginBottom: 10 }]} placeholder="Cari no. PO / supplier" value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} />
      {!!err && <Text style={s.err}>{err}</Text>}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.name}
        refreshing={busy && rows.length === 0}
        onRefresh={() => load(true, q, [])}
        onEndReached={() => more && !busy && load(false, q, rows)}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={!busy ? <Text style={s.muted}>Tidak ada PO yang menunggu penerimaan.</Text> : null}
        ListFooterComponent={busy && rows.length > 0 ? <ActivityIndicator style={{ margin: 12 }} /> : null}
        renderItem={({ item: r }) => (
          <TouchableOpacity style={s.card} onPress={() => navigation.navigate('Receive', { po: r.name })}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.title}>{r.name}</Text>
              <Text style={{ color: r.per_received > 0 ? c.warn : c.muted, fontWeight: '600' }}>{Math.round(r.per_received)}% diterima</Text>
            </View>
            <Text style={{ color: c.text, marginTop: 2 }}>{r.supplier_name}</Text>
            <Text style={s.muted}>{r.transaction_date}{r.schedule_date ? ` · jadwal ${r.schedule_date}` : ''}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
