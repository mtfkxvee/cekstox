import type { FlatList } from 'react-native';

/** Gulir daftar ke baris yang baru ditambah/di-scan; baris terakhir = gulir ke paling bawah. */
export function revealRow(list: FlatList<any> | null, index: number, total: number) {
  if (!list || index < 0) return;
  try {
    if (index === total - 1) list.scrollToEnd({ animated: true });
    else list.scrollToIndex({ index, viewPosition: 0.3, animated: true });
  } catch {}
}

/** Fallback FlatList kalau baris belum terukur. */
export const onScrollFail = (list: { current: FlatList<any> | null }) => (info: { index: number; averageItemLength: number }) =>
  list.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
