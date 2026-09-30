import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getLocation, rejectLocation, validateLocation } from '../opname';
import { c, s } from '../ui';

export default function ReviewScreen({ navigation, route }: any) {
  const { loc, lokasi, manager }: { loc: string; lokasi: string; manager: boolean } = route.params;
  const [doc, setDoc] = useState<any>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    navigation.setOptions({ title: lokasi });
    getLocation(loc)
      .then(setDoc)
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  }, [loc, lokasi, navigation]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      navigation.goBack();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const validate = () =>
    Alert.alert('Validasi lokasi ini?', `${lokasi} dinyatakan benar.`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Validasi', onPress: () => act(() => validateLocation(loc)) },
    ]);

  return (
    <View style={s.screen}>
      {busy && <ActivityIndicator />}
      {!!err && <Text style={s.err}>{err}</Text>}
      {doc && (
        <Text style={[s.muted, { marginBottom: 8 }]}>
          {doc.validation_status ?? (doc.docstatus === 0 ? 'Draft' : '-')} · dihitung {doc.counted_by ?? '-'}
          {doc.validated_by ? ` · divalidasi ${doc.validated_by}` : ''}
        </Text>
      )}
      <FlatList
        data={doc?.items ?? []}
        keyExtractor={(i: any) => i.name}
        renderItem={({ item }: any) => (
          <View style={[s.card, s.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{item.item_name}</Text>
              <Text style={s.muted}>{item.item_code} · {item.input_method}</Text>
            </View>
            <Text style={{ fontSize: 18, fontWeight: '700' }}>{item.counted_qty} <Text style={s.muted}>{item.uom}</Text></Text>
          </View>
        )}
      />
      {manager && (
        <View style={[s.row, { marginTop: 8 }]}>
          <TouchableOpacity style={[s.btn, s.btnAlt, { flex: 1, borderColor: c.danger }]} disabled={busy} onPress={() => setRejecting(true)}>
            <Text style={[s.btnText, { color: c.danger }]}>Tolak</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { flex: 1 }]} disabled={busy} onPress={validate}>
            <Text style={s.btnText}>Validasi</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={rejecting} transparent animationType="fade" onRequestClose={() => setRejecting(false)}>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: c.card, borderRadius: 12, padding: 16 }}>
            <Text style={[s.title, { marginBottom: 8 }]}>Alasan penolakan</Text>
            <TextInput style={[s.input, { height: 90, textAlignVertical: 'top' }]} multiline value={reason} onChangeText={setReason} placeholder="mis. qty ganjil, hitung ulang" />
            <View style={[s.row, { marginTop: 12 }]}>
              <TouchableOpacity style={[s.btn, s.btnAlt, { flex: 1 }]} onPress={() => setRejecting(false)}>
                <Text style={[s.btnText, s.btnAltText]}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btn, { flex: 1, backgroundColor: c.danger }, !reason.trim() && { opacity: 0.5 }]}
                disabled={!reason.trim()}
                onPress={() => {
                  setRejecting(false);
                  act(() => rejectLocation(loc, reason.trim()));
                }}>
                <Text style={s.btnText}>Tolak</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
