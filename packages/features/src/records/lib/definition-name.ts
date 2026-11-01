import { useDefinitionTerm } from '@resgrid/auth';

const SYSTEM_DEFINITION_PREFIX = 'system.';

/** A built-in definition's key made readable ("system.unit-activity" → "Unit activity"); other keys come back as they are. */
export const readableDefinitionKey = (definitionKey?: string | null): string => {
  if (!definitionKey) return '';
  if (!definitionKey.startsWith(SYSTEM_DEFINITION_PREFIX)) return definitionKey;
  const words = definitionKey.substring(SYSTEM_DEFINITION_PREFIX.length).replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : definitionKey;
};

/** The department's word for a built-in type, else the catalog's name, else the key made readable. Display only: the key sent to the server never changes. */
export const useDefinitionDisplayName = (definitionKey?: string | null, name?: string | null): string => useDefinitionTerm(definitionKey, name || readableDefinitionKey(definitionKey));
