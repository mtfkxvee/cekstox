import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { listOpnames, Opname } from '../opname';
import { s } from '../ui';

export default function OpnameListScreen({ navigation }: any) {
  const [list, setList] = useState<Opname[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    setBusy(true);
    setErr('');
    listOpnames()
      .then(setList)
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  }, []);
  useFocusEffect(load);

  return (
    <View style={s.screen}>
      {busy && <ActivityIndicator style={{ marginBottom: 8 }} />}
      {!!err && <Text style={s.err}>{err}</Text>}
      <FlatList
        data={list}
        keyExtractor={(o) => o.name}
        refreshing={busy}
        onRefresh={load}
        ListEmptyComponent={!busy ? <Text style={s.muted}>Belum ada sesi Stok Opname yang berjalan.</Text> : null}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => navigation.navigate('OpnameDetail', { name: item.name })}>
            <Text style={s.title}>{item.warehouse}</Text>
            <Text style={s.muted}>{item.name} · {item.opname_date} · {item.jumlah_lokasi} lokasi</Text>
            <Text style={s.muted}>{item.status}</Text>
            {!!item.notes && <Text style={s.muted}>{item.notes}</Text>}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
