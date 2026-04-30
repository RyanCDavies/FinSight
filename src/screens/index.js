// src/screens/index.js
// Layer 1: Presentation Layer — All Screens
// React Native versions of all 6 UI screens

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Pressable, Image,
  StyleSheet, Alert, SectionList, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radius, spacing, font } from '../theme';
import { Card, Btn, Input, Badge, ProgressBar, ScreenLoader, SectionHeader, BottomSheet, CategoryPill } from '../components';
import {
  AuthSecurityService, FinancialDataService, ImportIntegrationService,
  BudgetingGoalService, LocalAIService, ReportingAnalyticsService, seedDemoData,
} from '../services';
import { saveSession, clearSession, getDB } from '../db/database';
import { emitDataChanged, subscribeToDataChanges } from '../db/changeEvents';
import { addCsvDropListener, pickCsvTextAsync, setCsvDropEnabled } from '../platform/csvImport';
import { scanTransactionImageAsync } from '../platform/ocrScan';

function isTextIcon(icon) {
  return /^[A-Za-z][A-Za-z0-9\s&/-]*$/.test(String(icon || '').trim());
}

function parseTransactionDate(dateValue) {
  if (!dateValue || typeof dateValue !== 'string') return null;
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function buildTransactionSections(transactions) {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const lastWeek = [];
  const monthlyGroups = new Map();
  const yearlyGroups = new Map();

  transactions.forEach((transaction) => {
    const parsedDate = parseTransactionDate(transaction.date);
    if (!parsedDate) {
      const fallbackYear = String(transaction.date || 'Older').slice(0, 4) || 'Older';
      if (!yearlyGroups.has(fallbackYear)) yearlyGroups.set(fallbackYear, []);
      yearlyGroups.get(fallbackYear).push(transaction);
      return;
    }

    const txDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
    const diffDays = Math.floor((todayStart - txDay) / 86400000);

    if (diffDays <= 6) {
      lastWeek.push(transaction);
      return;
    }

    if (parsedDate.getFullYear() === todayStart.getFullYear()) {
      const monthKey = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyGroups.has(monthKey)) monthlyGroups.set(monthKey, []);
      monthlyGroups.get(monthKey).push(transaction);
      return;
    }

    const yearKey = String(parsedDate.getFullYear());
    if (!yearlyGroups.has(yearKey)) yearlyGroups.set(yearKey, []);
    yearlyGroups.get(yearKey).push(transaction);
  });

  const sections = [];
  if (lastWeek.length) sections.push({ title: 'Past 7 Days', data: lastWeek });

  Array.from(monthlyGroups.keys())
    .sort((a, b) => b.localeCompare(a))
    .forEach((monthKey) => {
      const [year, month] = monthKey.split('-').map(Number);
      const monthLabel = new Date(year, month - 1, 1).toLocaleString('en-US', {
        month: 'long',
        year: 'numeric',
      });
      sections.push({ title: monthLabel, data: monthlyGroups.get(monthKey) });
    });

  Array.from(yearlyGroups.keys())
    .sort((a, b) => Number(b) - Number(a))
    .forEach((year) => {
      sections.push({ title: year, data: yearlyGroups.get(year) });
    });

  return sections;
}

function getCategoryLabel(category) {
  if (!category) return '';
  const name = String(category.name || '').trim();
  const icon = String(category.icon || '').trim();
  if (!icon || isTextIcon(icon)) return name;
  return `${icon} ${name}`;
}

function formatModelSize(sizeBytes) {
  if (!sizeBytes) return 'Unknown size';
  return `${Math.round(sizeBytes / (1024 * 1024))} MB`;
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function createEmptyTransactionForm() {
  return { date: getTodayIsoDate(), merchant: '', amount: '', category_id: '', note: '' };
}

function validateTransactionForm(form) {
  if (!form.date.trim()) {
    return { title: 'Missing Field', message: 'Please enter a date.' };
  }
  if (!form.merchant.trim()) {
    return { title: 'Missing Field', message: 'Please enter a merchant name.' };
  }

  const parsedAmount = parseFloat(form.amount);
  if (!form.amount.trim() || Number.isNaN(parsedAmount)) {
    return { title: 'Invalid Amount', message: 'Please enter a valid number for the amount (e.g. -12.50).' };
  }

  return { parsedAmount };
}

function isMobilePlatform() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function SelectablePill({ label, active, onPress, activeStyle, activeTextStyle, style }) {
  const [hovered, setHovered] = useState(false);
  const isWindows = Platform.OS === 'windows';

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={isWindows ? () => setHovered(true) : undefined}
      onHoverOut={isWindows ? () => setHovered(false) : undefined}
      style={[
        styles.filterPill,
        hovered && !active && styles.filterPillHover,
        active && styles.filterPillActive,
        active && activeStyle,
        style,
      ]}
    >
      <Text style={[styles.filterPillText, active && styles.filterPillTextActive, active && activeTextStyle]}>
        {label}
      </Text>
    </Pressable>
  );
}

function TransactionFormFields({ form, setForm, categories }) {
  return (
    <View>
      <Input label="Date (YYYY-MM-DD)" value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))} placeholder="2025-01-15" />
      <Input label="Merchant" value={form.merchant} onChangeText={v => setForm(f => ({ ...f, merchant: v }))} placeholder="e.g. Starbucks" />
      <Input label="Amount (negative = expense)" value={form.amount} onChangeText={v => setForm(f => ({ ...f, amount: v }))} placeholder="-12.50" keyboardType="numeric" />
      <Text style={styles.inputLabel}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS !== 'windows'} style={styles.sheetChipScroll} contentContainerStyle={styles.sheetChipScrollContent}>
        {categories.map(c => (
          <SelectablePill
            key={c.id}
            label={`${c.icon} ${c.name}`}
            active={form.category_id === c.id}
            activeStyle={{ backgroundColor: c.color, borderColor: c.color }}
            onPress={() => setForm(f => ({ ...f, category_id: c.id }))}
          />
        ))}
      </ScrollView>
      <Input label="Note (optional)" value={form.note} onChangeText={v => setForm(f => ({ ...f, note: v }))} placeholder="Optional note" />
    </View>
  );
}

function formatMoney(amount, digits = 2) {
  const numericAmount = Number(amount || 0);
  const factor = 10 ** digits;
  const truncated = Math.trunc(numericAmount * factor) / factor;
  const fixed = truncated.toFixed(digits);
  const [whole, fraction] = fixed.split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction !== undefined ? `$${withCommas}.${fraction}` : `$${withCommas}`;
}

function formatScaleMoney(amount) {
  return amount >= 1000 ? `$${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k` : `$${amount}`;
}

function getChartGridStep(maxValue) {
  if (maxValue <= 1000) return 250;
  if (maxValue <= 2000) return 500;
  return 1000;
}

function getChartScale(maxValue) {
  const step = getChartGridStep(maxValue);
  const roundedTop = Math.ceil((maxValue || 1) / step) * step;
  const topLine = Math.max(step * 3, roundedTop);
  const gridValues = [topLine - step * 3, topLine - step * 2, topLine - step, topLine].map((value) => Math.max(0, value));
  const baseline = gridValues[0];

  return {
    baseline,
    chartMax: topLine,
    gridValues,
  };
}

function CashFlowChartCard({ monthlyTrend, totalSpend, totalIncome, lastMonthSpend }) {
  const [mode, setMode] = useState('spend');
  const [activeMonthKey, setActiveMonthKey] = useState(null);
  const chartColor = mode === 'spend' ? colors.danger : colors.success;
  const activeBarColor = mode === 'spend' ? '#f87171' : '#34d399';
  const values = monthlyTrend.map((month) => (mode === 'spend' ? month.spend : month.income));
  const maxValue = Math.max(...values, 0);
  const { baseline, chartMax, gridValues } = getChartScale(maxValue);
  const chartRange = Math.max(chartMax - baseline, 1);
  const currentMonth = monthlyTrend[monthlyTrend.length - 1] || { spend: totalSpend, income: totalIncome };
  const previousMonth = monthlyTrend[monthlyTrend.length - 2] || { spend: lastMonthSpend, income: 0 };
  const currentValue = mode === 'spend' ? currentMonth.spend : currentMonth.income;
  const previousValue = mode === 'spend' ? previousMonth.spend : previousMonth.income;
  const change = previousValue ? ((currentValue - previousValue) / previousValue) * 100 : null;

  return (
    <Card style={styles.heroCard}>
      <View style={styles.heroHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroLabel}>6-MONTH CASH FLOW</Text>
          <Text style={styles.heroSubLabel}>
            {mode === 'spend' ? 'Monthly spending over the last 6 months' : 'Monthly income over the last 6 months'}
          </Text>
        </View>
        <View style={styles.heroToggle}>
          <Pressable onPress={() => setMode('spend')} style={[styles.heroToggleChip, mode === 'spend' && styles.heroToggleChipActive]}>
            <Text style={[styles.heroToggleText, mode === 'spend' && styles.heroToggleTextActive]}>Spending</Text>
          </Pressable>
          <Pressable onPress={() => setMode('income')} style={[styles.heroToggleChip, mode === 'income' && styles.heroToggleChipActive]}>
            <Text style={[styles.heroToggleText, mode === 'income' && styles.heroToggleTextActive]}>Income</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.heroAmountRow}>
        <Text style={styles.heroAmount}>{formatMoney(currentValue)}</Text>
        {change !== null && (
          <Badge color={change > 0 ? (mode === 'spend' ? colors.danger : colors.success) : (mode === 'spend' ? colors.success : colors.danger)}>
            {change > 0 ? '+' : '-'}{Math.abs(change).toFixed(1)}%
          </Badge>
        )}
      </View>

      <View style={styles.chartWrap}>
        <View style={styles.chartArea}>
          {gridValues.map((value) => (
            <View
              key={value}
              style={[styles.chartGridLine, { bottom: `${((value - baseline) / chartRange) * 100}%` }]}
              pointerEvents="none"
            >
              <Text style={styles.chartGridLabel}>{formatScaleMoney(value)}</Text>
              <View style={styles.chartGridStroke} />
            </View>
          ))}

          <View style={styles.chartBarsRow}>
            {monthlyTrend.map((month) => {
              const value = mode === 'spend' ? month.spend : month.income;
              const isActive = month.key === activeMonthKey;
              const normalizedValue = Math.max(value - baseline, 0);
              const barHeight = normalizedValue > 0 ? Math.max(12, (normalizedValue / chartRange) * 136) : 6;

              return (
                <View key={month.key} style={styles.chartColumn}>
                  <View style={styles.chartBarSlot}>
                    {isActive && (
                      <View style={styles.chartTooltip} pointerEvents="none">
                        <Text style={styles.chartTooltipMonth}>{month.fullLabel}</Text>
                        <Text style={styles.chartTooltipValue}>{formatMoney(value)}</Text>
                      </View>
                    )}
                    <Pressable
                      onPress={() => setActiveMonthKey((current) => (current === month.key ? null : month.key))}
                      onHoverIn={Platform.OS === 'windows' ? () => setActiveMonthKey(month.key) : undefined}
                      onHoverOut={Platform.OS === 'windows' ? () => setActiveMonthKey(null) : undefined}
                      style={styles.chartBarPressable}
                    >
                      <View
                        style={[
                          styles.chartBar,
                          {
                            height: barHeight,
                            backgroundColor: isActive ? activeBarColor : chartColor,
                          },
                        ]}
                      />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
        <View style={styles.chartMonthRow}>
          {monthlyTrend.map((month) => (
            <View key={`${month.key}-label`} style={styles.chartMonthColumn}>
              <Text style={styles.chartMonthLabel}>{month.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.heroStatsRow}>
        <View>
          <Text style={styles.statLabel}>Current Mode</Text>
          <Text style={[styles.statValue, { color: chartColor }]}>{mode === 'spend' ? 'Spending' : 'Income'}</Text>
        </View>
        <View>
          <Text style={styles.statLabel}>Last Month</Text>
          <Text style={styles.statValue}>{formatMoney(previousValue)}</Text>
        </View>
        <View>
          <Text style={styles.statLabel}>Balance</Text>
          <Text style={[styles.statValue, { color: totalIncome - totalSpend >= 0 ? colors.success : colors.danger }]}>
            {formatMoney(totalIncome - totalSpend)}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function buildAssistantContext(data) {
  return {
    summary: `Spent: $${data.totalSpend.toFixed(2)}, Income: $${data.totalIncome.toFixed(2)}`,
    totalSpend: data.totalSpend,
    totalIncome: data.totalIncome,
    spendByCategory: Object.fromEntries(
      Object.entries(data.spendByCategory).map(([key, value]) => [data.cats.find(c => c.id === key)?.name || key, value])
    ),
    budgets: data.budgets.map((budget) => ({
      category: data.cats.find(c => c.id === budget.category_id)?.name,
      limit: budget.limit_amount,
      spent: budget.spent,
    })),
    anomalies: data.anomalies.map((anomaly) => anomaly.description),
    subscriptions: data.subscriptions,
  };
}

// ─────────────────────────────────────────────
// Auth Screen
// ─────────────────────────────────────────────

export function AuthScreen({ onLogin }) {
  const [mode,    setMode]    = useState('login');
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('demo@finsight.app');
  const [pin,     setPin]     = useState('1234');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true); setError('');
    if (mode === 'register') {
      const result = await AuthSecurityService.createProfile(name, email, pin);
      if (result.error) { setError(result.error); setLoading(false); return; }
      await seedDemoData(result.profile.id);
      await saveSession(result.profile.id);
      onLogin(result.profile);
    } else {
      const result = await AuthSecurityService.login(email, pin);
      if (result.error) { setError(result.error); setLoading(false); return; }
      await saveSession(result.profile.id);
      onLogin(result.profile);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.authContainer}>
      <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.authLogo}>
          <Text style={{ fontSize: 52 }}>💎</Text>
          <Text style={styles.authTitle}>FinSight</Text>
          <Text style={styles.authSubtitle}>Your private finance advisor</Text>
        </View>

        <Card>
          {/* Tab Toggle */}
          <View style={styles.tabRow}>
            {['login', 'register'].map(m => (
              <TouchableOpacity key={m} onPress={() => setMode(m)} style={[styles.tab, mode === m && styles.tabActive]}>
                <Text style={[styles.tabText, mode === m && { color: '#fff' }]}>
                  {m === 'login' ? 'Sign In' : 'Create Account'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'register' && <Input label="Full Name" value={name} onChangeText={setName} placeholder="Jane Doe" icon="👤" />}
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@email.com" icon="✉️" keyboardType="email-address" />
          <Input label="4-Digit PIN" value={pin} onChangeText={setPin} placeholder="••••" secureTextEntry icon="🔐" keyboardType="numeric" />

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Btn onPress={handleSubmit} disabled={loading} fullWidth>
            {loading ? 'Loading...' : mode === 'login' ? 'Unlock FinSight →' : 'Create Account →'}
          </Btn>

          {mode === 'login' && (
            <Text style={styles.demoHint}>Demo: demo@finsight.app / 1234</Text>
          )}
        </Card>

        <Text style={styles.privacyNote}>🔒 All data encrypted & stored locally. Never transmitted.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────
// Dashboard Screen
// ─────────────────────────────────────────────

export function DashboardScreen({ profile, navigation }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await ReportingAnalyticsService.getDashboardData(profile.id);
    setData(d);
    setLoading(false);
  }, [profile.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => subscribeToDataChanges(load), [load]);

  if (loading || !data) return <ScreenLoader />;

  const { totalSpend, lastMonthSpend, totalIncome, monthlyTrend, spendByCategory, cats, budgets, recommendations, anomalies, subscriptions, forecasts } = data;
  const topCategories  = Object.entries(spendByCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const monthLabel     = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.dashHeader}>
        <View>
          <Text style={styles.greeting}>Hello, {profile.name.split(' ')[0]} 👋</Text>
          <Text style={styles.screenTitle}>Financial Overview</Text>
        </View>
        <View style={styles.monthBadge}>
          <Text style={{ color: colors.accent, fontSize: font.sizes.xs, fontWeight: font.weights.semibold }}>{monthLabel}</Text>
        </View>
      </View>

      {/* Hero spend card */}
      <CashFlowChartCard
        monthlyTrend={monthlyTrend}
        totalSpend={totalSpend}
        totalIncome={totalIncome}
        lastMonthSpend={lastMonthSpend}
      />

      {/* Anomaly alert */}
      {anomalies.length > 0 && (
        <View style={styles.alertBox}>
          <Text style={{ fontSize: 20 }}>🚨</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>Anomaly Detected</Text>
            <Text style={styles.alertBody}>{anomalies[0].description}</Text>
          </View>
        </View>
      )}

      {/* Budget Status */}
      {budgets.length > 0 && (
        <Card style={styles.sectionCard}>
          <SectionHeader title="Budget Status" action="View All →" onAction={() => navigation.navigate('Budgets')} />
          {budgets.slice(0, 3).map(b => {
            const cat = cats.find(c => c.id === b.category_id);
            return (
              <View key={b.id} style={{ marginBottom: 14 }}>
                <View style={styles.budgetRow}>
                  <Text style={styles.budgetName}>{getCategoryLabel(cat) || b.category_id}</Text>
                  <Text style={styles.budgetAmt}>${b.spent.toFixed(0)} / ${b.limit_amount}</Text>
                </View>
                <ProgressBar value={b.spent} max={b.limit_amount} color={cat?.color || colors.accent} />
              </View>
            );
          })}
        </Card>
      )}

      {/* Top Spending */}
      {topCategories.length > 0 && (
        <Card style={styles.sectionCard}>
          <SectionHeader title="Top Spending" />
          {topCategories.map(([catId, amt]) => {
            const cat = cats.find(c => c.id === catId);
            const pct = totalSpend ? (amt / totalSpend * 100).toFixed(0) : 0;
            return (
              <View key={catId} style={styles.topSpendRow}>
                <View style={[styles.catIcon, { backgroundColor: `${cat?.color || colors.accent}20` }]}>
                  <Text style={{ fontSize: 18 }}>{cat?.icon || '📦'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={styles.catName}>{cat?.name || catId}</Text>
                    <Text style={styles.catAmt}>${amt.toFixed(0)}</Text>
                  </View>
                  <ProgressBar value={amt} max={totalSpend} color={cat?.color || colors.accent} />
                </View>
                <Text style={styles.pctLabel}>{pct}%</Text>
              </View>
            );
          })}
        </Card>
      )}

      {/* AI Insights */}
      {recommendations.length > 0 && (
        <Card style={styles.sectionCard}>
          <SectionHeader title="💡 AI Insights" />
          {recommendations.map((rec, i) => (
            <View key={i} style={[styles.recRow, i < recommendations.length - 1 && styles.divider]}>
              <Text style={{ fontSize: 18 }}>{rec.icon}</Text>
              <Text style={styles.recText}>{rec.text}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Zombie Subscriptions */}
      {subscriptions.length > 0 && (
        <Card style={styles.sectionCard}>
          <SectionHeader title="🧟 Zombie Subscriptions" />
          {subscriptions.slice(0, 3).map((s, i) => (
            <View key={i} style={[styles.subRow, i < subscriptions.length - 1 && styles.divider]}>
              <View>
                <Text style={styles.subMerchant}>{s.merchant}</Text>
                <Text style={styles.subMeta}>{s.frequency} · last seen {s.last_seen?.slice(0, 10)}</Text>
              </View>
              <Badge color={colors.warning}>${Math.abs(s.amount).toFixed(2)}/mo</Badge>
            </View>
          ))}
        </Card>
      )}

      {/* Forecasts */}
      {forecasts.length > 0 && (
        <Card style={styles.sectionCard}>
          <SectionHeader title="📈 Spending Forecast" />
          <View style={styles.forecastGrid}>
            {forecasts.slice(0, 4).map(({ category, forecast }) => (
              <View key={category.id} style={styles.forecastCell}>
                <Text style={styles.forecastCat}>{category.icon} {category.name}</Text>
                <Text style={styles.forecastAmt}>${forecast.predicted.toFixed(0)}</Text>
                <Text style={styles.forecastConf}>{Math.round(forecast.confidence * 100)}% confidence</Text>
              </View>
            ))}
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────
// Transactions Screen
// ─────────────────────────────────────────────

export function TransactionsScreen({ profile }) {
  const [transactions, setTransactions] = useState([]);
  const [categories,   setCategories]   = useState([]);
  const [search,       setSearch]       = useState('');
  const [filterCat,    setFilterCat]    = useState('');
  const [showAdd,      setShowAdd]      = useState(false);
  const [showImport,   setShowImport]   = useState(false);
  const [showOcrImport, setShowOcrImport] = useState(false);
  const [editTx,       setEditTx]       = useState(null);
  const [expandedTxId, setExpandedTxId] = useState(null);
  const [hoveredTxId,  setHoveredTxId]  = useState(null);
  const [form,         setForm]         = useState(createEmptyTransactionForm);

  const load = useCallback(async () => {
    const [txs, cats] = await Promise.all([
      FinancialDataService.getTransactions(profile.id, { search, category: filterCat }),
      FinancialDataService.getAllCategories(),
    ]);
    setTransactions(txs); setCategories(cats);
  }, [profile.id, search, filterCat]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribeToDataChanges(load), [load]);
  useEffect(() => {
    if (expandedTxId && !transactions.some((transaction) => transaction.id === expandedTxId)) {
      setExpandedTxId(null);
    }
  }, [expandedTxId, transactions]);
  useEffect(() => {
    if (hoveredTxId && !transactions.some((transaction) => transaction.id === hoveredTxId)) {
      setHoveredTxId(null);
    }
  }, [hoveredTxId, transactions]);

  const handleSave = async () => {
    const validation = validateTransactionForm(form);
    if (validation.title) {
      Alert.alert(validation.title, validation.message);
      return;
    }

    const { parsedAmount } = validation;
    const action = editTx ? 'Update' : 'Add';
    const summary = `${form.merchant} · $${Math.abs(parsedAmount).toFixed(2)} · ${form.date}`;
    Alert.alert(
      `${action} Transaction`,
      `Confirm ${action.toLowerCase()}:\n${summary}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          onPress: async () => {
            if (editTx) {
              await FinancialDataService.updateTransaction(editTx.id, { ...form, amount: parsedAmount });
            } else {
              await FinancialDataService.addTransaction(profile.id, { ...form, amount: parsedAmount });
            }
            setShowAdd(false);
            setEditTx(null);
            setForm(createEmptyTransactionForm());
            load();
          },
        },
      ]
    );
  };

  const handleDelete = (id) => {
    Alert.alert('Delete Transaction', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await FinancialDataService.deleteTransaction(id); load(); } },
    ]);
  };

  const getCat = (id) => categories.find(c => c.id === id);
  const transactionSections = buildTransactionSections(transactions);

  const renderTx = ({ item: tx }) => {
    const cat = getCat(tx.category_id);
    const amt = parseFloat(tx.amount);
    return (
      <View style={styles.txRow}>
        <View style={[styles.txIcon, { backgroundColor: `${cat?.color || colors.accent}20` }]}>
          <Text style={{ fontSize: 20 }}>{cat?.icon || '📦'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.txMerchant} numberOfLines={1}>{tx.merchant || 'Unnamed'}</Text>
          <Text style={styles.txMeta}>{tx.date} · {cat?.name}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.txAmt, { color: amt > 0 ? colors.success : colors.text }]}>
            {amt > 0 ? '+' : ''}${Math.abs(amt).toFixed(2)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TouchableOpacity onPress={() => { setEditTx(tx); setForm({ date: tx.date, merchant: tx.merchant || '', amount: String(tx.amount), category_id: tx.category_id || '', note: tx.note || '' }); setShowAdd(true); }}>
              <Text style={{ fontSize: 14 }}>✏️</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(tx.id)}>
              <Text style={{ fontSize: 14 }}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderExpandableTx = ({ item: tx }) => {
    const cat = getCat(tx.category_id);
    const amt = parseFloat(tx.amount);
    const isExpanded = expandedTxId === tx.id;
    const isHovered = Platform.OS === 'windows' && hoveredTxId === tx.id;

    return (
      <Pressable
        onPress={() => setExpandedTxId((current) => (current === tx.id ? null : tx.id))}
        onHoverIn={Platform.OS === 'windows' ? () => setHoveredTxId(tx.id) : undefined}
        onHoverOut={Platform.OS === 'windows' ? () => setHoveredTxId((current) => (current === tx.id ? null : current)) : undefined}
        style={[styles.txCard, isHovered && styles.txCardHover, isExpanded && styles.txCardExpanded]}
      >
        <View style={styles.txRow}>
          <View style={[styles.txIcon, { backgroundColor: `${cat?.color || colors.accent}20` }]}>
            <Text style={{ fontSize: 20 }}>{cat?.icon || '📦'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.txMerchant} numberOfLines={isExpanded ? undefined : 1}>{tx.merchant || 'Unnamed'}</Text>
            <Text style={styles.txMeta}>{tx.date} • {cat?.name || 'Uncategorized'}</Text>
          </View>
          <View style={styles.txAmountWrap}>
            <Text style={[styles.txAmt, { color: amt > 0 ? colors.success : colors.text }]}>
              {amt > 0 ? '+' : ''}${Math.abs(amt).toFixed(2)}
            </Text>
            {isMobilePlatform() ? (
              <Text style={styles.txExpandHint}>{isExpanded ? 'Tap to collapse' : 'Tap to expand'}</Text>
            ) : null}
          </View>
        </View>

        {isExpanded && (
          <View style={styles.txExpandedContent}>
            <Text style={styles.txDescriptionLabel}>Description</Text>
            <Text style={styles.txDescriptionText}>
              {tx.note?.trim() || 'No description provided for this transaction.'}
            </Text>
            <View style={styles.txActionRow}>
              <Btn
                size="sm"
                variant="outline"
                style={styles.txActionButton}
                onPress={() => {
                  setEditTx(tx);
                  setForm({ date: tx.date, merchant: tx.merchant || '', amount: String(tx.amount), category_id: tx.category_id || '', note: tx.note || '' });
                  setShowAdd(true);
                }}
              >
                Edit
              </Btn>
              <Btn
                size="sm"
                variant="danger"
                style={styles.txActionButton}
                onPress={() => handleDelete(tx.id)}
              >
                Delete
              </Btn>
            </View>
          </View>
        )}
      </Pressable>
    );
  };

  const renderSectionHeader = ({ section }) => (
    <View style={styles.transactionSectionHeader}>
      <Text style={styles.transactionSectionTitle}>{section.title}</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={search} onChangeText={setSearch} placeholder="Search transactions..."
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>
        <View style={styles.toolbarSection}>
          <Text style={styles.toolbarSectionTitle}>Import & Add</Text>
        </View>
        <View style={styles.toolbarActions}>
          <View style={styles.toolbarActionButton}>
            <Btn size="sm" onPress={() => setShowImport(true)} fullWidth>Import CSV</Btn>
          </View>
          <View style={styles.toolbarActionButton}>
            <Btn size="sm" variant="outline" onPress={() => setShowOcrImport(true)} fullWidth>Scan Receipt</Btn>
          </View>
          <View style={styles.toolbarActionButton}>
            <Btn size="sm" onPress={() => { setShowAdd(true); setEditTx(null); }} fullWidth>Add Transaction</Btn>
          </View>
        </View>
      </View>

      {/* Category filter pills */}
      <View style={styles.filterSection}>
        <Text style={styles.toolbarSectionTitle}>Filter History</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS !== 'windows'} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
        <SelectablePill
          label="All"
          active={!filterCat}
          onPress={() => setFilterCat('')}
        />
        {categories.map(c => (
          <SelectablePill
            key={c.id}
            label={`${c.icon} ${c.name}`}
            active={filterCat === c.id}
            activeStyle={{ backgroundColor: c.color, borderColor: c.color }}
            onPress={() => setFilterCat(filterCat === c.id ? '' : c.id)}
          />
        ))}
      </ScrollView>

      {/* List */}
      <View style={styles.transactionListSection}>
      {transactions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 48, marginBottom: 8 }}>💳</Text>
          <Text style={styles.emptyText}>No transactions yet.{'\n'}Import CSV or add manually.</Text>
        </View>
      ) : (
        <SectionList
          style={styles.transactionList}
          sections={transactionSections}
          keyExtractor={t => t.id}
          renderItem={renderExpandableTx}
          extraData={expandedTxId}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.transactionListContent}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
        />
      )}
      </View>

      {/* Add/Edit Sheet */}
      <BottomSheet
        visible={showAdd}
        title={editTx ? 'Edit Transaction' : 'Add Transaction'}
        onClose={() => { setShowAdd(false); setEditTx(null); setForm(createEmptyTransactionForm()); }}
        footer={
          <View style={{ flexDirection: 'column', gap: 10 }}>
            <Btn onPress={handleSave} fullWidth>{editTx ? 'Update' : 'Save'}</Btn>
            <Btn variant="ghost" onPress={() => { setShowAdd(false); setEditTx(null); setForm(createEmptyTransactionForm()); }} fullWidth>Cancel</Btn>
          </View>
        }
      >
        <TransactionFormFields form={form} setForm={setForm} categories={categories} />
      </BottomSheet>

      {/* CSV Import Sheet */}
      {showImport && <CSVImportSheet profile={profile} onClose={() => { setShowImport(false); load(); }} />}
      {showOcrImport && <OCRScanReviewSheet profile={profile} categories={categories} onClose={() => { setShowOcrImport(false); load(); }} />}
    </View>
  );
}

// ─── CSV Import Sheet ───────────────────────

function CSVImportSheet({ profile, onClose }) {
  const [step,    setStep]    = useState('upload');
  const [csvData, setCsvData] = useState(null);
  const [mapping, setMapping] = useState({ date: '', merchant: '', amount: '', note: '', category: '' });
  const [result,  setResult]  = useState(null);

  const loadCsvText = (text) => {
    const parsed = ImportIntegrationService.parseCSV(text);
    if (parsed.error) { Alert.alert('Error', parsed.error); return; }
    const headers = parsed.headers;
    const lowerHeaders = headers.map(h => h.toLowerCase());
    const matchHeader = (...terms) => {
      const index = lowerHeaders.findIndex(header => terms.some(term => header.includes(term)));
      return index >= 0 ? headers[index] : '';
    };

    setCsvData(parsed);
    setMapping({
      date:     matchHeader('date') || headers[0] || '',
      merchant: matchHeader('merchant', 'description', 'payee') || headers[1] || '',
      amount:   matchHeader('amount', 'debit', 'credit') || headers[2] || '',
      note:     matchHeader('note', 'memo') || '',
      category: matchHeader('category', 'type') || '',
    });
    setStep('map');
  };

  const pickFile = async () => {
    try {
      const file = await pickCsvTextAsync();
      if (!file) return;
      loadCsvText(file.text);
    } catch (error) {
      Alert.alert('CSV import unavailable', 'Unable to open the CSV file picker.');
    }
  };

  const handleImport = async () => {
    const mapped = ImportIntegrationService.mapColumns(csvData.rows, mapping);
    const r      = await ImportIntegrationService.importTransactions(profile.id, mapped);
    setResult(r); setStep('done');
  };

  useEffect(() => {
    if (Platform.OS !== 'windows') return undefined;

    setCsvDropEnabled(true);
    const subscription = addCsvDropListener((file) => {
      if (file?.text) loadCsvText(file.text);
    });

    return () => {
      subscription?.remove?.();
      setCsvDropEnabled(false);
    };
  }, []);

  return (
    <BottomSheet visible title="Import CSV" onClose={onClose}>
      {step === 'upload' && (
        <TouchableOpacity onPress={pickFile} style={styles.dropZone}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>📁</Text>
          <Text style={styles.dropZoneText}>{Platform.OS === 'windows' ? 'Click or drag a CSV file here' : 'Tap to select CSV file'}</Text>
          <Text style={styles.dropZoneSub}>{Platform.OS === 'windows' ? 'Bank exports and statement CSVs can be selected or dropped into this window' : 'Bank exports and statement CSVs supported'}</Text>
        </TouchableOpacity>
      )}

      {step === 'map' && csvData && (
        <View>
          <Text style={styles.mapHint}>{csvData.rows.length} rows detected — map your columns:</Text>
          {['date', 'merchant', 'amount', 'note', 'category'].map(field => (
            <View key={field} style={{ marginBottom: 12 }}>
              <Text style={styles.inputLabel}>{field.toUpperCase()}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <SelectablePill
                  label="— skip —"
                  active={!mapping[field]}
                  onPress={() => setMapping(m => ({ ...m, [field]: '' }))}
                />
                {csvData.headers.map(h => (
                  <SelectablePill
                    key={h}
                    label={h}
                    active={mapping[field] === h}
                    onPress={() => setMapping(m => ({ ...m, [field]: h }))}
                  />
                ))}
              </ScrollView>
            </View>
          ))}
          <Btn onPress={handleImport} fullWidth style={{ marginTop: 8 }}>Import Transactions</Btn>
          <Text style={styles.importHint}>If no category is mapped, FinSight will infer one from merchant, memo, and amount patterns.</Text>
        </View>
      )}

      {step === 'done' && result && (
        <View style={styles.doneState}>
          <Text style={{ fontSize: 48 }}>✅</Text>
          <Text style={styles.doneTitle}>Import Complete</Text>
          <Text style={{ color: colors.success, marginTop: 8 }}>{result.imported} transactions imported</Text>
          {result.duplicates > 0 && <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm, marginTop: 4 }}>{result.duplicates} duplicates skipped</Text>}
          {result.autoCategorized > 0 && <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm, marginTop: 4 }}>{result.autoCategorized} transactions auto-categorized</Text>}
          {result.uncategorized > 0 && <Text style={{ color: colors.warning, fontSize: font.sizes.sm, marginTop: 4 }}>{result.uncategorized} transactions left in Other for review</Text>}
          <Btn onPress={onClose} style={{ marginTop: 20 }} fullWidth>Done</Btn>
        </View>
      )}
    </BottomSheet>
  );
}

function OCRImportSheet({ profile, onClose }) {
  const [ocrText, setOcrText] = useState('');
  const [previewRows, setPreviewRows] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = () => {
    const parsed = ImportIntegrationService.parseOCRText(ocrText);
    if (parsed.error) {
      Alert.alert('OCR text not recognized', parsed.error);
      return;
    }
    setPreviewRows(parsed.rows);
  };

  const importRows = async () => {
    if (!previewRows.length || loading) return;
    setLoading(true);
    try {
      const nextResult = await ImportIntegrationService.importTransactions(profile.id, previewRows, 'ocr');
      setResult(nextResult);
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet visible title="Import OCR Text" onClose={onClose}>
      {!result && (
        <View>
          <Text style={styles.mapHint}>Paste OCR output from a scanned receipt or bank statement. Each transaction line should include a date and amount.</Text>
          <TextInput
            value={ocrText}
            onChangeText={setOcrText}
            multiline
            placeholder={'04/20/2026 STARBUCKS 6.75\n04/21/2026 PAYROLL DEPOSIT 1200.00'}
            placeholderTextColor={colors.textMuted}
            style={styles.ocrInput}
          />
          <Btn onPress={analyze} fullWidth>Analyze OCR Text</Btn>

          {previewRows.length > 0 && (
            <View style={{ marginTop: 16, gap: 10 }}>
              <Text style={styles.toolbarSectionTitle}>{previewRows.length} transactions detected</Text>
              {previewRows.slice(0, 5).map((row, index) => (
                <View key={`${row.date}-${row.merchant}-${index}`} style={styles.ocrPreviewCard}>
                  <Text style={styles.txMerchant}>{row.merchant}</Text>
                  <Text style={styles.txMeta}>{row.date} · ${Math.abs(row.amount).toFixed(2)}</Text>
                </View>
              ))}
              {previewRows.length > 5 && <Text style={styles.importHint}>Only the first 5 rows are previewed here. All detected rows will be imported.</Text>}
              <Btn onPress={importRows} fullWidth disabled={loading}>{loading ? 'Importing...' : 'Import OCR Transactions'}</Btn>
            </View>
          )}
        </View>
      )}

      {!!result && (
        <View style={styles.doneState}>
          <Text style={{ fontSize: 48 }}>âœ…</Text>
          <Text style={styles.doneTitle}>OCR Import Complete</Text>
          <Text style={{ color: colors.success, marginTop: 8 }}>{result.imported} transactions imported</Text>
          {result.duplicates > 0 && <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm, marginTop: 4 }}>{result.duplicates} duplicates skipped</Text>}
          {result.autoCategorized > 0 && <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm, marginTop: 4 }}>{result.autoCategorized} transactions auto-categorized</Text>}
          {result.uncategorized > 0 && <Text style={{ color: colors.warning, fontSize: font.sizes.sm, marginTop: 4 }}>{result.uncategorized} transactions left in Other for review</Text>}
          <Btn onPress={onClose} style={{ marginTop: 20 }} fullWidth>Done</Btn>
        </View>
      )}
    </BottomSheet>
  );
}

function OCRScanReviewSheet({ profile, categories, onClose }) {
  const [ocrText, setOcrText] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  const currentDraft = drafts[currentIndex] || null;

  const buildDrafts = useCallback((rows, nextScanResult = null) => {
    setDrafts(
      rows.map((row) => ({
        date: row.date || getTodayIsoDate(),
        merchant: row.merchant || '',
        amount: String(row.amount ?? ''),
        category_id: row.category_id || '',
        note: row.note || '',
        source: nextScanResult?.mode === 'camera' ? 'ocr-camera' : 'ocr-image',
      }))
    );
    setCurrentIndex(0);
    if (nextScanResult) {
      setScanResult(nextScanResult);
      setOcrText(nextScanResult.text || '');
    }
  }, []);

  const analyzeText = useCallback((text, nextScanResult = null) => {
    const parsed = ImportIntegrationService.parseOCRText(text);
    if (parsed.error) {
      Alert.alert('Scan not recognized', parsed.error);
      return false;
    }

    buildDrafts(parsed.rows, nextScanResult);
    return true;
  }, [buildDrafts]);

  const startScan = async (mode) => {
    if (loading) return;
    setLoading(true);
    try {
      const nextScanResult = await scanTransactionImageAsync(mode);
      if (!nextScanResult) return;
      if (!String(nextScanResult.text || '').trim()) {
        Alert.alert('No text found', 'No readable text was detected in that image. Try a clearer photo or a tighter crop.');
        setScanResult(nextScanResult);
        return;
      }
      analyzeText(nextScanResult.text, nextScanResult);
    } catch (error) {
      Alert.alert('Scan unavailable', error.message || 'Unable to scan that image on this device.');
    } finally {
      setLoading(false);
    }
  };

  const setCurrentDraft = useCallback((updater) => {
    setDrafts((existing) => existing.map((draft, index) => {
      if (index !== currentIndex) return draft;
      return typeof updater === 'function' ? updater(draft) : updater;
    }));
  }, [currentIndex]);

  const removeCurrentDraft = useCallback(() => {
    setDrafts((existing) => {
      const nextDrafts = existing.filter((_, index) => index !== currentIndex);
      setCurrentIndex((index) => Math.max(0, Math.min(index, nextDrafts.length - 1)));
      return nextDrafts;
    });
  }, [currentIndex]);

  const saveCurrentDraft = async () => {
    if (!currentDraft || loading) return;

    const validation = validateTransactionForm(currentDraft);
    if (validation.title) {
      Alert.alert(validation.title, validation.message);
      return;
    }

    setLoading(true);
    try {
      await FinancialDataService.addTransaction(profile.id, {
        ...currentDraft,
        amount: validation.parsedAmount,
        source: currentDraft.source || 'ocr',
      });
      setSavedCount((count) => count + 1);
      removeCurrentDraft();
    } finally {
      setLoading(false);
    }
  };

  const scanFooter = currentDraft ? (
    <View style={{ flexDirection: 'column', gap: 10 }}>
      {drafts.length > 1 && (
        <View style={styles.scanStepperRow}>
          <Btn
            variant="outline"
            onPress={() => setCurrentIndex((index) => Math.max(0, index - 1))}
            disabled={currentIndex === 0 || loading}
            style={styles.scanStepperButton}
          >
            Previous
          </Btn>
          <Btn
            variant="outline"
            onPress={() => setCurrentIndex((index) => Math.min(drafts.length - 1, index + 1))}
            disabled={currentIndex === drafts.length - 1 || loading}
            style={styles.scanStepperButton}
          >
            Next
          </Btn>
        </View>
      )}
      <Btn onPress={saveCurrentDraft} fullWidth disabled={loading}>{loading ? 'Saving...' : 'Accept And Add Transaction'}</Btn>
      <Btn variant="ghost" onPress={removeCurrentDraft} fullWidth disabled={loading}>Skip This Detection</Btn>
    </View>
  ) : null;

  return (
    <BottomSheet visible title="Scan Transaction" onClose={onClose} footer={scanFooter}>
      {!currentDraft && savedCount === 0 && (
        <View>
          <Text style={styles.mapHint}>Choose a receipt, statement screenshot, or bank image. Mobile opens your camera roll by default, and both mobile and Windows can also take a photo first.</Text>
          <View style={styles.scanActionColumn}>
            <Btn onPress={() => startScan('library')} fullWidth disabled={loading}>{loading ? 'Scanning...' : 'Choose Image'}</Btn>
            <Btn variant="outline" onPress={() => startScan('camera')} fullWidth disabled={loading}>{loading ? 'Scanning...' : 'Take Photo'}</Btn>
          </View>
          <Text style={styles.importHint}>If OCR already ran elsewhere, you can paste the raw text below and review it in the same transaction form.</Text>
          <TextInput
            value={ocrText}
            onChangeText={setOcrText}
            multiline
            placeholder={'04/20/2026 STARBUCKS 6.75\n04/21/2026 PAYROLL DEPOSIT 1200.00'}
            placeholderTextColor={colors.textMuted}
            style={styles.ocrInput}
          />
          <Btn onPress={() => analyzeText(ocrText)} fullWidth disabled={loading || !ocrText.trim()}>Use Pasted OCR Text</Btn>
        </View>
      )}

      {!!currentDraft && (
        <View style={{ gap: 14 }}>
          <View style={styles.scanHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toolbarSectionTitle}>Review Scanned Transaction</Text>
              <Text style={styles.importHint}>
                Detection {currentIndex + 1} of {drafts.length}. Edit anything before accepting it into your transaction history.
              </Text>
            </View>
            {!!scanResult?.mode && (
              <View style={styles.scanModeBadge}>
                <Text style={styles.scanModeBadgeText}>{scanResult.mode === 'camera' ? 'Camera' : 'Library'}</Text>
              </View>
            )}
          </View>

          {!!scanResult?.imageUri && (
            <Image source={{ uri: scanResult.imageUri }} style={styles.scanPreviewImage} resizeMode="cover" />
          )}

          <TransactionFormFields form={currentDraft} setForm={setCurrentDraft} categories={categories} />

          {!!ocrText.trim() && (
            <View style={styles.ocrPreviewCard}>
              <Text style={styles.inputLabel}>Detected OCR Text</Text>
              <Text style={styles.scanPreviewText} numberOfLines={8}>{ocrText}</Text>
            </View>
          )}
        </View>
      )}

      {!currentDraft && savedCount > 0 && (
        <View style={styles.doneState}>
          <Text style={{ fontSize: 48 }}>âœ…</Text>
          <Text style={styles.doneTitle}>Scan Review Complete</Text>
          <Text style={{ color: colors.success, marginTop: 8 }}>{savedCount} transaction{savedCount === 1 ? '' : 's'} added</Text>
          <Btn onPress={onClose} style={{ marginTop: 20 }} fullWidth>Done</Btn>
        </View>
      )}
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────
// Budget Manager Screen
// ─────────────────────────────────────────────

export function BudgetManagerScreen({ profile }) {
  const [budgets,    setBudgets]    = useState([]);
  const [categories, setCategories] = useState([]);
  const [showAdd,    setShowAdd]    = useState(false);
  const [form,       setForm]       = useState({ category_id: '', limit: '', description: '' });
  const [editBudget, setEditBudget] = useState(null);
  const [expandedBudgetId, setExpandedBudgetId] = useState(null);
  const [hoveredBudgetId, setHoveredBudgetId] = useState(null);
  const [saving,     setSaving]     = useState(false);
  const now   = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year  = String(now.getFullYear());

  const load = useCallback(async () => {
    const [bs, cats] = await Promise.all([
      BudgetingGoalService.getBudgetProgress(profile.id, `${year}-${month}`),
      FinancialDataService.getAllCategories(),
    ]);
    setBudgets(bs); setCategories(cats.filter(c => c.id !== 'cat_income'));
  }, [profile.id, year, month]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribeToDataChanges(load), [load]);
  useEffect(() => {
    if (expandedBudgetId && !budgets.some((budget) => budget.id === expandedBudgetId)) {
      setExpandedBudgetId(null);
    }
  }, [budgets, expandedBudgetId]);
  useEffect(() => {
    if (hoveredBudgetId && !budgets.some((budget) => budget.id === hoveredBudgetId)) {
      setHoveredBudgetId(null);
    }
  }, [budgets, hoveredBudgetId]);

  const handleSave = async () => {
    const parsedLimit = parseFloat(form.limit);
    if (!form.category_id) {
      Alert.alert('Missing Category', 'Please choose a category for this budget.');
      return;
    }
    if (!form.limit.trim() || Number.isNaN(parsedLimit) || parsedLimit <= 0) {
      Alert.alert('Invalid Limit', 'Please enter a monthly budget greater than 0.');
      return;
    }

    setSaving(true);
    setShowAdd(false);
    setForm({ category_id: '', limit: '', description: '' });
    setEditBudget(null);

    try {
      if (editBudget) {
        await BudgetingGoalService.updateBudget(editBudget.id, {
          categoryId: form.category_id,
          limitAmount: parsedLimit,
          description: form.description.trim(),
        });
      } else {
        await BudgetingGoalService.setBudget(profile.id, form.category_id, month, year, parsedLimit, form.description.trim());
      }
      await load();
    } catch (error) {
      console.warn('Failed to save budget:', error);
      Alert.alert('Unable to Save Budget', 'Something went wrong while saving this budget.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    Alert.alert('Delete Budget', 'Remove this budget?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await BudgetingGoalService.deleteBudget(id); load(); } },
    ]);
  };

  const openBudgetEditor = (budget = null) => {
    setEditBudget(budget);
    setForm({
      category_id: budget?.category_id || '',
      limit: budget ? String(budget.limit_amount) : '',
      description: budget?.description || '',
    });
    setShowAdd(true);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.screenHeaderRow}>
        <Text style={styles.screenTitle}>Budget Manager</Text>
        <Btn size="sm" onPress={() => openBudgetEditor()}>+ Budget</Btn>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 20 }}>
        {budgets.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48, marginBottom: 8 }}>🎯</Text>
            <Text style={styles.emptyText}>No budgets set.{'\n'}Create your first budget.</Text>
          </View>
        ) : budgets.map(b => {
          const cat  = categories.find(c => c.id === b.category_id);
          const pct  = Math.min(100, b.progress * 100);
          const over = b.spent > b.limit_amount;
          const isExpanded = expandedBudgetId === b.id;
          const isHovered = Platform.OS === 'windows' && hoveredBudgetId === b.id;
          return (
            <Pressable
              key={b.id}
              onPress={() => setExpandedBudgetId((current) => (current === b.id ? null : b.id))}
              onHoverIn={Platform.OS === 'windows' ? () => setHoveredBudgetId(b.id) : undefined}
              onHoverOut={Platform.OS === 'windows' ? () => setHoveredBudgetId((current) => (current === b.id ? null : current)) : undefined}
              style={[styles.txCard, styles.budgetCard, isHovered && styles.txCardHover, isExpanded && styles.txCardExpanded]}
            >
              <View style={styles.budgetCardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.catIcon, { backgroundColor: `${cat?.color || colors.accent}20` }]}>
                    <Text style={{ fontSize: 20 }}>{cat?.icon || '📦'}</Text>
                  </View>
                  <View>
                    <Text style={styles.catName}>{cat?.name || b.category_id}</Text>
                    <Text style={[styles.txMeta, over && { color: colors.danger }]}>
                      {over ? `Over by $${(b.spent - b.limit_amount).toFixed(0)}` : `$${(b.limit_amount - b.spent).toFixed(0)} remaining`}
                    </Text>
                  </View>
                </View>
                <View style={styles.txAmountWrap}>
                  <Badge color={over ? colors.danger : pct > 80 ? colors.warning : colors.success}>{Math.round(pct)}%</Badge>
                  {isMobilePlatform() ? (
                    <Text style={styles.txExpandHint}>{isExpanded ? 'Tap to collapse' : 'Tap to expand'}</Text>
                  ) : null}
                </View>
              </View>
              <ProgressBar value={b.spent} max={b.limit_amount} color={cat?.color || colors.accent} />
              <View style={styles.budgetMetricsRow}>
                <Text style={styles.txMeta}>Spent: <Text style={{ color: colors.text }}>${b.spent.toFixed(0)}</Text></Text>
                <Text style={styles.txMeta}>Limit: <Text style={{ color: colors.text }}>${b.limit_amount.toFixed(0)}</Text></Text>
              </View>
              {isExpanded && (
                <View style={styles.txExpandedContent}>
                  <Text style={styles.txDescriptionLabel}>Description</Text>
                  <Text style={styles.txDescriptionText}>
                    {b.description?.trim() || 'No description provided for this budget.'}
                  </Text>
                  <View style={styles.txActionRow}>
                    <Btn size="sm" variant="outline" style={styles.txActionButton} onPress={() => openBudgetEditor(b)}>Edit</Btn>
                    <Btn size="sm" variant="danger" style={styles.txActionButton} onPress={() => handleDelete(b.id)}>Delete</Btn>
                  </View>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <BottomSheet
        visible={showAdd}
        title={editBudget ? 'Edit Budget' : 'Set Budget'}
        onClose={() => {
          if (!saving) {
            setShowAdd(false);
            setEditBudget(null);
            setForm({ category_id: '', limit: '', description: '' });
          }
        }}
        footer={
          <View style={{ flexDirection: 'column', gap: 10 }}>
            <Btn onPress={handleSave} disabled={saving || !form.category_id || !form.limit} fullWidth>{saving ? 'Saving...' : editBudget ? 'Update Budget' : 'Save Budget'}</Btn>
            <Btn
              variant="ghost"
              onPress={() => {
                setShowAdd(false);
                setEditBudget(null);
                setForm({ category_id: '', limit: '', description: '' });
              }}
              disabled={saving}
              fullWidth
            >
              Cancel
            </Btn>
          </View>
        }
      >
        <Text style={styles.inputLabel}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS !== 'windows'} style={styles.sheetChipScroll} contentContainerStyle={styles.sheetChipScrollContent}>
          {categories.map(c => (
            <SelectablePill
              key={c.id}
              label={`${c.icon} ${c.name}`}
              active={form.category_id === c.id}
              activeStyle={{ backgroundColor: c.color, borderColor: c.color }}
              onPress={() => setForm(f => ({ ...f, category_id: c.id }))}
            />
          ))}
        </ScrollView>
        <Input label={`Monthly limit for ${now.toLocaleString('default', { month: 'long' })}`} value={form.limit} onChangeText={v => setForm(f => ({ ...f, limit: v }))} placeholder="500" keyboardType="numeric" icon="💰" />
        <Input label="Description (optional)" value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} placeholder="Add context for this budget" multiline />
      </BottomSheet>
    </View>
  );
}

// ─────────────────────────────────────────────
// AI Assistant Screen
// ─────────────────────────────────────────────

export function AssistantScreen({ profile }) {
  const [messages, setMessages] = useState([{ role: 'assistant', text: "Hi! I'm your FinSight on-device assistant. Ask about spending, budgets, imports, or savings ideas once the local model package is installed." }]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [context,  setContext]  = useState({});
  const [assistantStatus, setAssistantStatus] = useState({ state: 'not-installed', ready: false, detail: 'Checking local AI package...' });
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(null);
  const scrollRef = useRef();

  const refreshAssistantStatus = useCallback(() => {
    LocalAIService.getStatus().then(setAssistantStatus).catch((error) => {
      console.warn('Failed to refresh local AI status:', error);
      setAssistantStatus({ state: 'error', ready: false, detail: 'Unable to read local AI package status.' });
    });
  }, []);

  useEffect(() => {
    ReportingAnalyticsService.getDashboardData(profile.id).then(d => setContext(buildAssistantContext(d)));
    refreshAssistantStatus();
  }, [profile.id, refreshAssistantStatus]);

  useFocusEffect(useCallback(() => {
    refreshAssistantStatus();
  }, [refreshAssistantStatus]));

  useEffect(() => {
    const reloadContext = () => {
      ReportingAnalyticsService.getDashboardData(profile.id).then(d => setContext(buildAssistantContext(d)));
    };

    return subscribeToDataChanges(reloadContext);
  }, [profile.id]);

  const installModel = async () => {
    setInstalling(true);
    setInstallProgress({ progress: 0, detail: 'Preparing local AI package...' });

    try {
      await LocalAIService.installRecommendedModel((progressUpdate) => {
        setInstallProgress(progressUpdate);
      });
      refreshAssistantStatus();
      setMessages([{ role: 'assistant', text: "Your local AI package is installed. Native mobile inference is the next integration step, so responses still use the current scaffolded assistant flow for now." }]);
    } catch (error) {
      console.warn('Failed to install local AI model:', error);
      Alert.alert('Install Failed', error.message || 'Unable to install the local AI package.');
      refreshAssistantStatus();
    } finally {
      setInstalling(false);
    }
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'user', text: userMsg }]);
    setLoading(true);
    setMessages(m => [...m, { role: 'assistant', text: '...' }]);

    await LocalAIService.ask(userMsg, context, (partial) => {
      setMessages(m => m.map((msg, i) => i === m.length - 1 ? { ...msg, text: partial } : msg));
    });
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const suggestions = ['How much did I spend on food?', 'Which budget needs attention?', 'Did imports get categorized correctly?'];

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.apiKeyBanner, assistantStatus.ready ? styles.assistantReadyBanner : styles.assistantSetupBanner]}>
        <Text style={styles.apiKeyText}>On-device AI assistant</Text>
        <Text style={styles.apiKeyNote}>{assistantStatus.detail}</Text>
        <Text style={styles.importHint}>The app now manages a downloadable local model package separately from the mobile inference runtime, keeping the app install small.</Text>
        {!assistantStatus.ready && (
          <View style={styles.assistantActionRow}>
            <Btn onPress={installModel} disabled={installing} size="sm">
              {installing ? 'Installing...' : `Install ${formatModelSize(assistantStatus.recommendedModel?.sizeBytes)}`}
            </Btn>
          </View>
        )}
        {!!installProgress && (
          <View style={{ marginTop: 12 }}>
            <ProgressBar value={installProgress.progress || 0} max={1} color={colors.accent} />
            <Text style={[styles.importHint, { marginTop: 6 }]}>{installProgress.detail}</Text>
          </View>
        )}
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {messages.length === 1 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {suggestions.map((s, i) => (
              <TouchableOpacity key={i} onPress={() => setInput(s)} style={styles.suggestionChip}>
                <Text style={styles.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {messages.map((msg, i) => (
          <View key={i} style={[styles.msgRow, msg.role === 'user' && styles.msgRowUser]}>
            <View style={[styles.msgBubble, msg.role === 'user' ? styles.msgUser : styles.msgAssistant]}>
              <Text style={[styles.msgText, msg.role === 'user' && { color: '#fff' }]}>{msg.text}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          value={input} onChangeText={setInput}
          placeholder={assistantStatus.ready ? 'Ask your on-device assistant about spending or imports...' : 'Install the local AI package to unlock on-device chat...'}
          placeholderTextColor={colors.textMuted}
          multiline
          style={styles.chatInput}
          onSubmitEditing={send}
          editable={assistantStatus.ready && !installing}
        />
        <TouchableOpacity onPress={send} disabled={loading || !input.trim() || !assistantStatus.ready || installing} style={[styles.sendBtn, (loading || !input.trim() || !assistantStatus.ready || installing) && { opacity: 0.4 }]}>
          <Text style={{ color: '#fff', fontWeight: font.weights.bold }}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ???????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????
// Profile Screen
// ???????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????
export function ProfileScreen({ profile, onLogout }) {
  const [stats, setStats] = useState({ txCount: 0, budgetCount: 0 });
  const [aiStatus, setAiStatus] = useState({ state: 'not-installed', ready: false, detail: 'Checking local AI package...' });
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    const loadStats = () => {
      getDB().then(async db => {
        const [{ c: txCount }, { c: budgetCount }] = await Promise.all([
          db.getFirstAsync('SELECT COUNT(*) as c FROM transactions WHERE profile_id = ?', [profile.id]),
          db.getFirstAsync('SELECT COUNT(*) as c FROM budgets WHERE profile_id = ?', [profile.id]),
        ]);
        setStats({ txCount, budgetCount });
      });
    };

    loadStats();
    return subscribeToDataChanges(loadStats);
  }, [profile.id]);

  useEffect(() => {
    LocalAIService.getStatus().then(setAiStatus).catch((error) => {
      console.warn('Failed to load AI status:', error);
      setAiStatus({ state: 'error', ready: false, detail: 'Unable to load local AI package status.' });
    });
  }, []);

  const refreshAiStatus = () => {
    LocalAIService.getStatus().then(setAiStatus).catch((error) => {
      console.warn('Failed to refresh AI status:', error);
    });
  };

  useFocusEffect(useCallback(() => {
    refreshAiStatus();
  }, []));

  const installAi = async () => {
    setAiBusy(true);
    try {
      await LocalAIService.installRecommendedModel();
      refreshAiStatus();
    } catch (error) {
      Alert.alert('Install Failed', error.message || 'Unable to install the local AI package.');
    } finally {
      setAiBusy(false);
    }
  };

  const removeAi = async () => {
    setAiBusy(true);
    try {
      await LocalAIService.removeInstalledModel();
      refreshAiStatus();
    } catch (error) {
      Alert.alert('Remove Failed', error.message || 'Unable to remove the local AI package.');
    } finally {
      setAiBusy(false);
    }
  };

  const clearData = () => {
    Alert.alert('Clear All Data', 'Delete ALL financial data? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const db = await getDB();
        await db.runAsync('DELETE FROM transactions WHERE profile_id = ?', [profile.id]);
        await db.runAsync('DELETE FROM budgets WHERE profile_id = ?', [profile.id]);
        emitDataChanged();
        Alert.alert('Done', 'All financial data cleared.');
      }},
    ]);
  };

  const privacyItems = [
    { icon: '🔒', title: 'Data Encryption',   desc: 'PIN-derived key, AES-256-GCM (production)' },
    { icon: '📱', title: 'Local SQLite Only',  desc: 'finsight.db on-device, never synced' },
    { icon: '🚫', title: 'No Banking APIs',    desc: 'No Plaid, Yodlee or bank connection' },
    { icon: '🤖', title: 'AI Privacy',         desc: 'AI responses stay on-device through a local offline runtime' },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* Profile Card */}
      <Card style={{ marginBottom: 16, alignItems: 'center' }}>
        <View style={styles.avatar}><Text style={{ fontSize: 28 }}>👤</Text></View>
        <Text style={styles.profileName}>{profile.name}</Text>
        <Text style={styles.profileEmail}>{profile.email}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statBig}>{stats.txCount}</Text>
            <Text style={styles.txMeta}>Transactions</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statBig}>{stats.budgetCount}</Text>
            <Text style={styles.txMeta}>Budgets</Text>
          </View>
        </View>
      </Card>

      {/* Privacy */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHeader title="On-Device AI" />
        <Text style={styles.privacyDesc}>{aiStatus.detail}</Text>
        <Text style={[styles.txMeta, { marginTop: 8 }]}>
          {aiStatus.ready
            ? `Installed model: ${aiStatus.name || aiStatus.modelId} • ${formatModelSize(aiStatus.sizeBytes)}`
            : aiStatus.recommendedModel
              ? `Recommended download: ${aiStatus.recommendedModel.name} • ${formatModelSize(aiStatus.recommendedModel.sizeBytes)}`
              : 'No recommended package is available yet.'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {!aiStatus.ready ? (
            <Btn onPress={installAi} disabled={aiBusy} fullWidth>{aiBusy ? 'Installing...' : 'Install Local AI'}</Btn>
          ) : (
            <Btn variant="outline" onPress={removeAi} disabled={aiBusy} fullWidth>{aiBusy ? 'Removing...' : 'Remove Local AI'}</Btn>
          )}
        </View>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <SectionHeader title="Privacy & Security" />
        {privacyItems.map((item, i) => (
          <View key={i}>
            <View style={styles.privacyRow}>
              <Text style={styles.privacyIcon}>{item.icon}</Text>
              <View style={styles.privacyTextWrap}>
                <Text style={styles.privacyTitle}>{item.title}</Text>
                <Text style={styles.privacyDesc}>{item.desc}</Text>
              </View>
            </View>
            {i < privacyItems.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </Card>

      <Btn variant="danger" onPress={clearData} fullWidth style={{ marginBottom: 12 }}>🗑️ Clear All Financial Data</Btn>
      <Btn variant="outline" onPress={onLogout} fullWidth>Sign Out</Btn>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────
// Shared Styles
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:            { flex: 1, backgroundColor: colors.bg },
  screenContent:     { padding: spacing.lg, paddingBottom: 20 },
  screenHeaderRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 8 },
  screenTitle:       { fontSize: font.sizes.xxl, fontWeight: font.weights.bold, color: colors.text },
  toolbar:           { gap: 12, padding: 16, paddingBottom: 8, flexShrink: 0 },
  toolbarSection:    { gap: 4 },
  toolbarSectionTitle: { fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text },
  toolbarSectionText: { fontSize: font.sizes.xs, color: colors.textMuted, lineHeight: 18 },
  toolbarActions:    { flexDirection: 'row', gap: 8 },
  toolbarActionButton: { flex: 1 },
  searchBox:         { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10 },
  searchIcon:        { fontSize: 14, marginRight: 6 },
  searchInput:       { flex: 1, color: colors.text, fontSize: font.sizes.md, paddingVertical: 10 },
  filterSection:     { paddingHorizontal: 16, marginBottom: 8, gap: 4, flexShrink: 0 },
  filterRow:         { maxHeight: 48, marginBottom: 4, flexGrow: 0, flexShrink: 0 },
  filterRowContent:  { paddingHorizontal: 16, gap: 8, paddingBottom: Platform.OS === 'windows' ? 12 : 0, paddingRight: Platform.OS === 'windows' ? 12 : 0 },
  sheetChipScroll:   { marginBottom: 16 },
  sheetChipScrollContent: { gap: 8, paddingBottom: Platform.OS === 'windows' ? 12 : 0, paddingRight: Platform.OS === 'windows' ? 12 : 0 },
  filterPill:        { backgroundColor: colors.surfaceAlt, borderRadius: radius.full, paddingHorizontal: 12, minHeight: 34, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  filterPillHover:   { backgroundColor: colors.surface, borderColor: `${colors.accent}45` },
  filterPillActive:  { backgroundColor: colors.accent, borderColor: colors.accent },
  filterPillText:    { color: colors.textSecondary, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, textAlignVertical: 'center', includeFontPadding: false },
  filterPillTextActive: { color: '#fff' },
  inputLabel:        { fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input:             { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, color: colors.text, fontSize: font.sizes.md, marginBottom: 16 },
  transactionListSection: { flex: 1, minHeight: 0 },
  transactionList:   { flex: 1 },
  transactionListContent: { paddingHorizontal: 16, paddingBottom: 20 },
  transactionSectionHeader: { paddingTop: 16, paddingBottom: 8 },
  transactionSectionTitle: { color: colors.textMuted, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  txCard:            { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14 },
  txCardHover:       { backgroundColor: colors.surfaceAlt, borderColor: `${colors.accent}35` },
  txCardExpanded:    { borderColor: `${colors.accent}55`, backgroundColor: colors.surfaceAlt },
  txRow:             { flexDirection: 'row', alignItems: 'center', gap: 12 },
  txIcon:            { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  txMerchant:        { fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text },
  txMeta:            { fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 },
  txAmountWrap:      { alignItems: 'flex-end', marginLeft: 8 },
  txAmt:             { fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text, fontVariant: ['tabular-nums'] },
  txExpandHint:      { fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 4 },
  txExpandedContent: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 },
  txDescriptionLabel:{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  txDescriptionText: { fontSize: font.sizes.sm, color: colors.textSecondary, lineHeight: 20 },
  txActionRow:       { flexDirection: 'row', gap: 10, marginTop: 4 },
  txActionButton:    { flex: 1 },
  divider:           { height: 10 },
  emptyState:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 16 },
  emptyText:         { color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  authContainer:     { flex: 1, backgroundColor: colors.bg },
  authScroll:        { padding: 24, justifyContent: 'center', minHeight: '100%' },
  authLogo:          { alignItems: 'center', marginBottom: 40 },
  authTitle:         { fontSize: font.sizes.hero, fontWeight: font.weights.bold, color: colors.text, marginTop: 8 },
  authSubtitle:      { color: colors.textMuted, fontSize: font.sizes.sm, marginTop: 4 },
  tabRow:            { flexDirection: 'row', gap: 4, marginBottom: 24, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4 },
  tab:               { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm - 2 },
  tabActive:         { backgroundColor: colors.accent },
  tabText:           { color: colors.textMuted, fontWeight: font.weights.semibold, fontSize: font.sizes.sm },
  errorBox:          { backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: 10, marginBottom: 12 },
  errorText:         { color: colors.danger, fontSize: font.sizes.sm },
  demoHint:          { textAlign: 'center', color: colors.textMuted, fontSize: font.sizes.xs, marginTop: 12 },
  privacyNote:       { textAlign: 'center', color: colors.textMuted, fontSize: font.sizes.xs, marginTop: 20 },
  dashHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  greeting:          { color: colors.textMuted, fontSize: font.sizes.sm },
  monthBadge:        { backgroundColor: `${colors.accent}15`, borderWidth: 1, borderColor: `${colors.accent}40`, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 6 },
  heroCard:          { backgroundColor: colors.surface, marginBottom: 16, borderColor: `${colors.accent}40` },
  heroLabel:         { color: colors.textMuted, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, letterSpacing: 0.5, marginBottom: 4 },
  heroSubLabel:      { color: colors.textSecondary, fontSize: font.sizes.xs, lineHeight: 18, marginTop: 2 },
  heroHeaderRow:     { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  heroToggle:        { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, padding: 4, gap: 4 },
  heroToggleChip:    { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full },
  heroToggleChipActive: { backgroundColor: colors.accent },
  heroToggleText:    { color: colors.textSecondary, fontSize: font.sizes.xs, fontWeight: font.weights.semibold },
  heroToggleTextActive: { color: colors.text },
  heroAmountRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 18 },
  heroAmount:        { fontSize: 34, fontWeight: font.weights.bold, color: colors.text },
  heroStatsRow:      { flexDirection: 'row', justifyContent: 'space-between', gap: 16, marginTop: 18 },
  statLabel:         { color: colors.textMuted, fontSize: font.sizes.xs },
  statValue:         { color: colors.text, fontWeight: font.weights.semibold, marginTop: 2 },
  chartWrap:         { marginTop: 2 },
  chartArea:         { position: 'relative', height: 188 },
  chartGridLine:     { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  chartGridLabel:    { width: 42, color: colors.textMuted, fontSize: 10 },
  chartGridStroke:   { flex: 1, height: 1, backgroundColor: `${colors.textMuted}35` },
  chartBarsRow:      { flexDirection: 'row', alignItems: 'flex-end', marginLeft: 48, gap: 10, height: 188, paddingTop: 12, paddingBottom: 1 },
  chartColumn:       { flex: 1, alignItems: 'center' },
  chartBarSlot:      { width: '100%', height: 176, justifyContent: 'flex-end', alignItems: 'center' },
  chartBarPressable: { width: '100%', alignItems: 'center', justifyContent: 'flex-end', minHeight: 136 },
  chartBar:          { width: '72%', maxWidth: 34, minWidth: 22, borderRadius: 10 },
  chartMonthRow:     { flexDirection: 'row', marginLeft: 48, gap: 10, marginTop: 10 },
  chartMonthColumn:  { flex: 1, alignItems: 'center' },
  chartMonthLabel:   { color: colors.textSecondary, fontSize: font.sizes.xs },
  chartTooltip:      { position: 'absolute', top: 0, minWidth: 96, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: `${colors.accent}55`, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', zIndex: 2 },
  chartTooltipMonth: { color: colors.textMuted, fontSize: 10, marginBottom: 2, textAlign: 'center' },
  chartTooltipValue: { color: colors.text, fontSize: font.sizes.sm, fontWeight: font.weights.bold },
  alertBox:          { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: `${colors.danger}30`, borderRadius: radius.md, padding: 14, marginBottom: 16, flexDirection: 'row', gap: 10 },
  alertTitle:        { fontSize: font.sizes.sm, fontWeight: font.weights.bold, color: colors.danger },
  alertBody:         { fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 },
  sectionCard:       { marginBottom: 16 },
  budgetRow:         { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  budgetName:        { fontSize: font.sizes.sm, color: colors.text },
  budgetAmt:         { fontSize: font.sizes.xs, color: colors.textMuted },
  topSpendRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  catIcon:           { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  catName:           { fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text },
  catAmt:            { fontSize: font.sizes.sm, fontWeight: font.weights.bold, color: colors.text },
  pctLabel:          { fontSize: font.sizes.xs, color: colors.textMuted, minWidth: 32, textAlign: 'right' },
  recRow:            { flexDirection: 'row', gap: 10, paddingVertical: 10, alignItems: 'flex-start' },
  privacyRow:        { flexDirection: 'row', gap: 10, paddingVertical: 10, alignItems: 'flex-start' },
  privacyIcon:       { fontSize: 20, lineHeight: 24, marginTop: 1 },
  privacyTextWrap:   { flex: 1, minWidth: 0, flexShrink: 1 },
  privacyTitle:      { fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, flexShrink: 1 },
  privacyDesc:       { fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 4, lineHeight: Platform.OS === 'windows' ? 18 : 16, flexShrink: 1 },
  recText:           { flex: 1, fontSize: font.sizes.sm, color: colors.textSecondary, lineHeight: 20 },
  subRow:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  subMerchant:       { fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, textTransform: 'capitalize' },
  subMeta:           { fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 },
  forecastGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  forecastCell:      { flex: 1, minWidth: '45%', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 12 },
  forecastCat:       { fontSize: font.sizes.xs, color: colors.textMuted },
  forecastAmt:       { fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text, marginTop: 4 },
  forecastConf:      { fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 },
  budgetCardHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  budgetCard:        { marginBottom: 14 },
  budgetMetricsRow:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 12 },
  dropZone:          { borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.md, padding: 40, alignItems: 'center' },
  dropZoneText:      { color: colors.text, fontWeight: font.weights.semibold, fontSize: font.sizes.md },
  dropZoneSub:       { color: colors.textMuted, fontSize: font.sizes.sm, marginTop: 4 },
  mapHint:           { color: colors.textMuted, fontSize: font.sizes.sm, marginBottom: 16 },
  importHint:        { color: colors.textMuted, fontSize: font.sizes.xs, marginTop: 10, lineHeight: 18 },
  ocrInput:          { minHeight: 180, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, color: colors.text, fontSize: font.sizes.sm, marginBottom: 16, textAlignVertical: 'top' },
  ocrPreviewCard:    { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12 },
  scanActionColumn:  { gap: 10, marginBottom: 12 },
  scanHeaderRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  scanModeBadge:     { backgroundColor: `${colors.accent}20`, borderWidth: 1, borderColor: `${colors.accent}40`, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 6 },
  scanModeBadgeText: { color: colors.accent, fontSize: font.sizes.xs, fontWeight: font.weights.semibold },
  scanPreviewImage:  { width: '100%', height: 180, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  scanPreviewText:   { color: colors.textSecondary, fontSize: font.sizes.sm, lineHeight: 20 },
  scanStepperRow:    { flexDirection: 'row', gap: 10 },
  scanStepperButton: { flex: 1 },
  doneState:         { alignItems: 'center', paddingVertical: 20 },
  doneTitle:         { fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text, marginTop: 12 },
  apiKeyBanner:      { backgroundColor: colors.surfaceAlt, padding: 16, borderBottomWidth: 1, borderColor: colors.border },
  assistantReadyBanner: { borderBottomColor: `${colors.success}40`, backgroundColor: `${colors.success}12` },
  assistantSetupBanner: { borderBottomColor: `${colors.warning}40`, backgroundColor: `${colors.warning}10` },
  apiKeyText:        { color: colors.text, fontSize: font.sizes.sm, fontWeight: font.weights.semibold },
  apiKeyNote:        { color: colors.textMuted, fontSize: font.sizes.xs, marginTop: 6 },
  assistantActionRow: { marginTop: 12, alignItems: 'flex-start' },
  msgRow:            { marginBottom: 12, alignItems: 'flex-start' },
  msgRowUser:        { alignItems: 'flex-end' },
  msgBubble:         { maxWidth: '80%', borderRadius: 16, padding: 12 },
  msgUser:           { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  msgAssistant:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  msgText:           { color: colors.text, fontSize: font.sizes.md, lineHeight: 21 },
  inputBar:          { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  chatInput:         { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, color: colors.text, fontSize: font.sizes.md, maxHeight: 100 },
  sendBtn:           { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  suggestionChip:    { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8 },
  suggestionText:    { color: colors.textSecondary, fontSize: font.sizes.xs },
  avatar:            { width: 64, height: 64, borderRadius: 32, backgroundColor: `${colors.accent}25`, borderWidth: 2, borderColor: `${colors.accent}50`, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  profileName:       { fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text },
  profileEmail:      { color: colors.textMuted, fontSize: font.sizes.sm, marginTop: 4 },
  statsRow:          { flexDirection: 'row', gap: 40, marginTop: 16 },
  statCell:          { alignItems: 'center' },
  statBig:           { fontSize: font.sizes.xxl, fontWeight: font.weights.bold, color: colors.text },
});


