import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StatusBar, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getDB, getSession } from './src/db/database';
import { colors } from './src/theme';
import {
  AssistantScreen,
  AuthScreen,
  BudgetManagerScreen,
  DashboardScreen,
  ProfileScreen,
  TransactionsScreen,
} from './src/screens';

const Tab = createBottomTabNavigator();
const isWindows = Platform.OS === 'windows';
const headerTitleStyle = isWindows
  ? { fontSize: 18 }
  : { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18 };
const tabBarLabelStyle = isWindows
  ? { fontSize: 10 }
  : { fontSize: 10, fontFamily: 'SpaceGrotesk_600SemiBold' };
const icons = {
  Dashboard: 'D',
  Transactions: 'T',
  Budgets: 'B',
  'AI Assistant': 'AI',
  Profile: 'P',
};

export default function App() {
  const [profile, setProfile] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        await getDB();
        const profileId = await getSession();
        if (profileId) {
          const db = await getDB();
          const existingProfile = await db.getFirstAsync('SELECT * FROM profiles WHERE id = ?', [profileId]);
          if (existingProfile) {
            setProfile(existingProfile);
          }
        }
      } catch (error) {
        console.warn('Boot error:', error);
      }
      setBooting(false);
    })();
  }, []);

  if (booting) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 40, marginBottom: 16, color: colors.text }}>FinSight</Text>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!profile) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <AuthScreen onLogin={setProfile} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <NavigationContainer theme={{ colors: { background: colors.bg } }}>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerStyle: { backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1 },
            headerTintColor: colors.text,
            headerTitleStyle,
            tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, height: 60, paddingBottom: 8 },
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarLabelStyle,
            tabBarIcon: ({ focused }) => (
              <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5, color: focused ? colors.accent : colors.textMuted }}>
                {icons[route.name]}
              </Text>
            ),
          })}
        >
          <Tab.Screen name="Dashboard">
            {(props) => <DashboardScreen {...props} profile={profile} />}
          </Tab.Screen>
          <Tab.Screen name="Transactions">
            {(props) => <TransactionsScreen {...props} profile={profile} />}
          </Tab.Screen>
          <Tab.Screen name="Budgets">
            {(props) => <BudgetManagerScreen {...props} profile={profile} />}
          </Tab.Screen>
          <Tab.Screen name="AI Assistant">
            {(props) => <AssistantScreen {...props} profile={profile} />}
          </Tab.Screen>
          <Tab.Screen name="Profile">
            {(props) => (
              <ProfileScreen
                {...props}
                profile={profile}
                onLogout={() => {
                  import('./src/db/database').then(({ clearSession }) => clearSession());
                  setProfile(null);
                }}
              />
            )}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
