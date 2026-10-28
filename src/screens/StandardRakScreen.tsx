import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { findByBarcode, Item } from '../api';
import Chip from '../Chip';
import { findItemInStandards, ItemSpot, listOutlets, listStandardRak, myOutlet, OutletOpt, RakSummary } from '../standardRak';
import { c, s } from '../ui';

/** Daftar Standard Rak per outlet. Scan kode rak membuka raknya; scan barcode item menunjukkan rak standarnya. */
export default function StandardRakScreen({ navigation }: any) {
  const [outlets, setOutlets] = useState<OutletOpt[]>([]);
  const [outlet, setOutlet] = useState('');
  const [list, setList] = useState<RakSummary[]>([]);
  const [area, setArea] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ item: Item; at: ItemSpot[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const st = useRef({ outlet, list });
  st.current = { outlet, list };

  const chooseOutlet = useCallback(async (o: string) => {
    setOutlet(o);
    setArea('');
    setQ('');
    setFound(null);
    setList([]);
    setErr('');
    setBusy(true);
    try {
      setList(await listStandardRak(o));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  // outlet user langsung dipilih bila punya Standard Rak
  useEffect(() => {
    Promise.all([listOutlets(), myOutlet()])
      .then(([opts, mine]) => {
        setOutlets(opts);
        const def = opts.find((x) => x.name === mine)?.name ?? opts[0]?.name;
        if (def) chooseOutlet(def);
        else setErr('Belum ada Standard Rak di outlet mana pun.');
      })
      .catch((e) => setErr(e.message));
  }, [chooseOutlet]);

  // jumlah item bisa berubah setelah standar diubah di layar detail
  useEffect(
    () =>
      navigation.addListener('focus', () => {
        if (st.current.outlet) listStandardRak(st.current.outlet).then(setList).catch(() => {});
      }),
    [navigation],
  );

  // kode bisa berupa rak (E1-BEAU), tingkat rak (E1-BEAU-R3 / nama Shelving lengkap), atau barcode item
  const lookup = async (code: string) => {
    setErr('');
    setFound(null);
    const base = code.trim().split(' - ')[0].toUpperCase();
    if (!base) return;
    const m = base.match(/^(.+)-R(\d+)$/);
    const { list: l, outlet: o } = st.current;
    const exact = l.find((x) => x.kode.toUpperCase() === base);
    const hit = exact ?? (m ? l.find((x) => x.kode.toUpperCase() === m[1]) : undefined);
    if (hit) {
      Vibration.vibrate(50);
      setQ('');
      return navigation.navigate('StandardRakDetail', { name: hit.name, rak: exact || !m ? undefined : Number(m[2]) });
    }
    setBusy(true);
    try {
      const it = await findByBarcode(code);
      if (!it) return setErr(`${code.trim()} bukan kode rak atau barcode item yang dikenal`);
      Vibration.vibrate(50);
      setFound({ item: it, at: await findItemInStandards(it.name, o) });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pickOutlet = () =>
    outlets.length &&
    navigation.navigate('WarehousePicker', {
      title: 'Pilih Outlet',
      names: outlets.map((x) => x.name),
      labels: Object.fromEntries(outlets.map((x) => [x.name, x.label])),
      onPick: chooseOutlet,
    });

  const k = q.trim().toLowerCase();
  const areas = [...new Set(list.map((x) => x.area).filter(Boolean))].sort();
  const shown = list.filter((x) => (!area || x.area === area) && (!k || `${x.kode} ${x.kategori}`.toLowerCase().includes(k)));
  const totalItems = shown.reduce((a, b) => a + (b.total_item ?? 0), 0);

  return (
    <View style={s.screen}>
      <TouchableOpacity style={[s.card, { marginBottom: 10 }]} onPress={pickOutlet}>
        <Text style={s.muted}>Outlet</Text>
        <Text style={s.title}>{outlets.find((x) => x.name === outlet)?.label ?? (outlet || 'Pilih outlet')}</Text>
      </TouchableOpacity>

      <View style={[s.row, { marginBottom: 8 }]}>
        <TextInput
          style={[s.input, { flex: 1 }]}
          placeholder="Cari rak / ketik barcode"
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => lookup(q)}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="characters"
        />
        <TouchableOpacity style={s.btn} onPress={() => outlet && navigation.navigate('Scanner', { onScan: lookup })}>
          <Text style={s.btnText}>Scan</Text>
        </TouchableOpacity>
      </View>

      {areas.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }}>
          <Chip label="Semua" active={!area} onPress={() => setArea('')} />
          {areas.map((a) => (
            <Chip key={a} label={`Area ${a}`} active={area === a} onPress={() => setArea(a)} />
          ))}
        </ScrollView>
      )}

      {busy && <ActivityIndicator style={{ marginVertical: 8 }} />}
      {!!err && <Text style={s.err}>{err}</Text>}

      {found && (
        <View style={[s.card, { borderColor: found.at.length ? c.ok : c.warn, borderWidth: 2 }]}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={[s.title, { flex: 1 }]}>{found.item.item_name}</Text>
            <TouchableOpacity onPress={() => setFound(null)} hitSlop={10}>
              <Text style={{ color: c.muted, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.muted}>{found.item.name}</Text>
          {found.at.length ? (
            found.at.map((a) => (
              <TouchableOpacity
                key={`${a.rak}|${a.rak_no}`}
                style={[s.row, { justifyContent: 'space-between', marginTop: 8 }]}
                onPress={() => navigation.navigate('StandardRakDetail', { name: a.rak, rak: a.rak_no, item: found.item.name })}>
                <Text style={{ color: c.primary, fontWeight: '600', fontSize: 16 }}>
                  {a.kode} · R{a.rak_no}
                </Text>
                <Text style={s.muted}>
                  standar {a.qty} {found.item.stock_uom} ›
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={{ color: c.warn, marginTop: 6 }}>Belum ada di standar rak mana pun di outlet ini.</Text>
          )}
        </View>
      )}

      <FlatList
        data={shown}
        keyExtractor={(x) => x.name}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={shown.length ? <Text style={[s.muted, { marginBottom: 6 }]}>{shown.length} rak · {totalItems} item standar</Text> : null}
        ListEmptyComponent={!busy && outlet ? <Text style={s.muted}>{k || area ? 'Tidak ada rak yang cocok.' : 'Belum ada Standard Rak di outlet ini.'}</Text> : null}
        renderItem={({ item: x }) => (
          <TouchableOpacity style={[s.card, s.row, { justifyContent: 'space-between' }]} onPress={() => navigation.navigate('StandardRakDetail', { name: x.name })}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{x.kode}</Text>
              <Text style={s.muted}>
                {x.kategori ? `${x.kategori} · ` : ''}
                {x.jumlah_rak} rak · {x.total_item} item
              </Text>
            </View>
            <Text style={{ color: c.muted }}>›</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
