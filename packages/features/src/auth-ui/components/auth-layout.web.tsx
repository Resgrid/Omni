import { useActiveVariant } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import { Box, Heading, HStack, ScrollView, Text, useFormFactor, VStack } from '@resgrid/ui';
import { MapPinned, Radio, Users } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { AuthLayoutProps } from './auth-layout';

const FEATURES = [
  { icon: Radio, title: 'login.feature_dispatch_title', description: 'login.feature_dispatch_desc' },
  { icon: MapPinned, title: 'login.feature_mapping_title', description: 'login.feature_mapping_desc' },
  { icon: Users, title: 'login.feature_personnel_title', description: 'login.feature_personnel_desc' },
] as const;

/**
 * The web and Electron frame (Dispatch `login/index.web.tsx`): on a desktop-width window a branding panel beside the form
 * card; narrower windows get the same single column as native. Plain React Native styles for the panel, which renders
 * before the stylesheet on a cold web load.
 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, header, testID = 'auth-layout' }) => {
  const { t } = useTranslation();
  const variant = useActiveVariant();
  const { isDesktop, isWall } = useFormFactor();

  if (!isDesktop && !isWall) {
    return (
      <ScrollView className="bg-background-0" contentContainerStyle={styles.single} keyboardShouldPersistTaps="handled" testID={testID}>
        <Box className="w-full max-w-lg self-center p-4">
          {header ?? null}
          {children}
        </Box>
      </ScrollView>
    );
  }

  return (
    <View style={styles.split} testID={testID}>
      <View style={styles.branding} testID="auth-branding">
        <VStack space="lg">
          <Heading size="3xl" style={styles.brandingText}>
            {variant.identity.name}
          </Heading>
          <Text size="xl" style={styles.brandingText}>
            {t('login.branding_title')}
          </Text>
          <Text style={styles.brandingMuted}>{t('login.branding_subtitle')}</Text>
          <VStack space="md" className="mt-6">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <HStack key={title} space="md" className="items-start">
                <View style={styles.featureIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Icon size={22} color="#ffffff" />
                </View>
                <VStack className="flex-1">
                  <Text style={styles.brandingText} className="font-semibold">
                    {t(title)}
                  </Text>
                  <Text size="sm" style={styles.brandingMuted}>
                    {t(description)}
                  </Text>
                </VStack>
              </HStack>
            ))}
          </VStack>
        </VStack>
      </View>
      <ScrollView className="bg-background-0" style={styles.formColumn} contentContainerStyle={styles.single} keyboardShouldPersistTaps="handled">
        <Box className="w-full max-w-md self-center rounded-2xl p-8">
          {header ?? null}
          {children}
        </Box>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row' },
  branding: { flex: 1, justifyContent: 'center', padding: 48, backgroundColor: '#1e40af' },
  brandingText: { color: '#ffffff' },
  brandingMuted: { color: '#dbeafe' },
  featureIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  formColumn: { flex: 1 },
  single: { flexGrow: 1, justifyContent: 'center' },
});
