import * as FileSystem from 'expo-file-system/legacy';

/**
 * Reads a local image picked via expo-image-picker into raw bytes, ready for
 * supabase.storage upload.
 *
 * Android's system Photo Picker (default since Expo SDK 49) can return
 * content:// URIs. FileSystem.readAsStringAsync cannot read those directly —
 * copy to a file:// path in the cache dir first (FileSystem.copyAsync does
 * support content://, via Android's ContentResolver under the hood).
 */
export async function readLocalImageBytes(uri: string): Promise<Uint8Array> {
  let readUri = uri;
  if (uri.startsWith('content://')) {
    const dest = `${FileSystem.cacheDirectory}img_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    readUri = dest;
  }

  const base64 = await FileSystem.readAsStringAsync(readUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
