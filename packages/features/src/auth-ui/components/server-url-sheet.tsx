import { getSystemConfig } from '@resgrid/api';
import {
  CUSTOM_SERVER_VALUE,
  findLocationByUrl,
  getBaseApiUrl,
  getStoredServerUrlProblem,
  mergeServerLocations,
  RESGRID_HOSTED_LOCATIONS,
  type ResgridServerLocation,
  type ServerUrlProblem,
  switchServer,
  type SwitchServerResult,
  toBaseUrl,
  useIsAuthenticated,
  validateServerUrl,
} from '@resgrid/auth';
import { logger } from '@resgrid/core';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, CustomBottomSheet, Heading, HStack, Input, InputField, Pressable, Spinner, Text, VStack } from '@resgrid/ui';
import React, { useCallback, useEffect, useState } from 'react';

import { authUiApi, hasAuthUiApi } from '../lib/api-context';
import { notifyLoginServerChanged } from '../lib/login-server';
import { InlineError } from './inline-error';

export interface ServerUrlSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** After a save that switched servers (the previous session was signed out first by switchServer). */
  onChanged?: (result: Extract<SwitchServerResult, { ok: true }>) => void;
  /** http:// to localhost is allowed only in a development build; defaults to the build's own setting. */
  allowLocalHttp?: boolean;
}

const PROBLEM_KEYS: Record<ServerUrlProblem, string> = {
  empty: 'settings.server_url_required',
  invalid: 'settings.server_url_invalid',
  insecure: 'settings.server_url_insecure',
};

/** Hosted sites from the current server's `Config/GetSystemConfig`, always including Resgrid's own (Dispatch `loadServerLocations`). */
const loadServerLocations = async (): Promise<ResgridServerLocation[]> => {
  if (!hasAuthUiApi()) {
    return [...RESGRID_HOSTED_LOCATIONS];
  }
  try {
    const result = await getSystemConfig(authUiApi());
    return mergeServerLocations(result?.Data?.Locations ?? []);
  } catch {
    // The current server may be the unreachable one the member is trying to leave.
    return [...RESGRID_HOSTED_LOCATIONS];
  }
};

/**
 * The server selector (Dispatch sheet): a hosted site or a custom URL; https only, http only to localhost in a development
 * build. Saving goes through `switchServer`, which signs the current session out first (Responder's order) and drops the
 * cache. A legacy insecure server a previous build accepted is reported, not silently used.
 */
export const ServerUrlSheet: React.FC<ServerUrlSheetProps> = ({ isOpen, onClose, onChanged, allowLocalHttp }) => {
  const { t } = useTranslation();
  const isAuthenticated = useIsAuthenticated();
  const [locations, setLocations] = useState<ResgridServerLocation[]>([]);
  const [selected, setSelected] = useState<string>(CUSTOM_SERVER_VALUE);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storedProblem, setStoredProblem] = useState<ServerUrlProblem | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let cancelled = false;
    setError(null);
    setLoading(true);
    setStoredProblem(getStoredServerUrlProblem());
    void loadServerLocations().then((loaded) => {
      if (cancelled) {
        return;
      }
      const current = getBaseApiUrl();
      const match = findLocationByUrl(loaded, current);
      setLocations(loaded);
      setSelected(match ? match.Name : CUSTOM_SERVER_VALUE);
      setUrl(toBaseUrl(match ? match.ApiUrl : current));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const choose = useCallback(
    (name: string) => {
      setSelected(name);
      setError(null);
      const location = locations.find((item) => item.Name === name);
      if (location) {
        setUrl(toBaseUrl(location.ApiUrl));
      }
    },
    [locations]
  );

  const save = useCallback(async () => {
    const location = locations.find((item) => item.Name === selected);
    const target = selected === CUSTOM_SERVER_VALUE ? url : (location?.ApiUrl ?? url);
    const validation = validateServerUrl(target, allowLocalHttp);
    if (!validation.ok) {
      setError(t(PROBLEM_KEYS[validation.reason]));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await switchServer(validation.baseUrl, allowLocalHttp);
      if (!result.ok) {
        setError(t(PROBLEM_KEYS[result.reason]));
        return;
      }
      notifyLoginServerChanged();
      if (result.changed) {
        onChanged?.(result);
      }
      onClose();
    } catch (failure) {
      logger.error({ message: 'Switching servers failed', context: { errorType: failure instanceof Error ? failure.name : typeof failure } });
      setError(t('settings.server_url_save_failed'));
    } finally {
      setSaving(false);
    }
  }, [allowLocalHttp, locations, onChanged, onClose, selected, t, url]);

  const isCustom = selected === CUSTOM_SERVER_VALUE;
  const rows = [
    ...locations.map((location) => ({ value: location.Name, label: location.DisplayName || location.Name, description: toBaseUrl(location.ApiUrl) })),
    { value: CUSTOM_SERVER_VALUE, label: t('settings.custom'), description: undefined },
  ];

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={saving ? () => undefined : onClose} snapPoints={[80]} testID="server-url-sheet">
      <VStack space="md" className="w-full">
        <Heading size="md" accessibilityRole="header">
          {t('settings.server_url')}
        </Heading>
        {storedProblem ? (
          <Text size="sm" className="text-warning-700" testID="server-url-stored-problem">
            {t('settings.server_url_stored_insecure')}
          </Text>
        ) : null}
        {loading ? (
          <HStack space="sm" className="items-center py-2">
            <Spinner />
            <Text size="sm">{t('settings.loading_servers')}</Text>
          </HStack>
        ) : (
          <VStack space="xs" accessibilityRole="radiogroup" accessibilityLabel={t('settings.server')}>
            {rows.map((row) => {
              const isSelected = row.value === selected;
              return (
                <Pressable
                  key={row.value}
                  onPress={() => choose(row.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected, selected: isSelected }}
                  accessibilityLabel={row.label}
                  testID={`server-option-${row.value}`}
                  className={`rounded-lg border px-3 py-2 ${isSelected ? 'border-primary-600 bg-background-100' : 'border-outline-200'}`}
                >
                  <Text className={isSelected ? 'font-semibold' : ''}>{row.label}</Text>
                  {row.description ? (
                    <Text size="xs" className="text-typography-500">
                      {row.description}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </VStack>
        )}
        {isCustom ? (
          <VStack space="xs">
            <Text size="sm" className="font-medium">
              {t('settings.server_url')}
            </Text>
            <Input isInvalid={!!error} isDisabled={saving}>
              <InputField
                value={url}
                onChangeText={(value) => {
                  setUrl(value);
                  setError(null);
                }}
                placeholder={t('settings.enter_server_url')}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textContentType="URL"
                returnKeyType="done"
                onSubmitEditing={() => void save()}
                accessibilityLabel={t('settings.server_url')}
                aria-label={t('settings.server_url')}
                testID="server-url-input"
              />
            </Input>
          </VStack>
        ) : null}
        <Text size="xs" className="text-typography-500">
          {t('settings.server_url_note')}
        </Text>
        {isAuthenticated ? (
          <Text size="sm" className="text-warning-700" testID="server-url-signout-note">
            {t('settings.server_url_signs_out')}
          </Text>
        ) : null}
        <InlineError message={error} testID="server-url-error" />
        <HStack space="md">
          <Button variant="outline" action="secondary" className="flex-1" onPress={onClose} isDisabled={saving} accessibilityLabel={t('common.cancel')} testID="server-url-cancel">
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button action="primary" className="flex-1" onPress={() => void save()} isDisabled={saving || loading} accessibilityLabel={t('common.save')} testID="server-url-save">
            {saving ? <ButtonSpinner /> : <ButtonText>{t('common.save')}</ButtonText>}
          </Button>
        </HStack>
      </VStack>
    </CustomBottomSheet>
  );
};
