import { StyleProp, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { c } from './ui';

/** Tombol pilihan kecil (filter area, tingkat rak). */
export default function Chip({ label, active, onPress, style }: { label: string; active?: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 6, borderWidth: 1, borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary : c.card }, style]}>
      <Text style={{ color: active ? '#fff' : c.text, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}
