import { StyleSheet } from 'react-native';

export const c = { bg: '#f4f5f7', card: '#fff', primary: '#1f6feb', text: '#1b1f24', muted: '#6b7280', danger: '#d1242f', warn: '#b7791f', ok: '#1a7f37', border: '#e2e5e9' };

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg, padding: 16 },
  card: { backgroundColor: c.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: c.border },
  input: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.text },
  btn: { backgroundColor: c.primary, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  btnAlt: { backgroundColor: c.card, borderWidth: 1, borderColor: c.primary },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  btnAltText: { color: c.primary },
  title: { fontSize: 16, fontWeight: '600', color: c.text },
  muted: { color: c.muted, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  err: { color: c.danger, marginVertical: 8 },
});
