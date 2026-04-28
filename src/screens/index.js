// src/screens/index.js
// Layer 1: Presentation Layer — All Screens
// React Native versions of all 6 UI screens

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, FlatList, KeyboardAvoidingView,
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

function isTextIcon(icon) {
  return /^[A-Za-z][A-Za-z0-9\s&/-]*$/.test(String(icon || '').trim());
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

  const { totalSpend, lastMonthSpend, totalIncome, spendByCategory, cats, budgets, recommendations, anomalies, subscriptions, forecasts } = data;
  const spendChange    = lastMonthSpend ? ((totalSpend - lastMonthSpend) / lastMonthSpend * 100).toFixed(1) : null;
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
      <Card style={styles.heroCard}>
        <Text style={styles.heroLabel}>TOTAL SPENT THIS MONTH</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
          <Text style={styles.heroAmount}>${totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
          {spendChange !== null && (
            <Badge color={parseFloat(spendChange) > 0 ? colors.danger : colors.success}>
              {parseFloat(spendChange) > 0 ? '↑' : '↓'}{Math.abs(spendChange)}%
            </Badge>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 24 }}>
          <View><Text style={styles.statLabel}>Income</Text><Text style={[styles.statValue, { color: colors.success }]}>+${totalIncome.toLocaleString()}</Text></View>
          <View><Text style={styles.statLabel}>Last Month</Text><Text style={styles.statValue}>${lastMonthSpend.toLocaleString()}</Text></View>
          <View><Text style={styles.statLabel}>Balance</Text><Text style={[styles.statValue, { color: totalIncome - totalSpend >= 0 ? colors.success : colors.danger }]}>${(totalIncome - totalSpend).toFixed(0)}</Text></View>
        </View>
      </Card>

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
  const [form,         setForm]         = useState({ date: new Date().toISOString().slice(0, 10), merchant: '', amount: '', category_id: '', note: '' });

  const load = useCallback(async () => {
    const [txs, cats] = await Promise.all([
      FinancialDataService.getTransactions(profile.id, { search, category: filterCat }),
      FinancialDataService.getAllCategories(),
    ]);
    setTransactions(txs); setCategories(cats);
  }, [profile.id, search, filterCat]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribeToDataChanges(load), [load]);

  const handleSave = async () => {
    // Validate required fields before saving
    if (!form.date.trim()) {
      Alert.alert('Missing Field', 'Please enter a date.');
      return;
    }
    if (!form.merchant.trim()) {
      Alert.alert('Missing Field', 'Please enter a merchant name.');
      return;
    }
    const parsedAmount = parseFloat(form.amount);
    if (!form.amount.trim() || isNaN(parsedAmount)) {
      Alert.alert('Invalid Amount', 'Please enter a valid number for the amount (e.g. -12.50).');
      return;
    }

    // Confirm before committing to the database
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
            setForm({ date: new Date().toISOString().slice(0, 10), merchant: '', amount: '', category_id: '', note: '' });
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
        <TouchableOpacity onPress={() => setFilterCat('')} style={[styles.filterPill, !filterCat && styles.filterPillActive]}>
          <Text style={[styles.filterPillText, !filterCat && { color: '#fff' }]}>All</Text>
        </TouchableOpacity>
        {categories.map(c => (
          <TouchableOpacity key={c.id} onPress={() => setFilterCat(filterCat === c.id ? '' : c.id)} style={[styles.filterPill, filterCat === c.id && { backgroundColor: c.color }]}>
            <Text style={[styles.filterPillText, filterCat === c.id && { color: '#fff' }]}>{c.icon} {c.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      {transactions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 48, marginBottom: 8 }}>💳</Text>
          <Text style={styles.emptyText}>No transactions yet.{'\n'}Import CSV or add manually.</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={t => t.id}
          renderItem={renderTx}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
        />
      )}

      {/* Add/Edit Sheet */}
      <BottomSheet
        visible={showAdd}
        title={editTx ? 'Edit Transaction' : 'Add Transaction'}
        onClose={() => { setShowAdd(false); setEditTx(null); setForm({ date: new Date().toISOString().slice(0, 10), merchant: '', amount: '', category_id: '', note: '' }); }}
        footer={
          <View style={{ flexDirection: 'column', gap: 10 }}>
            <Btn onPress={handleSave} fullWidth>{editTx ? 'Update' : 'Save'}</Btn>
            <Btn variant="ghost" onPress={() => { setShowAdd(false); setEditTx(null); setForm({ date: new Date().toISOString().slice(0, 10), merchant: '', amount: '', category_id: '', note: '' }); }} fullWidth>Cancel</Btn>
          </View>
        }
      >
        <Input label="Date (YYYY-MM-DD)" value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))} placeholder="2025-01-15" />
        <Input label="Merchant" value={form.merchant} onChangeText={v => setForm(f => ({ ...f, merchant: v }))} placeholder="e.g. Starbucks" />
        <Input label="Amount (negative = expense)" value={form.amount} onChangeText={v => setForm(f => ({ ...f, amount: v }))} placeholder="-12.50" keyboardType="numeric" />
        <Text style={styles.inputLabel}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS !== 'windows'} style={styles.sheetChipScroll} contentContainerStyle={styles.sheetChipScrollContent}>
          {categories.map(c => (
            <TouchableOpacity key={c.id} onPress={() => setForm(f => ({ ...f, category_id: c.id }))} style={[styles.filterPill, form.category_id === c.id && { backgroundColor: c.color }]}>
              <Text style={[styles.filterPillText, form.category_id === c.id && { color: '#fff' }]}>{c.icon} {c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Input label="Note (optional)" value={form.note} onChangeText={v => setForm(f => ({ ...f, note: v }))} placeholder="Optional note" />
      </BottomSheet>

      {/* CSV Import Sheet */}
      {showImport && <CSVImportSheet profile={profile} onClose={() => { setShowImport(false); load(); }} />}
      {showOcrImport && <OCRImportSheet profile={profile} onClose={() => { setShowOcrImport(false); load(); }} />}
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
                <TouchableOpacity onPress={() => setMapping(m => ({ ...m, [field]: '' }))} style={[styles.filterPill, !mapping[field] && styles.filterPillActive]}>
                  <Text style={[styles.filterPillText, !mapping[field] && { color: '#fff' }]}>— skip —</Text>
                </TouchableOpacity>
                {csvData.headers.map(h => (
                  <TouchableOpacity key={h} onPress={() => setMapping(m => ({ ...m, [field]: h }))} style={[styles.filterPill, mapping[field] === h && styles.filterPillActive]}>
                    <Text style={[styles.filterPillText, mapping[field] === h && { color: '#fff' }]}>{h}</Text>
                  </TouchableOpacity>
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

// ─────────────────────────────────────────────
// Budget Manager Screen
// ─────────────────────────────────────────────

export function BudgetManagerScreen({ profile }) {
  const [budgets,    setBudgets]    = useState([]);
  const [categories, setCategories] = useState([]);
  const [showAdd,    setShowAdd]    = useState(false);
  const [form,       setForm]       = useState({ category_id: '', limit: '' });
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
    setForm({ category_id: '', limit: '' });

    try {
      await BudgetingGoalService.setBudget(profile.id, form.category_id, month, year, parsedLimit);
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

  return (
    <View style={styles.screen}>
      <View style={styles.screenHeaderRow}>
        <Text style={styles.screenTitle}>Budget Manager</Text>
        <Btn size="sm" onPress={() => setShowAdd(true)}>+ Budget</Btn>
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
          return (
            <Card key={b.id} style={{ marginBottom: 14 }}>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Badge color={over ? colors.danger : pct > 80 ? colors.warning : colors.success}>{Math.round(pct)}%</Badge>
                  <TouchableOpacity onPress={() => handleDelete(b.id)}><Text style={{ fontSize: 16 }}>🗑️</Text></TouchableOpacity>
                </View>
              </View>
              <ProgressBar value={b.spent} max={b.limit_amount} color={cat?.color || colors.accent} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={styles.txMeta}>Spent: <Text style={{ color: colors.text }}>${b.spent.toFixed(0)}</Text></Text>
                <Text style={styles.txMeta}>Limit: <Text style={{ color: colors.text }}>${b.limit_amount.toFixed(0)}</Text></Text>
              </View>
            </Card>
          );
        })}
      </ScrollView>

      <BottomSheet
        visible={showAdd}
        title="Set Budget"
        onClose={() => { if (!saving) setShowAdd(false); }}
        footer={
          <View style={{ flexDirection: 'column', gap: 10 }}>
            <Btn onPress={handleSave} disabled={saving || !form.category_id || !form.limit} fullWidth>{saving ? 'Saving...' : 'Save Budget'}</Btn>
            <Btn variant="ghost" onPress={() => setShowAdd(false)} disabled={saving} fullWidth>Cancel</Btn>
          </View>
        }
      >
        <Text style={styles.inputLabel}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS !== 'windows'} style={styles.sheetChipScroll} contentContainerStyle={styles.sheetChipScrollContent}>
          {categories.map(c => (
            <TouchableOpacity key={c.id} onPress={() => setForm(f => ({ ...f, category_id: c.id }))} style={[styles.filterPill, form.category_id === c.id && { backgroundColor: c.color }]}>
              <Text style={[styles.filterPillText, form.category_id === c.id && { color: '#fff' }]}>{c.icon} {c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Input label={`Monthly limit for ${now.toLocaleString('default', { month: 'long' })}`} value={form.limit} onChangeText={v => setForm(f => ({ ...f, limit: v }))} placeholder="500" keyboardType="numeric" icon="💰" />
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
  toolbar:           { gap: 12, padding: 16, paddingBottom: 8 },
  toolbarSection:    { gap: 4 },
  toolbarSectionTitle: { fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text },
  toolbarSectionText: { fontSize: font.sizes.xs, color: colors.textMuted, lineHeight: 18 },
  toolbarActions:    { flexDirection: 'row', gap: 8 },
  toolbarActionButton: { flex: 1 },
  searchBox:         { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10 },
  searchIcon:        { fontSize: 14, marginRight: 6 },
  searchInput:       { flex: 1, color: colors.text, fontSize: font.sizes.md, paddingVertical: 10 },
  filterSection:     { paddingHorizontal: 16, marginBottom: 8, gap: 4 },
  filterRow:         { maxHeight: 48, marginBottom: 4 },
  filterRowContent:  { paddingHorizontal: 16, gap: 8, paddingBottom: Platform.OS === 'windows' ? 12 : 0, paddingRight: Platform.OS === 'windows' ? 12 : 0 },
  sheetChipScroll:   { marginBottom: 16 },
  sheetChipScrollContent: { gap: 8, paddingBottom: Platform.OS === 'windows' ? 12 : 0, paddingRight: Platform.OS === 'windows' ? 12 : 0 },
  filterPill:        { backgroundColor: colors.surfaceAlt, borderRadius: radius.full, paddingHorizontal: 12, minHeight: 34, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  filterPillActive:  { backgroundColor: colors.accent, borderColor: colors.accent },
  filterPillText:    { color: colors.textSecondary, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, textAlignVertical: 'center', includeFontPadding: false },
  inputLabel:        { fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input:             { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, color: colors.text, fontSize: font.sizes.md, marginBottom: 16 },
  txRow:             { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  txIcon:            { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  txMerchant:        { fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text },
  txMeta:            { fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 },
  txAmt:             { fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text, fontVariant: ['tabular-nums'] },
  divider:           { height: 1, backgroundColor: colors.border },
  emptyState:        { alignItems: 'center', paddingVertical: 60 },
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
  heroCard:          { background: colors.surface, marginBottom: 16, borderColor: `${colors.accent}40` },
  heroLabel:         { color: colors.textMuted, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, letterSpacing: 0.5, marginBottom: 4 },
  heroAmount:        { fontSize: 34, fontWeight: font.weights.bold, color: colors.text },
  statLabel:         { color: colors.textMuted, fontSize: font.sizes.xs },
  statValue:         { color: colors.text, fontWeight: font.weights.semibold, marginTop: 2 },
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
  dropZone:          { borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.md, padding: 40, alignItems: 'center' },
  dropZoneText:      { color: colors.text, fontWeight: font.weights.semibold, fontSize: font.sizes.md },
  dropZoneSub:       { color: colors.textMuted, fontSize: font.sizes.sm, marginTop: 4 },
  mapHint:           { color: colors.textMuted, fontSize: font.sizes.sm, marginBottom: 16 },
  importHint:        { color: colors.textMuted, fontSize: font.sizes.xs, marginTop: 10, lineHeight: 18 },
  ocrInput:          { minHeight: 180, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, color: colors.text, fontSize: font.sizes.sm, marginBottom: 16, textAlignVertical: 'top' },
  ocrPreviewCard:    { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12 },
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
