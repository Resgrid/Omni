import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** A card, certificate or evidence photo ready for upload (base64 JPEG without metadata). */
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

/** The photo could not be decoded on this device (for example a HEIC photo in a browser that cannot read HEIC). */
export class PhotoFormatError extends Error {
  constructor() {
    super('unsupported');
    this.name = 'PhotoFormatError';
  }
}

/** Longest side of an uploaded photo: plenty for a card or a certificate, and well inside Core's 10 MB per file. */
export const PHOTO_MAX_DIMENSION = 2400;

const HEIC_NAME = /\.(heic|heif)$/i;
const HEIC_TYPE = /^image\/hei[cf](-sequence)?$/i;

/** Whether a picked file is a HEIC/HEIF image (by type or by name): Core refuses those, so they are converted first. */
export const isHeicImage = (mimeType: string | null | undefined, fileName: string | null | undefined): boolean => HEIC_TYPE.test(mimeType ?? '') || HEIC_NAME.test(fileName ?? '');

/** The file name with a `.jpg` extension (a converted HEIC keeps its base name). */
export const asJpegName = (name: string): string => {
  const base = name.replace(/\.[^./\\]+$/, '');

  return `${base || 'photo'}.jpg`;
};

/** The resize that brings an image's longest side down to PHOTO_MAX_DIMENSION; null when it is already within it (or unknown). */
const boundedResize = (width: number, height: number): { width: number } | { height: number } | null =>
  Math.max(width, height) > PHOTO_MAX_DIMENSION ? (width >= height ? { width: PHOTO_MAX_DIMENSION } : { height: PHOTO_MAX_DIMENSION }) : null;

/**
 * Re-encodes an image as a JPEG on the device: HEIC/HEIF becomes JPEG (Core refuses HEIC so that location metadata never
 * reaches storage) and the new file carries no EXIF, GPS or device data, whatever the picker kept. Large photos are scaled
 * down, by the picker's dimensions or, when it gave none (a document picked as a file), by the decoded image's. Throws
 * PhotoFormatError when the image cannot be decoded here.
 */
export async function toUploadJpeg(uri: string, width: number | undefined, height: number | undefined, name: string): Promise<CapturedPhoto> {
  try {
    const known = width && height ? { width, height } : null;
    const context = ImageManipulator.manipulate(uri);
    const resize = known ? boundedResize(known.width, known.height) : null;

    if (resize) context.resize(resize);

    let image = await context.renderAsync();
    const decodedResize = known ? null : boundedResize(image.width, image.height);

    if (decodedResize) {
      const scaled = ImageManipulator.manipulate(image);

      scaled.resize(decodedResize);
      image = await scaled.renderAsync();
    }

    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });

    if (!saved.base64) throw new PhotoFormatError();

    return { base64: saved.base64, name: asJpegName(name), contentType: 'image/jpeg' };
  } catch {
    throw new PhotoFormatError();
  }
}

/**
 * One photo from the camera or the library for a certification or a continuing-education entry, always re-encoded on the
 * device as a JPEG without metadata (`toUploadJpeg`); null when the member cancels.
 */
export async function capturePhoto(source: 'camera' | 'library', name: string): Promise<CapturedPhoto | null> {
  const permission = await (source === 'camera' ? ImagePicker.requestCameraPermissionsAsync() : ImagePicker.requestMediaLibraryPermissionsAsync());

  if (!permission.granted) throw new PhotoPermissionError();

  // `Compatible` asks iOS for a JPEG instead of the HEIC original; the re-encode covers every other platform and picker.
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  };

  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets?.[0];

  if (!asset?.uri) return null;

  return toUploadJpeg(asset.uri, asset.width, asset.height, name);
}
