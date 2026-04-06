// src/components/index.js
// Shared UI Components — React Native versions of all web components

import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, Modal as RNModal, ScrollView, Pressable,
} from 'react-native';
import { colors, radius, spacing, font } from '../theme';

// ─── Card ───────────────────────────────────

export function Card({ children, style }) {
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

// ─── Button ─────────────────────────────────

export function Btn({ children, onPress, variant = 'primary', size = 'md', disabled, fullWidth, style }) {
  const variantStyle = {
    primary: { bg: colors.accent,     text: '#fff'              },
    ghost:   { bg: 'transparent',     text: colors.textSecondary },
    danger:  { bg: colors.dangerSoft, text: colors.danger        },
    outline: { bg: 'transparent',     text: colors.accent        },
  }[variant];

  return (
    <TouchableOpacity
      onPress={!disabled ? onPress : undefined}
      activeOpacity={0.75}
      style={[
        styles.btn,
        { backgroundColor: variantStyle.bg, paddingVertical: size === 'sm' ? 8 : 13, paddingHorizontal: size === 'sm' ? 14 : 20 },
        variant === 'outline' && { borderWidth: 1, borderColor: `${colors.accent}50` },
        variant === 'danger'  && { borderWidth: 1, borderColor: `${colors.danger}30` },
        fullWidth && { width: '100%' },
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      <Text style={[styles.btnText, { color: variantStyle.text, fontSize: size === 'sm' ? font.sizes.sm : font.sizes.md }]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Input ──────────────────────────────────

export function Input({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, icon, multiline }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      {label && (
        <Text style={styles.inputLabel}>{label}</Text>
      )}
      <View style={{ position: 'relative' }}>
        {icon && <Text style={styles.inputIcon}>{icon}</Text>}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          multiline={multiline}
          style={[
            styles.input,
            icon && { paddingLeft: 40 },
            multiline && { height: 80, textAlignVertical: 'top' },
          ]}
        />
      </View>
    </View>
  );
}

// ─── Badge ──────────────────────────────────

export function Badge({ children, color }) {
  return (
    <View style={{ backgroundColor: `${color}25`, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color, fontSize: font.sizes.xs, fontWeight: font.weights.bold }}>{children}</Text>
    </View>
  );
}

// ─── Progress Bar ───────────────────────────

export function ProgressBar({ value, max, color = colors.accent }) {
  const pct      = Math.min(100, (value / (max || 1)) * 100);
  const barColor = pct > 100 ? colors.danger : pct > 80 ? colors.warning : color;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.min(100, pct)}%`, backgroundColor: barColor }]} />
    </View>
  );
}

// ─── Screen Loader ──────────────────────────

export function ScreenLoader() {
  return (
    <View style={styles.loader}>
      <Text style={{ fontSize: 36, marginBottom: 8 }}>💎</Text>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

// ─── Section Header ─────────────────────────

export function SectionHeader({ title, action, onAction }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && (
        <TouchableOpacity onPress={onAction}>
          <Text style={{ color: colors.accent, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Bottom Sheet Modal ─────────────────────

export function BottomSheet({ visible, title, onClose, children, footer }) {
  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.bottomSheet} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: colors.textMuted, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            {children}
          </ScrollView>
          {footer && (
            <View style={styles.sheetFooter}>
              {footer}
            </View>
          )}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

// ─── Category Pill ──────────────────────────

export function CategoryPill({ category }) {
  if (!category) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${category.color}20`, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 11 }}>{category.icon}</Text>
      <Text style={{ fontSize: font.sizes.xs, color: category.color, fontWeight: font.weights.semibold }}>{category.name}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    padding:         spacing.xl,
    borderWidth:     1,
    borderColor:     colors.border,
  },
  btn: {
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    flexDirection:  'row',
    gap:            6,
  },
  btnText: {
    fontWeight: font.weights.bold,
  },
  inputLabel: {
    fontSize:      font.sizes.xs,
    color:         colors.textMuted,
    fontWeight:    font.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom:  6,
  },
  inputIcon: {
    position:  'absolute',
    left:      12,
    top:       13,
    fontSize:  16,
    zIndex:    1,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth:     1,
    borderColor:     colors.border,
    borderRadius:    radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color:           colors.text,
    fontSize:        font.sizes.md,
  },
  progressTrack: {
    backgroundColor: colors.surfaceAlt,
    borderRadius:    4,
    height:          6,
    overflow:        'hidden',
  },
  progressFill: {
    height:       6,
    borderRadius: 4,
  },
  loader: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  sectionHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   14,
  },
  sectionTitle: {
    fontSize:   font.sizes.lg,
    fontWeight: font.weights.bold,
    color:      colors.text,
  },
  modalOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent:  'flex-end',
  },
  bottomSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius:  radius.xl,
    borderTopRightRadius: radius.xl,
    padding:         spacing.xl,
    paddingBottom:   40,
    maxHeight:       '85%',
    borderTopWidth:  1,
    borderColor:     colors.border,
  },
  sheetHandle: {
    width:           40,
    height:          4,
    backgroundColor: colors.border,
    borderRadius:    2,
    alignSelf:       'center',
    marginBottom:    16,
  },
  sheetHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   spacing.xl,
  },
  sheetTitle: {
    fontSize:   font.sizes.xl,
    fontWeight: font.weights.bold,
    color:      colors.text,
  },
  sheetFooter: {
    paddingTop:   12,
    borderTopWidth: 1,
    borderColor:  colors.border,
    marginTop:    4,
  },
});
