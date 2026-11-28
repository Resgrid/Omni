import { PHOTO_MAX_DIMENSION, toUploadJpeg } from '../lib/capture-photo';

/** What a context manipulates: a file's uri, or an image decoded earlier. */
type MockSource = string | { width: number; height: number };

/** An image manipulation context the tests inspect: its source, the resize asked for and the image it renders. */
interface MockContext {
  source: MockSource;
  resize: jest.Mock;
  renderAsync: jest.Mock;
}

const mockContexts: MockContext[] = [];

/** The decoded size of each image the contexts render, in order (the first decode, then a scaled one). */
const mockSizes: { width: number; height: number }[] = [];

jest.mock('expo-image-picker', () => ({ UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' } }));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: (source: MockSource) => {
      const size = mockSizes.shift() ?? { width: 0, height: 0 };

      const context: MockContext = {
        source,
        resize: jest.fn(),
        renderAsync: jest.fn(async () => ({ ...size, saveAsync: jest.fn(async () => ({ base64: 'SlBFRw==' })) })),
      };

      mockContexts.push(context);

      return context;
    },
  },
}));

beforeEach(() => {
  mockContexts.length = 0;
  mockSizes.length = 0;
});

describe('toUploadJpeg', () => {
  it('scales a large picked photo by the dimensions the picker gave', async () => {
    mockSizes.push({ width: PHOTO_MAX_DIMENSION, height: 1600 });
    await toUploadJpeg('file://photo.jpg', 6000, 4000, 'photo.jpg');
    expect(mockContexts).toHaveLength(1);
    expect(mockContexts[0]?.resize).toHaveBeenCalledWith({ width: PHOTO_MAX_DIMENSION });
  });

  it('scales a large image picked as a file (no dimensions) by its decoded size, tall images by height', async () => {
    mockSizes.push({ width: 4000, height: 6000 }, { width: 1600, height: PHOTO_MAX_DIMENSION });
    const photo = await toUploadJpeg('file://scan.heic', undefined, undefined, 'scan.heic');
    expect(photo).toEqual({ base64: 'SlBFRw==', name: 'scan.jpg', contentType: 'image/jpeg' });
    expect(mockContexts).toHaveLength(2);
    expect(mockContexts[0]?.resize).not.toHaveBeenCalled();
    expect(mockContexts[1]?.resize).toHaveBeenCalledWith({ height: PHOTO_MAX_DIMENSION });
    // The second pass scales the decoded image, not the file again.
    expect(mockContexts[1]?.source).toMatchObject({ width: 4000, height: 6000 });
  });

  it('leaves an image within the limit as it is', async () => {
    mockSizes.push({ width: 800, height: 600 });
    await toUploadJpeg('file://small.png', undefined, undefined, 'small.png');
    expect(mockContexts).toHaveLength(1);
    expect(mockContexts[0]?.resize).not.toHaveBeenCalled();
  });
});
