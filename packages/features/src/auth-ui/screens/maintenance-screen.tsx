import { getAppVersionInfo } from '@resgrid/core';
import { useTranslation } from '@resgrid/i18n';
import { Box, Heading, ScrollView, Text, useThemeColors, VStack } from '@resgrid/ui';
import { AlertCircle, Clock, type LucideIcon, Mail } from 'lucide-react-native';
import React from 'react';
import { Linking, View } from 'react-native';

const SUPPORT_EMAIL = 'support@resgrid.com';

const InfoCard: React.FC<{ icon: LucideIcon; title: string; body: React.ReactNode; testID: string }> = ({ icon: Icon, title, body, testID }) => {
  const colors = useThemeColors();
  return (
    <Box className="rounded-2xl bg-background-50 p-6" testID={testID}>
      <View className="mb-4 size-12 items-center justify-center rounded-full bg-primary-100" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon size={24} color={colors.primary} />
      </View>
      <Heading size="sm" className="mb-2 uppercase">
        {title}
      </Heading>
      {body}
    </Box>
  );
};

/**
 * The maintenance page (BigBoard, fully translated; `capabilities.platform.maintenanceMode`). ShellGate shows it while the
 * web/Docker `MAINTENANCE_MODE` switch is on, so nothing here redirects; it names the build so support knows what is running.
 */
export function MaintenanceScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const version = getAppVersionInfo();

  return (
    <ScrollView className="flex-1 bg-background-0" contentContainerStyle={{ flexGrow: 1 }} testID="maintenance-screen">
      <VStack space="xl" className="w-full max-w-3xl self-center px-4 py-12">
        <VStack space="md" className="items-center">
          <View className="size-40 items-center justify-center rounded-full bg-primary-50" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <AlertCircle size={80} color={colors.primary} />
          </View>
          <Heading size="2xl" className="text-center" accessibilityRole="header">
            {t('maintenance.title')}
          </Heading>
          <Text className="text-center text-typography-600">{t('maintenance.message')}</Text>
        </VStack>
        <VStack space="md">
          <InfoCard icon={AlertCircle} title={t('maintenance.why_down_title')} body={<Text className="text-typography-600">{t('maintenance.why_down_message')}</Text>} testID="maintenance-why" />
          <InfoCard icon={Clock} title={t('maintenance.downtime_title')} body={<Text className="text-typography-600">{t('maintenance.downtime_message')}</Text>} testID="maintenance-downtime" />
          <InfoCard
            icon={Mail}
            title={t('maintenance.support_title')}
            body={
              <Text className="text-typography-600">
                {t('maintenance.support_message')}{' '}
                <Text className="text-primary-600 underline" accessibilityRole="link" onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} testID="maintenance-support-email">
                  {SUPPORT_EMAIL}
                </Text>
              </Text>
            }
            testID="maintenance-support"
          />
        </VStack>
        <VStack space="xs" className="items-center">
          <Text size="sm" className="text-typography-500">
            {t('maintenance.footer_copyright', { year: new Date().getFullYear() })}
          </Text>
          {version ? (
            <Text size="sm" className="text-typography-400" testID="maintenance-version">
              {t('settings.version_value', { version: version.version, build: version.buildNumber })}
            </Text>
          ) : null}
        </VStack>
      </VStack>
    </ScrollView>
  );
}

export default MaintenanceScreen;
