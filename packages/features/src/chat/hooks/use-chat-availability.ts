import { FeatureFlagKeys, useFeatureFlagStatus } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';

export type ChatAvailability = 'unknown' | 'enabled' | 'disabled';

/**
 * Whether chat exists here: the variant must have the chat hub (`capabilities.realtime.chatHub`) and the department
 * the `Chat.System` flag. While flags are still loading the answer is 'unknown' (a deep link must not be bounced home
 * before they land); an unknown flag after load is disabled. With the flag off every chat endpoint 404s.
 */
export const useChatAvailability = (): ChatAvailability => {
  const { chatHub } = useCapability('realtime');
  const flag = useFeatureFlagStatus(FeatureFlagKeys.ChatSystem);
  if (!chatHub) return 'disabled';
  return flag;
};
