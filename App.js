// App.js
// Root App — Navigation + Session Management

import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';

import { getDB, getSession } from './src/db/database';
import { colors } from './src/theme';
import {
  AuthScreen,
  DashboardScreen,
  TransactionsScreen,
  BudgetManagerScreen,
  AssistantScreen,
  ProfileScreen,
} from './src/screens';

const Tab = createBottomTabNavigator();

export default function App() {
  const [profile,  setProfile]  = useState(null);
  const [booting,  setBooting]  = useState(true);

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  // Boot: init DB + restore session
  useEffect(() => {
    (async () => {
      try {
        await getDB(); // initializes schema + seeds categories
        const profileId = await getSession();
        if (profileId) {
          const db = await getDB();
          const p  = await db.getFirstAsync('SELECT * FROM profiles WHERE id = ?', [profileId]);
          if (p) setProfile(p);
        }
      } catch (e) {
        console.warn('Boot error:', e);
      }
      setBooting(false);
    })();
  }, []);

  if (booting || !fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 52, marginBottom: 16 }}>💎</Text>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!profile) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthScreen onLogin={setProfile} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={{ colors: { background: colors.bg } }}>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerStyle:      { backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1 },
            headerTintColor:  colors.text,
            headerTitleStyle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18 },
            tabBarStyle:      { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, height: 60, paddingBottom: 8 },
            tabBarActiveTintColor:   colors.accent,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarLabelStyle: { fontSize: 10, fontFamily: 'SpaceGrotesk_600SemiBold' },
            tabBarIcon: ({ focused }) => {
              const icons = { Dashboard: '📊', Transactions: '💳', Budgets: '🎯', 'AI Assistant': '🤖', Profile: '👤' };
              return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{icons[route.name]}</Text>;
            },
          })}
        >
          <Tab.Screen name="Dashboard">
            {props => <DashboardScreen {...props} profile={profile} />}
          </Tab.Screen>

          <Tab.Screen name="Transactions">
            {props => <TransactionsScreen {...props} profile={profile} />}
          </Tab.Screen>

          <Tab.Screen name="Budgets">
            {props => <BudgetManagerScreen {...props} profile={profile} />}
          </Tab.Screen>

          <Tab.Screen name="AI Assistant">
            {props => <AssistantScreen {...props} profile={profile} />}
          </Tab.Screen>

          <Tab.Screen name="Profile">
            {props => <ProfileScreen {...props} profile={profile} onLogout={() => {
              import('./src/db/database').then(({ clearSession }) => clearSession());
              setProfile(null);
            }} />}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
