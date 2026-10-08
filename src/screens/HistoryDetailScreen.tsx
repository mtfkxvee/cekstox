import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { cancelEntry, getEntry } from '../history';
import { canCancelEntry } from '../opname';
import { shelfLabelOf } from '../shelving';
import { c, s } from '../ui';
import { STATUS, STATUS_COLOR } from './HistoryScreen';

export default function HistoryDetailScreen({ navigation, route }: any) {
  const name: string = route.params.name;
  const [doc, setDoc] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: name });
    getEntry(name).then(setDoc).catch((e) => setErr(e.message));
  }, [name, navigation]);

  const doCancel = () =>
    Alert.alert('Batalkan pindah stok?', `${name}
Stok akan dikembalikan: gudang asal bertambah, gudang tujuan berkurang.`, [
      { text: 'Tidak', style: 'cancel' },
      {
        text: 'Batalkan',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setErr('');
          try {
            await cancelEntry(name);
            setDoc(await getEntry(name));
          } catch (e: any) {
            setErr(e.message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  if (!doc) return err ? <Text style={[s.err, { margin: 16 }]}>{err}</Text> : <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <View style={s.screen}>
      <View style={[s.card, { borderColor: c.primary }]}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={s.muted}>{doc.posting_date} {String(doc.posting_time).slice(0, 5)}</Text>
          <Text style={{ color: STATUS_COLOR[doc.docstatus], fontWeight: '700' }}>{STATUS[doc.docstatus]}</Text>
        </View>
        <Text style={[s.muted, { marginTop: 6 }]}>Dari</Text>
        <Text style={s.title}>{doc.from_warehouse || '-'}</Text>
        <Text style={[s.muted, { marginTop: 6 }]}>Ke</Text>
        <Text style={s.title}>{doc.to_warehouse || '-'}</Text>
        <Text style={[s.muted, { marginTop: 6 }]}>Dibuat oleh {doc.owner}</Text>
      </View>
      {!!err && <Text style={s.err}>{err}</Text>}
      <FlatList
        data={doc.items ?? []}
        keyExtractor={(i: any) => i.name}
        renderItem={({ item }: any) => (
          <View style={[s.card, s.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{item.item_name}</Text>
              <Text style={s.muted}>{item.item_code}</Text>
              {(!!item.from_shelving || !!item.to_shelving) && (
                <Text style={s.muted}>
                  Rak: {item.from_shelving ? shelfLabelOf(item.from_shelving) : '-'} → {item.to_shelving ? shelfLabelOf(item.to_shelving) : '-'}
                </Text>
              )}
            </View>
            <Text style={{ fontSize: 18, fontWeight: '700' }}>{item.qty} <Text style={s.muted}>{item.uom}</Text></Text>
          </View>
        )}
      />
      {doc.docstatus === 1 && canCancelEntry() && (
        <TouchableOpacity style={[s.btn, { backgroundColor: c.danger, marginTop: 8 }, busy && { opacity: 0.5 }]} disabled={busy} onPress={doCancel}>
          {busy ? <ActivityIndicator color='#fff' /> : <Text style={s.btnText}>Batalkan Pindah Stok</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}
