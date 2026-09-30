import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { logout, savedUser } from './src/api';
import { loadRoles } from './src/opname';
import HistoryDetailScreen from './src/screens/HistoryDetailScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import CountScreen from './src/screens/CountScreen';
import OpnameDetailScreen from './src/screens/OpnameDetailScreen';
import OpnameListScreen from './src/screens/OpnameListScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import TransferScreen from './src/screens/TransferScreen';
import WarehousePickerScreen from './src/screens/WarehousePickerScreen';
import ScannerScreen from './src/screens/ScannerScreen';
import StockScreen from './src/screens/StockScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [user, setUser] = useState<string | null | undefined>(undefined);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    savedUser().then(setUser);
  }, []);

  // role dipakai untuk menampilkan tombol validasi (Stock Manager / System Manager)
  useEffect(() => {
    if (!user) return setReady(false);
    loadRoles(user).finally(() => setReady(true));
  }, [user]);

  if (user === undefined || (user && !ready))
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );

  if (!user)
    return (
      <SafeAreaProvider>
        <LoginScreen onDone={() => savedUser().then(setUser)} />
        <StatusBar style="light" />
      </SafeAreaProvider>
    );

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Home" options={{ headerShown: false }}>
            {(p) => <HomeScreen {...p} user={user} onLogout={async () => { await logout(); setUser(null); }} />}
          </Stack.Screen>
          <Stack.Screen name="Stock" component={StockScreen} options={{ title: 'Cek Stok' }} />
          <Stack.Screen name="Scanner" component={ScannerScreen} options={{ title: 'Scan Barcode' }} />
          <Stack.Screen name="OpnameList" component={OpnameListScreen} options={{ title: 'Stok Opname' }} />
          <Stack.Screen name="OpnameDetail" component={OpnameDetailScreen} options={{ title: 'Lokasi' }} />
          <Stack.Screen name="Count" component={CountScreen} />
          <Stack.Screen name="Review" component={ReviewScreen} />
          <Stack.Screen name="Transfer" component={TransferScreen} options={{ title: 'Pindah Stok' }} />
          <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'Riwayat Pindah Stok' }} />
          <Stack.Screen name="HistoryDetail" component={HistoryDetailScreen} />
          <Stack.Screen name="WarehousePicker" component={WarehousePickerScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
