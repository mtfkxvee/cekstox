import { Ionicons } from '@expo/vector-icons';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canValidate } from '../opname';
import { c } from '../ui';

type Menu = { route: string; title: string; desc: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string };

const MENUS: Menu[] = [
  { route: 'Stock', title: 'Cek Stok', desc: 'Lihat stok barang per gudang', icon: 'search', color: '#1f6feb', bg: '#e3eeff' },
  { route: 'OpnameList', title: 'Stok Opname', desc: 'Hitung fisik per lokasi', icon: 'clipboard', color: '#1a7f37', bg: '#dcf5e3' },
  { route: 'Transfer', title: 'Pindah Stok', desc: 'Transfer barang antar gudang', icon: 'swap-horizontal', color: '#c2570c', bg: '#ffe9d6' },
  { route: 'History', title: 'Riwayat Pindah Stok', desc: 'Daftar transfer stok gudang Anda', icon: 'time', color: '#6f42c1', bg: '#ece4fa' },
];

export default function HomeScreen({ navigation, user, onLogout }: any) {
  const insets = useSafeAreaInsets();
  const name = String(user).split('@')[0];
  const manager = canValidate();

  const confirmLogout = () =>
    Alert.alert('Keluar?', 'Anda harus login lagi untuk memakai aplikasi.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Keluar', style: 'destructive', onPress: onLogout },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ backgroundColor: c.primary, paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 56, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#ffffffb3', fontSize: 14 }}>Selamat datang,</Text>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }} numberOfLines={1}>{name}</Text>
            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              <View style={{ backgroundColor: '#ffffff26', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>{manager ? 'Stock Manager' : 'Staf Gudang'}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={confirmLogout} hitSlop={12} style={{ backgroundColor: '#ffffff26', borderRadius: 20, padding: 10 }}>
            <Ionicons name="log-out-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ marginTop: -36 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
        {MENUS.map((m) => (
          <TouchableOpacity
            key={m.route}
            activeOpacity={0.8}
            onPress={() => navigation.navigate(m.route)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: c.card,
              borderRadius: 18,
              padding: 16,
              marginBottom: 12,
              shadowColor: '#000',
              shadowOpacity: 0.08,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 3,
            }}>
            <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: m.bg, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
              <Ionicons name={m.icon} size={28} color={m.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>{m.title}</Text>
              <Text style={{ fontSize: 13, color: c.muted, marginTop: 2 }}>{m.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={c.muted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
