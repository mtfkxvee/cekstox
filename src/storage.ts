import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CountLine } from './opname';

const key = (loc: string) => `count:${loc}`;

export async function loadDraft(loc: string): Promise<CountLine[]> {
  try {
    const s = await AsyncStorage.getItem(key(loc));
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}
export const saveDraft = (loc: string, lines: CountLine[]) => AsyncStorage.setItem(key(loc), JSON.stringify(lines));
export const clearDraft = (loc: string) => AsyncStorage.removeItem(key(loc));
