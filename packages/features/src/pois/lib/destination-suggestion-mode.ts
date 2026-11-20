import { DestinationSuggestionModes, type GetConfigResultData } from '@resgrid/models';

/**
 * The department's destination suggestions mode as its config says (`Config/GetConfig` `DestinationSuggestionMode`,
 * setting 127), for every screen that offers suggestions:
 * - a loaded config without the field comes from a server that predates destination suggestions: Off, nothing is asked;
 * - no config at all (its load failed) is unknown: null. The call form may then ask and let the answer's `Mode` decide;
 *   the status picker reads null as Off, so Set Status is never held for a setting it cannot read.
 * A value this app does not know reads as Off.
 */
export const configuredDestinationSuggestionMode = (config: Pick<GetConfigResultData, 'DestinationSuggestionMode'> | null | undefined): DestinationSuggestionModes | null => {
  if (!config) return null;

  switch (Number(config.DestinationSuggestionMode)) {
    case DestinationSuggestionModes.Suggest:
      return DestinationSuggestionModes.Suggest;
    case DestinationSuggestionModes.SuggestAndFill:
      return DestinationSuggestionModes.SuggestAndFill;
    default:
      return DestinationSuggestionModes.Off;
  }
};
