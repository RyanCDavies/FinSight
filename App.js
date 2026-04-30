import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
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

function IconBlock({ style, color }) {
  return <View style={[style, { backgroundColor: color }]} />;
}

function CategoryIcon({ routeName, focused }) {
  const color = focused ? colors.accent : colors.textMuted;

  if (routeName === 'Dashboard') {
    return (
      <View style={styles.iconGrid}>
        {[0, 1, 2, 3].map((cell) => (
          <IconBlock key={cell} style={styles.gridCell} color={color} />
        ))}
      </View>
    );
  }

  if (routeName === 'Transactions') {
    return (
      <View style={styles.transactionsIcon}>
        <IconBlock style={styles.transactionBarWide} color={color} />
        <IconBlock style={styles.transactionBarWide} color={color} />
      </View>
    );
  }

  if (routeName === 'Budgets') {
    return (
      <View style={[styles.walletBody, { backgroundColor: color }]}>
        <View style={[styles.walletFold, { backgroundColor: color }]} />
        <View style={[styles.walletCutout, { backgroundColor: colors.surface }]} />
      </View>
    );
  }

  if (routeName === 'AI Assistant') {
    return (
      <View style={styles.aiIcon}>
        <IconBlock style={styles.aiCore} color={color} />
        <View style={[styles.aiOrbitVertical, { borderColor: color }]} />
        <View style={[styles.aiOrbitHorizontal, { borderColor: color }]} />
      </View>
    );
  }

  return (
    <View style={styles.profileIcon}>
      <View style={[styles.profileHead, { backgroundColor: color }]} />
      <View style={[styles.profileBody, { backgroundColor: color }]} />
    </View>
  );
}

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
            tabBarStyle: {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              borderTopWidth: 1,
              height: 82,
              paddingTop: 8,
              paddingBottom: 12,
            },
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarLabelPosition: 'below-icon',
            tabBarShowLabel: true,
            tabBarLabelStyle: [tabBarLabelStyle, styles.tabBarLabel],
            tabBarItemStyle: styles.tabBarItem,
            tabBarIconStyle: styles.tabBarIcon,
            tabBarIcon: ({ focused }) => <CategoryIcon routeName={route.name} focused={focused} />,
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

const styles = StyleSheet.create({
  tabBarItem: {
    paddingVertical: 4,
  },
  tabBarIcon: {
    marginBottom: 6,
  },
  tabBarLabel: {
    textAlign: 'center',
    marginTop: 2,
  },
  iconGrid: {
    width: 24,
    height: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'space-between',
  },
  gridCell: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  transactionsIcon: {
    width: 24,
    height: 24,
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  transactionBarWide: {
    width: 20,
    height: 5,
    borderRadius: 999,
  },
  walletBody: {
    width: 24,
    height: 18,
    borderRadius: 6,
    justifyContent: 'center',
    paddingLeft: 3,
  },
  walletFold: {
    width: 11,
    height: 8,
    borderRadius: 3,
    opacity: 0.4,
  },
  walletCutout: {
    position: 'absolute',
    right: 4,
    width: 4.5,
    height: 4,
    borderRadius: 999,
  },
  aiIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiCore: {
    width: 10,
    height: 10,
    borderRadius: 4,
  },
  aiOrbitVertical: {
    position: 'absolute',
    width: 16,
    height: 24,
    borderRadius: 999,
    borderWidth: 3,
  },
  aiOrbitHorizontal: {
    position: 'absolute',
    width: 24,
    height: 16,
    borderRadius: 999,
    borderWidth: 3,
  },
  profileIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  profileHead: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginBottom: 2,
  },
  profileBody: {
    width: 18,
    height: 10,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },
});
