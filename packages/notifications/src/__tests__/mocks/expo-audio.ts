// Stand-in for expo-audio: players record what they were asked to play.
export interface MockAudioPlayer {
  uri: string;
  loop: boolean;
  volume: number;
  isLoaded: boolean;
  play: jest.Mock;
  seekTo: jest.Mock;
  remove: jest.Mock;
}

export const mockAudioState = { players: [] as MockAudioPlayer[], played: [] as string[] };

export const createAudioPlayer = jest.fn((source: { uri: string }) => {
  const player: MockAudioPlayer = {
    uri: source.uri,
    loop: true,
    volume: 0,
    isLoaded: true,
    play: jest.fn(() => {
      mockAudioState.played.push(source.uri);
    }),
    seekTo: jest.fn(async () => undefined),
    remove: jest.fn(),
  };
  mockAudioState.players.push(player);
  return player;
});

export const setAudioModeAsync = jest.fn(async (_mode: unknown) => undefined);

export const mockResetAudio = (): void => {
  mockAudioState.players = [];
  mockAudioState.played = [];
};
