import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { getHistoryScope, HistoryRow, HistoryScope, listHistory, PAGE } from '../history';
import { c, s } from '../ui';

export const STATUS = ['Draft', 'Selesai', 'Dibatalkan'] as const;
export const STATUS_COLOR = [c.warn, c.ok, c.danger];

export default function HistoryScreen({ navigation }: any) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [scope, setScope] = useState<HistoryScope | null>(null);
  const [busy, setBusy] = useState(true);
  const [more, setMore] = useState(true);
  const [err, setErr] = useState('');
  const loading = useRef(false);

  const load = useCallback(async (reset: boolean) => {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    setErr('');
    try {
      const sc = reset || !scope ? await getHistoryScope() : scope;
      setScope(sc);
      const start = reset ? 0 : rows.length;
      const data = await listHistory(sc, start);
      setRows(reset ? data : [...rows, ...data]);
      setMore(data.length === PAGE);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      loading.current = false;
      setBusy(false);
    }
  }, [rows, scope]);

  useFocusEffect(
    useCallback(() => {
      load(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <View style={s.screen}>
      {scope && (
        <View style={[s.card, { backgroundColor: '#e3eeff', borderColor: '#c5dbff' }]}>
          <Text style={s.muted}>Tipe PINDAH STOK · {scope.warehouse ? 'gudang' : 'milik Anda'}</Text>
          <Text style={s.title}>{scope.warehouse || scope.user}</Text>
        </View>
      )}
      {!!err && <Text style={s.err}>{err}</Text>}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.name}
        refreshing={busy && rows.length === 0}
        onRefresh={() => load(true)}
        onEndReached={() => more && !busy && load(false)}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={!busy ? <Text style={s.muted}>Belum ada riwayat pindah stok.</Text> : null}
        ListFooterComponent={busy && rows.length > 0 ? <ActivityIndicator style={{ margin: 12 }} /> : null}
        renderItem={({ item: r }) => {
          const out = !!scope?.warehouse && r.from_warehouse === scope.warehouse;
          return (
            <TouchableOpacity style={s.card} onPress={() => navigation.navigate('HistoryDetail', { name: r.name })}>
              <View style={[s.row, { justifyContent: 'space-between' }]}>
                <Text style={s.title}>{r.name}</Text>
                <Text style={{ color: STATUS_COLOR[r.docstatus], fontWeight: '600' }}>{STATUS[r.docstatus]}</Text>
              </View>
              <Text style={s.muted}>{r.posting_date} {String(r.posting_time).slice(0, 5)} · {r.owner}</Text>
              <Text style={{ marginTop: 6, color: c.text }}>
                {scope?.warehouse ? (out ? '⬆ Keluar ke ' : '⬇ Masuk dari ') : ''}
                {scope?.warehouse ? (out ? r.to_warehouse : r.from_warehouse) : `${r.from_warehouse} → ${r.to_warehouse}`}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}
