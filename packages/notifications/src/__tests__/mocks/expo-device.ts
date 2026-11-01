// Stand-in for expo-device: a physical device unless a test says otherwise.
export let isDevice = true;

export const mockSetIsDevice = (value: boolean): void => {
  isDevice = value;
};
