import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, SectionList, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { findByBarcode, Item, searchItems } from '../api';
import Chip from '../Chip';
import { findItemInStandards, getStandardRak, levelCode, newKey, RakItem, RakLevel, saveStandardRak, StandardRak } from '../standardRak';
import { c, s } from '../ui';

/** Pilihan tingkat "Semua". */
const ALL = 0;

type Check = { ok: boolean; text: string };

/**
 * Isi standar satu rak per tingkat. Scan item = cek apakah item memang standar di rak ini.
 * Mode Ubah: tambah/hapus/pindah item, ubah qty & catatan, tambah/hapus tingkat, lalu Simpan.
 */
export default function StandardRakDetailScreen({ navigation, route }: any) {
  const { name, rak, item }: { name: string; rak?: number; item?: string } = route.params;
  const [doc, setDoc] = useState<StandardRak | null>(null);
  const [racks, setRacks] = useState<RakLevel[]>([]);
  const [items, setItems] = useState<RakItem[]>([]);
  const [lvl, setLvl] = useState(rak ?? ALL);
  const [edit, setEdit] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [hl, setHl] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const dirty = !!doc && (JSON.stringify(racks) !== JSON.stringify(doc.racks) || JSON.stringify(items) !== JSON.stringify(doc.items));
  // tingkat yang dipilih bisa saja tidak ada (mis. dari scan) -> tampilkan semua
  const cur = racks.some((r) => r.rak_no === lvl) ? lvl : ALL;
  const target = cur || racks[0]?.rak_no;
  // dipakai callback Scanner yang dibuat sebelum state terbaru
  const st = useRef({ doc, items, edit, target, dirty });
  st.current = { doc, items, edit, target, dirty };

  useEffect(() => {
    getStandardRak(name)
      .then((d) => {
        setDoc(d);
        setRacks(d.racks);
        setItems(d.items);
        const hit = item ? d.items.find((x) => x.item_code === item) : undefined;
        if (hit) {
          setLvl(hit.rak_no);
          setHl(hit.key);
        }
      })
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  }, [name, item]);

  useEffect(() => {
    navigation.setOptions({
      title: doc?.kode ?? name,
      headerRight: () =>
        doc && !edit ? (
          <TouchableOpacity onPress={() => setEdit(true)} hitSlop={10}>
            <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>Ubah</Text>
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, doc, edit, name]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e: any) => {
        if (!st.current.dirty) return;
        e.preventDefault();
        Alert.alert('Buang perubahan?', 'Perubahan standar rak belum disimpan.', [
          { text: 'Lanjut ubah', style: 'cancel' },
          { text: 'Buang', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation],
  );

  useEffect(() => {
    if (!edit || q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => searchItems(q).then(setResults).catch((e) => setErr(e.message)), 400);
    return () => clearTimeout(t);
  }, [q, edit]);

  const patch = (key: string, p: Partial<RakItem>) => setItems((prev) => prev.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const setQty = (key: string, text: string) => {
    const n = parseFloat(text.replace(',', '.'));
    patch(key, { qty: isNaN(n) || n < 0 ? 0 : n });
  };

  const addItem = (it: Item) => {
    setQ('');
    const { items: list, target: to } = st.current;
    const ex = list.find((x) => x.item_code === it.name);
    if (ex) {
      setLvl(ex.rak_no);
      setOpen(ex.key);
      setHl(ex.key);
      return setCheck({ ok: true, text: `${it.item_name} sudah ada di R${ex.rak_no}` });
    }
    if (!to) return setErr('Tambah rak dulu (+ Rak)');
    const row: RakItem = { key: newKey(), rak_no: to, item_code: it.name, item_name: it.item_name, qty: 1, uom: it.stock_uom, catatan: '' };
    setItems((prev) => [...prev, row]);
    setLvl(to);
    setOpen(row.key);
    setHl(row.key);
    setCheck({ ok: true, text: `Ditambahkan ke R${to}: ${it.item_name}` });
  };

  const onScan = async (code: string) => {
    setErr('');
    setCheck(null);
    try {
      const it = await findByBarcode(code);
      if (!it) return setErr(`Barcode ${code} tidak ditemukan`);
      Vibration.vibrate(50);
      const { doc: d, items: list, edit: editing } = st.current;
      const ex = list.find((x) => x.item_code === it.name);
      if (ex) {
        setLvl(ex.rak_no);
        setHl(ex.key);
        if (editing) setOpen(ex.key);
        return setCheck({ ok: true, text: `Sesuai standar: ${it.item_name} · R${ex.rak_no} · ${ex.qty} ${ex.uom}` });
      }
      setHl(null);
      if (editing) return addItem(it);
      if (!d) return;
      const base = `${it.item_name} tidak ada di standar ${d.kode}.`;
      setCheck({ ok: false, text: base });
      const at = (await findItemInStandards(it.name, d.outlet)).filter((x) => x.rak !== d.name);
      setCheck({ ok: false, text: `${base} ${at.length ? `Standarnya di ${at.map((x) => `${x.kode} R${x.rak_no}`).join(', ')}.` : 'Tidak ada di standar rak mana pun di outlet ini.'}` });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const addLevel = () => {
    if (!doc) return;
    const n = Math.max(0, ...racks.map((r) => r.rak_no)) + 1;
    setRacks((prev) => [...prev, { rak_no: n, kode_rak: levelCode(doc.kode, n), catatan: '' }]);
    setLvl(n);
  };

  const removeLevel = (n: number) => {
    const cnt = items.filter((x) => x.rak_no === n).length;
    Alert.alert(`Hapus rak R${n}?`, cnt ? `${cnt} item di rak ini ikut terhapus dari standar.` : 'Rak ini kosong.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          setRacks((prev) => prev.filter((r) => r.rak_no !== n));
          setItems((prev) => prev.filter((x) => x.rak_no !== n));
          setLvl(ALL);
        },
      },
    ]);
  };

  const stopEdit = () => {
    if (doc) {
      setRacks(doc.racks);
      setItems(doc.items);
    }
    setEdit(false);
    setOpen(null);
    setQ('');
  };
  const cancelEdit = () =>
    dirty
      ? Alert.alert('Buang perubahan?', 'Perubahan standar rak belum disimpan.', [
          { text: 'Lanjut ubah', style: 'cancel' },
          { text: 'Buang', style: 'destructive', onPress: stopEdit },
        ])
      : stopEdit();

  const save = async () => {
    if (!doc) return;
    setSaving(true);
    setErr('');
    try {
      const d = await saveStandardRak({ ...doc, racks, items });
      setDoc(d);
      setRacks(d.racks);
      setItems(d.items);
      setEdit(false);
      setOpen(null);
      setHl(null);
      setQ('');
      Alert.alert('Tersimpan', `Standar ${d.kode} diperbarui: ${d.racks.length} rak, ${d.items.length} item.`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (busy) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!doc)
    return (
      <View style={s.screen}>
        <Text style={s.err}>{err || 'Standar rak tidak ditemukan'}</Text>
      </View>
    );

  const k = q.trim().toLowerCase();
  const searching = edit && k.length >= 2;
  const shown = !edit && k ? items.filter((x) => `${x.item_code} ${x.item_name}`.toLowerCase().includes(k)) : items;
  const sections = racks
    .filter((r) => cur === ALL || r.rak_no === cur)
    .map((r) => ({ rak: r, data: shown.filter((x) => x.rak_no === r.rak_no) }))
    .filter((sec) => !k || sec.data.length);
  const count = (n: number) => items.filter((x) => x.rak_no === n).length;
  const inDoc = new Map(items.map((x) => [x.item_code, x]));

  const row = (x: RakItem, index: number) => {
    const opened = edit && open === x.key;
    return (
      <View style={[s.card, hl === x.key && { borderColor: c.ok, borderWidth: 2 }]}>
        <TouchableOpacity disabled={!edit} activeOpacity={0.7} onPress={() => setOpen(opened ? null : x.key)} style={[s.row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>
              {index + 1}. {x.item_name}
            </Text>
            <Text style={s.muted}>
              {x.item_code}
              {x.catatan ? ` · ${x.catatan}` : ''}
            </Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>
            {x.qty} <Text style={s.muted}>{x.uom}</Text>
          </Text>
        </TouchableOpacity>
        {opened && (
          <View style={{ marginTop: 10, gap: 8 }}>
            <View style={s.row}>
              <Text style={[s.muted, { width: 52 }]}>Qty</Text>
              <TouchableOpacity style={[s.btn, s.btnAlt, { paddingHorizontal: 14 }]} onPress={() => setQty(x.key, String(Math.max(0, x.qty - 1)))}>
                <Text style={[s.btnText, s.btnAltText]}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={[s.input, { width: 90, textAlign: 'center' }]}
                selectTextOnFocus
                keyboardType="decimal-pad"
                defaultValue={String(x.qty)}
                key={`${x.key}-${x.qty}`}
                onEndEditing={(e) => setQty(x.key, e.nativeEvent.text)}
              />
              <TouchableOpacity style={[s.btn, s.btnAlt, { paddingHorizontal: 14 }]} onPress={() => setQty(x.key, String(x.qty + 1))}>
                <Text style={[s.btnText, s.btnAltText]}>+</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={s.input} placeholder="Catatan (opsional)" value={x.catatan} onChangeText={(t) => patch(x.key, { catatan: t })} />
            <View style={[s.row, { flexWrap: 'wrap', gap: 0 }]}>
              <Text style={[s.muted, { width: 60 }]}>Pindah ke</Text>
              {racks.map((r) => (
                <Chip
                  key={r.rak_no}
                  label={`R${r.rak_no}`}
                  active={r.rak_no === x.rak_no}
                  style={{ marginBottom: 4 }}
                  onPress={() => {
                    patch(x.key, { rak_no: r.rak_no });
                    if (cur !== ALL) setLvl(r.rak_no);
                  }}
                />
              ))}
            </View>
            <TouchableOpacity onPress={() => setItems((prev) => prev.filter((y) => y.key !== x.key))} style={{ alignSelf: 'flex-start' }}>
              <Text style={{ color: c.danger, fontWeight: '600' }}>Hapus dari standar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.screen}>
      <Text style={[s.muted, { marginBottom: 8 }]}>
        {doc.kategori ? `${doc.kategori} · ` : ''}Area {doc.area} · {doc.outlet} · {racks.length} rak · {items.length} item
        {edit ? ' · MODE UBAH' : ''}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }}>
        <Chip label={`Semua (${items.length})`} active={cur === ALL} onPress={() => setLvl(ALL)} />
        {racks.map((r) => (
          <Chip key={r.rak_no} label={`R${r.rak_no} (${count(r.rak_no)})`} active={cur === r.rak_no} onPress={() => setLvl(r.rak_no)} />
        ))}
        {edit && <Chip label="+ Rak" onPress={addLevel} style={{ borderColor: c.primary, borderStyle: 'dashed' }} />}
      </ScrollView>

      {edit && (
        <View style={[s.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
          <Text style={s.muted}>{target ? `Item baru masuk ke R${target}` : 'Belum ada rak'}</Text>
          {cur !== ALL && (
            <TouchableOpacity onPress={() => removeLevel(cur)} hitSlop={8}>
              <Text style={{ color: c.danger, fontWeight: '600' }}>Hapus rak R{cur}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={[s.row, { marginBottom: 8 }]}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder={edit ? 'Cari item untuk ditambah' : 'Cari item di rak ini'} value={q} onChangeText={setQ} autoCorrect={false} />
        <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Scanner', { onScan })}>
          <Text style={s.btnText}>{edit ? 'Scan' : 'Cek Item'}</Text>
        </TouchableOpacity>
      </View>

      {check && (
        <TouchableOpacity style={[s.card, { borderColor: check.ok ? c.ok : c.danger, borderWidth: 2, backgroundColor: check.ok ? '#dcf5e3' : '#fde2e1' }]} onPress={() => setCheck(null)}>
          <Text style={{ color: check.ok ? c.ok : c.danger, fontWeight: '600' }}>
            {check.ok ? '✓ ' : '✕ '}
            {check.text}
          </Text>
        </TouchableOpacity>
      )}
      {!!err && <Text style={s.err}>{err}</Text>}

      {searching ? (
        <FlatList
          data={results}
          keyExtractor={(i) => i.name}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={target ? <Text style={[s.muted, { marginBottom: 4 }]}>Ketuk untuk menambah ke R{target}</Text> : null}
          renderItem={({ item: it }) => {
            const ex = inDoc.get(it.name);
            return (
              <TouchableOpacity style={s.card} onPress={() => addItem(it)}>
                <Text style={s.title}>{it.item_name}</Text>
                <Text style={s.muted}>
                  {it.name} · {it.stock_uom}
                  {ex ? ` · sudah di R${ex.rak_no}` : ''}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(x) => x.key}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled
          ListEmptyComponent={<Text style={s.muted}>{k ? 'Tidak ada item yang cocok.' : edit ? 'Belum ada rak. Ketuk + Rak.' : 'Belum ada rak. Ketuk Ubah untuk menambah.'}</Text>}
          renderSectionHeader={({ section }) => (
            <View style={[s.row, { justifyContent: 'space-between', backgroundColor: c.bg, paddingVertical: 6 }]}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: c.primary }}>
                Rak R{section.rak.rak_no} <Text style={s.muted}>{section.rak.kode_rak}</Text>
              </Text>
              <Text style={s.muted}>{section.data.length} item</Text>
            </View>
          )}
          renderSectionFooter={({ section }) => (section.data.length ? null : <Text style={[s.muted, { marginBottom: 8 }]}>Belum ada item di rak ini.</Text>)}
          renderItem={({ item: x, index }) => row(x, index)}
        />
      )}

      {edit && (
        <View style={[s.row, { marginTop: 8 }]}>
          <TouchableOpacity style={[s.btn, s.btnAlt, { flex: 1 }]} onPress={cancelEdit}>
            <Text style={[s.btnText, s.btnAltText]}>Batal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { flex: 2 }, (!dirty || saving) && { opacity: 0.5 }]} disabled={!dirty || saving} onPress={save}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Simpan</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
