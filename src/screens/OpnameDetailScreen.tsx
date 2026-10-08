import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { amendLocation, canValidate, getOpname, listLocations, Loc, locState, LocState, makeReconciliation, Opname } from '../opname';
import { c, s } from '../ui';

const LABEL: Record<LocState, { text: string; color: string }> = {
  tersedia: { text: 'Tersedia', color: c.primary },
  terisi: { text: 'Sedang diisi', color: '#b7791f' },
  cek: { text: 'Menunggu cek ulang', color: '#b7791f' },
  menunggu: { text: 'Menunggu validasi', color: c.primary },
  divalidasi: { text: 'Divalidasi', color: c.ok },
  ditolak: { text: 'Ditolak', color: c.danger },
};

export default function OpnameDetailScreen({ navigation, route }: any) {
  const name: string = route.params.name;
  const manager = canValidate();
  const [op, setOp] = useState<Opname | null>(null);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    setBusy(true);
    setErr('');
    Promise.all([getOpname(name), listLocations(name)])
      .then(([o, l]) => {
        setOp(o);
        setLocs(l);
        navigation.setOptions({ title: o.warehouse });
      })
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  }, [name, navigation]);
  useFocusEffect(load);

  const open = async (l: Loc) => {
    const st = locState(l);
    try {
      if (st === 'tersedia') return navigation.navigate('Count', { loc: l.name, lokasi: l.lokasi });
      if (st === 'terisi')
        return Alert.alert('Lokasi sudah pernah diisi', 'Ada yang sudah mengisi lokasi ini tapi belum submit. Lanjutkan?', [
          { text: 'Batal', style: 'cancel' },
          { text: 'Lanjutkan', onPress: () => navigation.navigate('Count', { loc: l.name, lokasi: l.lokasi }) },
        ]);
      if (st === 'ditolak')
        return Alert.alert(`${l.lokasi} ditolak`, `${l.rejection_reason ?? ''}\n\nHitung ulang lokasi ini?`, [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Hitung ulang',
            onPress: async () => {
              try {
                const nn = await amendLocation(l.name);
                navigation.navigate('Count', { loc: nn, lokasi: l.lokasi });
              } catch (e: any) {
                setErr(e.message);
              }
            },
          },
        ]);
      navigation.navigate('Review', { loc: l.name, lokasi: l.lokasi });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const allValid = locs.length > 0 && locs.every((l) => locState(l) === 'divalidasi');
  const doRecon = () =>
    Alert.alert('Buat Stock Reconciliation?', 'Semua lokasi sudah divalidasi. Dokumen reconciliation akan dibuat di XERP.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Buat',
        onPress: async () => {
          setBusy(true);
          try {
            await makeReconciliation(name);
            Alert.alert('Berhasil', 'Stock Reconciliation dibuat.');
            load();
          } catch (e: any) {
            setErr(e.message);
            setBusy(false);
          }
        },
      },
    ]);

  return (
    <View style={s.screen}>
      {op && <Text style={[s.muted, { marginBottom: 8 }]}>{op.name} · {op.opname_date} · {op.status}</Text>}
      {busy && <ActivityIndicator style={{ marginBottom: 8 }} />}
      {!!err && <Text style={s.err}>{err}</Text>}
      {op?.stock_reconciliation ? <Text style={[s.title, { marginBottom: 8 }]}>Reconciliation: {op.stock_reconciliation}</Text> : null}
      <FlatList
        data={locs}
        keyExtractor={(l) => l.name}
        refreshing={busy}
        onRefresh={load}
        renderItem={({ item }) => {
          const L = LABEL[locState(item)];
          return (
            <TouchableOpacity style={[s.card, s.row, { justifyContent: 'space-between' }]} onPress={() => open(item)}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{item.lokasi}</Text>
                <Text style={s.muted}>{item.name}{item.counted_by ? ` · ${item.counted_by}` : ''}{item.lokasi_kosong ? ' · lokasi kosong' : ''}</Text>
              </View>
              <Text style={{ color: L.color, fontWeight: '600' }}>{L.text}</Text>
            </TouchableOpacity>
          );
        }}
      />
      {manager && !op?.stock_reconciliation && (
        <TouchableOpacity style={[s.btn, !allValid && { opacity: 0.4 }]} disabled={!allValid || busy} onPress={doRecon}>
          <Text style={s.btnText}>Buat Stock Reconciliation</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
