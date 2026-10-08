import { useEffect, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { s } from '../ui';

/** route.params: names (daftar gudang), onPick(warehouse) dipanggil saat dipilih lalu layar menutup. */
export default function WarehousePickerScreen({ navigation, route }: any) {
  const all: string[] = route.params.names;
  const labels: Record<string, string> = route.params.labels ?? {};
  const [q, setQ] = useState('');

  useEffect(() => {
    navigation.setOptions({ title: route.params.title ?? 'Pilih Gudang' });
  }, [navigation, route.params.title]);

  const list = all.filter((w) => (w + ' ' + (labels[w] ?? '')).toLowerCase().includes(q.toLowerCase()) && w !== route.params.exclude);

  return (
    <View style={s.screen}>
      <TextInput style={[s.input, { marginBottom: 12 }]} placeholder="Cari gudang" value={q} onChangeText={setQ} autoCapitalize="none" />
      {!list.length && <Text style={s.muted}>Tidak ada gudang yang diizinkan.</Text>}
      <FlatList
        data={list}
        keyExtractor={(w) => w}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.card}
            onPress={() => {
              route.params.onPick(item);
              navigation.goBack();
            }}>
            <Text style={s.title}>{labels[item] ?? item}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
