import { ApiError, getTraining, getTrainingTranscript } from '@resgrid/api';
import type { LearningRecordData, TrainingDetailData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, flush } from '../../__tests__/helpers';
import { useTrainingStore } from '../training-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getTraining: jest.fn(),
  getTrainingTranscript: jest.fn(),
}));

const envelope = { PageSize: 1, Timestamp: '', Version: '', Node: '', RequestId: '', Status: 'success', Environment: '' };

type TranscriptResponse = Awaited<ReturnType<typeof getTrainingTranscript>>;

const detail = (TrainingId: number): TrainingDetailData =>
  // SAFETY: a test double: it carries only the fields the code under test reads.
  ({ TrainingId, Name: `T${TrainingId}` }) as TrainingDetailData;

const record = (Id: number): LearningRecordData =>
  // SAFETY: a test double: it carries only the fields the code under test reads.
  ({ Id, Title: `R${Id}` }) as LearningRecordData;

const transcript = (records: LearningRecordData[]): TranscriptResponse =>
  // SAFETY: a test double: a v4 list envelope with the records the store reads.
  ({ ...envelope, Data: records }) as TranscriptResponse;

beforeEach(async () => {
  jest.clearAllMocks();
  await createDataTestRuntime({ variant: 'responder' });
  await defaultResetRegistry.getStoreResets().get('data.training')?.('logout');
});

describe('training store reads', () => {
  it('drops the offline copy of a training Core says is gone, and keeps it when the read fails', async () => {
    useTrainingStore.setState({ trainingsById: { 3: detail(3), 4: detail(4) } });

    // SAFETY: a test double: Core's not_found envelope (HTTP 200), which carries no data.
    jest.mocked(getTraining).mockResolvedValueOnce({ ...envelope, Status: 'not_found', Data: null } as never);
    await expect(useTrainingStore.getState().fetchTraining(3, { bypassCache: true })).resolves.toBeNull();
    expect(Object.keys(useTrainingStore.getState().trainingsById)).toEqual(['4']);

    jest.mocked(getTraining).mockRejectedValueOnce(new ApiError({ kind: 'network' }));
    await expect(useTrainingStore.getState().fetchTraining(4, { bypassCache: true })).resolves.toEqual(detail(4));
    expect(Object.keys(useTrainingStore.getState().trainingsById)).toEqual(['4']);
  });

  it('reads the transcript again after a read already in flight when a refresh asks for it (after a write)', async () => {
    let release: (response: TranscriptResponse) => void = () => undefined;
    jest
      .mocked(getTrainingTranscript)
      .mockImplementationOnce(
        () =>
          new Promise<TranscriptResponse>((resolve) => {
            release = resolve;
          })
      )
      .mockResolvedValueOnce(transcript([record(1), record(2)]));

    const first = useTrainingStore.getState().fetchTranscript();
    const refresh = useTrainingStore.getState().fetchTranscript({ bypassCache: true });

    release(transcript([record(1)]));
    await Promise.all([first, refresh]);
    await flush();

    expect(getTrainingTranscript).toHaveBeenCalledTimes(2);
    expect(useTrainingStore.getState().transcript.map((item) => item.Id)).toEqual([1, 2]);
  });
});
