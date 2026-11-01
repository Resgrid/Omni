import { FeatureFlagKeys, type FeatureFlagStatus, recordsFieldFlagKey, useFeatureFlagStatus } from '@resgrid/auth';

/**
 * Field Records gate as a tri-state: the parent `Records.System` flag AND this app's child flag
 * (`Records.Field.<App>`). 'unknown' waits (a deep link never flashes a screen before flags resolve); BigBoard has no
 * child flag, so it is always 'disabled'. Unknown flags are disabled once flags have loaded.
 */
export function useRecordsFieldStatus(): FeatureFlagStatus {
  const system = useFeatureFlagStatus(FeatureFlagKeys.RecordsSystem);
  const childKey = recordsFieldFlagKey();
  const field = useFeatureFlagStatus(childKey ?? '__records_field_none__');
  if (!childKey) return 'disabled';
  if (system === 'disabled' || field === 'disabled') return 'disabled';
  if (system === 'unknown' || field === 'unknown') return 'unknown';
  return 'enabled';
}
