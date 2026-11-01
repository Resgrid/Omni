import '../sections/built-in';

import { useIsAuthenticated } from '@resgrid/auth';
import { useActiveVariant } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import { Heading, ScrollView, useFormFactor, VStack } from '@resgrid/ui';
import React, { useMemo, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { SettingsCard } from '../components/settings-row';
import { getSettingsSections, type SettingsSectionContext, subscribeSettingsSections } from '../registry';

let registryVersion = 0;
const subscribe = (listener: () => void): (() => void) =>
  subscribeSettingsSections(() => {
    registryVersion += 1;
    listener();
  });
const getRegistryVersion = (): number => registryVersion;

/**
 * Settings for every variant (omni-plan §7.10): the registered sections the variant's capabilities and the session allow,
 * in order, each in its own card. Phones get one column; wider screens a readable centred column.
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const manifest = useActiveVariant();
  const isAuthenticated = useIsAuthenticated();
  const { isPhone } = useFormFactor();
  const version = useSyncExternalStore(subscribe, getRegistryVersion, getRegistryVersion);

  const context = useMemo<SettingsSectionContext>(() => ({ manifest, capabilities: manifest.capabilities, isAuthenticated, platform: Platform.OS }), [isAuthenticated, manifest]);
  // `version` re-reads the registry when a section registers late.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sections = useMemo(() => getSettingsSections(context), [context, version]);

  return (
    <ScrollView className="flex-1 bg-background-50" contentContainerStyle={{ padding: 16 }} testID="settings-screen">
      <VStack className={`w-full self-center ${isPhone ? '' : 'max-w-3xl'}`}>
        <Heading size="xl" className="mb-4" accessibilityRole="header">
          {t('settings.title')}
        </Heading>
        {sections.map((section) => (
          <SettingsCard key={section.id} title={t(section.title)} testID={`settings-section-${section.id}`}>
            {section.render(context)}
          </SettingsCard>
        ))}
      </VStack>
    </ScrollView>
  );
}

export default SettingsScreen;
