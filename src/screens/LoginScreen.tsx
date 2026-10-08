import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { login, loginWithToken } from '../api';
import { AUTH_SERVER_URL, ERP_URL } from '../config';
import { c } from '../ui';

export default function LoginScreen({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [usr, setUsr] = useState('');
  const [pwd, setPwd] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pwdRef = useRef<TextInput>(null);

  // Login Google lewat server auth (folder server/): browser sistem -> Google -> kembali ke cekstox://auth
  const google = async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const back = Linking.createURL('auth');
      const res = await WebBrowser.openAuthSessionAsync(`${AUTH_SERVER_URL}/auth/google/start?client_redirect=${encodeURIComponent(back)}`, back);
      if (res.type !== 'success') return setErr('Login Google dibatalkan.');
      const p = Linking.parse(res.url).queryParams ?? {};
      const get = (k: string) => (Array.isArray(p[k]) ? (p[k] as string[])[0] : (p[k] as string | undefined));
      if (get('ok') !== '1' || !get('token') || !get('user')) return setErr(get('message') || 'Login Google gagal.');
      await loginWithToken(get('user')!, get('token')!);
      if (get('isNew') === '1') Alert.alert('Akun dibuat', 'Akun Anda didaftarkan sebagai Stock User.');
      onDone();
    } catch (e: any) {
      setErr(e.message || 'Login Google gagal.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!usr.trim() || !pwd || busy) return;
    setBusy(true);
    setErr('');
    try {
      await login(usr.trim(), pwd);
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const field = { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f4f8', borderRadius: 14, paddingHorizontal: 14, marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0' } as const;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.primary }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={{ alignItems: 'center', paddingTop: insets.top + 40, paddingBottom: 48 }}>
          <View
            style={{
              width: 112,
              height: 112,
              borderRadius: 30,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.2,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 8,
            }}>
            <Image source={require('../../assets/splash-icon.png')} style={{ width: 80, height: 80 }} resizeMode="contain" />
          </View>
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 18, letterSpacing: 0.5 }}>CEKSTOX</Text>
          <Text style={{ color: '#ffffffb3', fontSize: 14, marginTop: 4 }}>Aplikasi Stok & Inventaris</Text>
        </View>

        <View style={{ flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: insets.bottom + 24 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: c.text }}>Masuk</Text>
          <Text style={{ color: c.muted, marginTop: 2, marginBottom: 22 }}>Gunakan akun XERP Anda</Text>

          <View style={field}>
            <Ionicons name="person-outline" size={20} color={c.muted} />
            <TextInput
              style={{ flex: 1, paddingVertical: 14, paddingLeft: 10, fontSize: 16, color: c.text }}
              placeholder="Username / Email"
              placeholderTextColor="#9aa4b2"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="next"
              value={usr}
              onChangeText={setUsr}
              onSubmitEditing={() => pwdRef.current?.focus()}
            />
          </View>

          <View style={field}>
            <Ionicons name="lock-closed-outline" size={20} color={c.muted} />
            <TextInput
              ref={pwdRef}
              style={{ flex: 1, paddingVertical: 14, paddingLeft: 10, fontSize: 16, color: c.text }}
              placeholder="Password"
              placeholderTextColor="#9aa4b2"
              secureTextEntry={!show}
              autoCapitalize="none"
              returnKeyType="go"
              value={pwd}
              onChangeText={setPwd}
              onSubmitEditing={submit}
            />
            <TouchableOpacity onPress={() => setShow((v) => !v)} hitSlop={10}>
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={22} color={c.muted} />
            </TouchableOpacity>
          </View>

          {!!err && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fde8ea', borderRadius: 12, padding: 12, marginBottom: 14 }}>
              <Ionicons name="alert-circle" size={20} color={c.danger} />
              <Text style={{ color: c.danger, marginLeft: 8, flex: 1 }}>{err}</Text>
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={busy || !usr.trim() || !pwd}
            onPress={submit}
            style={{ backgroundColor: c.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 6, opacity: busy || !usr.trim() || !pwd ? 0.5 : 1 }}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Masuk</Text>}
          </TouchableOpacity>

          {!!AUTH_SERVER_URL && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 18 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
                <Text style={{ marginHorizontal: 12, color: '#9aa4b2' }}>atau</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={busy}
                onPress={google}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: '#d0d7de', backgroundColor: '#fff', opacity: busy ? 0.5 : 1 }}>
                <Ionicons name='logo-google' size={20} color='#db4437' />
                <Text style={{ marginLeft: 10, fontSize: 16, fontWeight: '600', color: c.text }}>Masuk dengan Google</Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={{ textAlign: 'center', color: '#9aa4b2', fontSize: 12, marginTop: 'auto', paddingTop: 28 }}>{ERP_URL.replace('https://', '')}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
