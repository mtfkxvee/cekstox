import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { s } from '../ui';

/** route.params.onScan(code) dipanggil sekali per scan; layar menutup diri kecuali params.multi. */
export default function ScannerScreen({ navigation, route }: any) {
  const [perm, ask] = useCameraPermissions();
  const last = useRef({ code: '', at: 0 });

  if (!perm) return <View style={s.screen} />;
  if (!perm.granted)
    return (
      <View style={[s.screen, { justifyContent: 'center' }]}>
        <Text style={{ textAlign: 'center', marginBottom: 16 }}>Izin kamera diperlukan untuk scan barcode.</Text>
        <TouchableOpacity style={s.btn} onPress={ask}>
          <Text style={s.btnText}>Beri Izin</Text>
        </TouchableOpacity>
      </View>
    );

  const onScan = ({ data }: { data: string }) => {
    const now = Date.now();
    if (data === last.current.code && now - last.current.at < 2000) return;
    last.current = { code: data, at: now };
    route.params.onScan(data);
    if (!route.params.multi) navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        onBarcodeScanned={onScan}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
      />
      <TouchableOpacity style={[s.btn, { margin: 16 }]} onPress={() => navigation.goBack()}>
        <Text style={s.btnText}>{route.params.multi ? 'Selesai' : 'Batal'}</Text>
      </TouchableOpacity>
    </View>
  );
}
