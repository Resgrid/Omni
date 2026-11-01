import * as ImagePicker from 'expo-image-picker';

/** A card or certificate photo ready for upload (base64 JPEG). */
export interface CapturedPhoto {
  base64: string;
  name: string;
  contentType: string;
}

export class PhotoPermissionError extends Error {
  constructor() {
    super('denied');
    this.name = 'PhotoPermissionError';
  }
}

/**
 * One photo from the camera or the library for a certification or a continuing-education entry. Re-encoded as a
 * compressed JPEG by the picker (quality < 1) and without EXIF in the result; null when the member cancels.
 */
export async function capturePhoto(source: 'camera' | 'library', name: string): Promise<CapturedPhoto | null> {
  const permission = await (source === 'camera' ? ImagePicker.requestCameraPermissionsAsync() : ImagePicker.requestMediaLibraryPermissionsAsync());
  if (!permission.granted) throw new PhotoPermissionError();
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, base64: true, exif: false };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets?.[0];
  if (!asset?.base64) return null;
  return { base64: asset.base64, name: name.toLowerCase().endsWith('.jpg') ? name : `${name}.jpg`, contentType: asset.mimeType ?? 'image/jpeg' };
}
