// src/engines/index.js
// Layer 3: Local Intelligence (AI/Agent) Layer
// All engines run entirely on-device and avoid cloud dependencies.

function safeKeywords(category) {
  if (!category) return [];
  if (Array.isArray(category.keywords)) return category.keywords;
  if (typeof category.keywords !== 'string') return [];

  try {
    return JSON.parse(category.keywords);
  } catch {
    return [];
  }
}

function normalizeCategoryText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferDirectionHints(text, amount) {
  const normalized = normalizeCategoryText(text);
  const positiveHints = ['credit', 'payroll', 'salary', 'deposit', 'refund', 'reimbursement', 'income', 'interest'];
  const negativeHints = ['debit', 'purchase', 'pos', 'withdrawal', 'payment', 'bill', 'charge', 'sale'];

  let score = 0;
  if (amount > 0) score += 2;
  if (amount < 0) score -= 2;
  positiveHints.forEach((hint) => { if (normalized.includes(hint)) score += 2; });
  negativeHints.forEach((hint) => { if (normalized.includes(hint)) score -= 1; });
  return score;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function monthKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthKey(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return null;
  return new Date(year, month - 1, 1);
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((left, right) => left + right, 0) / values.length;
}

function standardDeviation(values, mean = average(values)) {
  if (!values.length) return 0;
  const variance = values
    .map((value) => (value - mean) ** 2)
    .reduce((left, right) => left + right, 0) / values.length;
  return Math.sqrt(variance);
}

function averageMonthGap(monthKeys) {
  if (monthKeys.length < 2) return 1;
  let totalGap = 0;

  for (let index = 1; index < monthKeys.length; index += 1) {
    const previous = parseMonthKey(monthKeys[index - 1]);
    const current = parseMonthKey(monthKeys[index]);
    if (!previous || !current) continue;

    totalGap += ((current.getFullYear() - previous.getFullYear()) * 12) + (current.getMonth() - previous.getMonth());
  }

  return totalGap / (monthKeys.length - 1);
}

function parseDateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function averageDayGap(dates) {
  if (dates.length < 2) return 0;
  const intervals = dates.slice(1).map((date, index) => (
    (date - dates[index]) / 86400000
  ));
  return average(intervals);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function normalizeMerchantKey(merchant) {
  return String(merchant || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(inc|llc|corp|corporation|company|co|ltd|online|com|www|payment|debit|card|purchase|pos)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseWords(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function mostCommonValue(values) {
  const counts = new Map();
  values.forEach((value) => {
    const key = String(value || '').trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || '';
}

function detectCadence(intervals) {
  if (!intervals.length) return null;

  const medianInterval = median(intervals);
  const intervalStd = standardDeviation(intervals, average(intervals));
  const cadenceOptions = [
    { frequency: 'weekly', target: 7, min: 5, max: 9, maxStd: 1.8, minCount: 3, badge: '/wk' },
    { frequency: 'monthly', target: 30.4, min: 26, max: 34, maxStd: 4.5, minCount: 2, badge: '/mo' },
  ];

  return cadenceOptions.find((option) => (
    medianInterval >= option.min &&
    medianInterval <= option.max &&
    intervalStd <= option.maxStd &&
    intervals.length >= option.minCount
  )) || null;
}

function buildZombieReason({ cadence, averageAmount, count, cadenceScore, amountScore }) {
  const reasons = [];
  reasons.push(`${cadence.frequency} charge pattern`);
  if (amountScore > 0.8) reasons.push('very consistent amount');
  if (count >= 6) reasons.push('long-running');
  if (averageAmount <= 30) reasons.push('low-dollar charge that is easy to miss');
  if (cadenceScore > 0.85) reasons.push('highly regular billing cadence');
  return reasons.join(', ');
}

// Transaction Categorization Engine
// Keyword and transaction-shape heuristics with explicit category matching.
export const CategorizationEngine = {
  categorize(merchant, categories) {
    return this.resolveCategory({ merchant }, categories);
  },

  findExplicitCategory(categoryLabel, categories) {
    const normalizedLabel = normalizeCategoryText(categoryLabel);
    if (!normalizedLabel) return null;

    return categories.find((category) => {
      const label = normalizeCategoryText(category.name);
      const id = normalizeCategoryText(category.id);
      return (
        label === normalizedLabel ||
        id === normalizedLabel ||
        label.includes(normalizedLabel) ||
        normalizedLabel.includes(label)
      );
    }) || null;
  },

  resolveCategory(transaction, categories) {
    const explicit = this.findExplicitCategory(transaction.category, categories);
    if (explicit) return explicit.id;

    const merchant = String(transaction.merchant || '');
    const note = String(transaction.note || '');
    const freeform = String(transaction.category || '');
    const amount = Number(transaction.amount || 0);
    const combinedText = normalizeCategoryText(`${merchant} ${note} ${freeform}`);
    const directionScore = inferDirectionHints(combinedText, amount);

    let bestCategoryId = 'cat_other';
    let bestScore = directionScore > 1 ? 2 : 0;

    for (const category of categories.filter((item) => item.id !== 'cat_other')) {
      const keywords = safeKeywords(category).map(normalizeCategoryText).filter(Boolean);
      let score = 0;

      keywords.forEach((keyword) => {
        if (combinedText.includes(keyword)) {
          score += keyword.includes(' ') ? 4 : 3;
        }
      });

      if (normalizeCategoryText(category.name).split(' ').some((token) => token && combinedText.includes(token))) {
        score += 1;
      }

      if (category.id === 'cat_income' && directionScore > 0) {
        score += 4;
      }

      if (category.id !== 'cat_income' && directionScore < 0 && amount < 0) {
        score += 1;
      }

      if (category.id === 'cat_rent' && /\b(rent|mortgage|lease|hoa)\b/.test(combinedText)) {
        score += 3;
      }

      if (category.id === 'cat_utilities' && /\b(electric|water|power|internet|wireless|phone|gas bill)\b/.test(combinedText)) {
        score += 3;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCategoryId = category.id;
      }
    }

    if (bestCategoryId === 'cat_other' && amount > 0) {
      return 'cat_income';
    }

    return bestCategoryId;
  },
};

// Anomaly Detection Engine
// Statistical heuristics: mean + std deviation.
export const AnomalyDetectionEngine = {
  detect(transactions, profileId) {
    const anomalies = [];
    if (!transactions.length) return anomalies;

    const byCategory = {};
    transactions.forEach((transaction) => {
      if (!byCategory[transaction.category_id]) byCategory[transaction.category_id] = [];
      byCategory[transaction.category_id].push({ amt: Math.abs(parseFloat(transaction.amount) || 0), tx: transaction });
    });

    Object.entries(byCategory).forEach(([categoryId, items]) => {
      const amounts = items.map((item) => item.amt);
      const mean = amounts.reduce((left, right) => left + right, 0) / amounts.length;
      const std = Math.sqrt(amounts.map((amount) => (amount - mean) ** 2).reduce((left, right) => left + right, 0) / amounts.length);

      items.forEach(({ amt, tx }) => {
        if (amt > mean + 2.5 * std && amt > 50) {
          anomalies.push({
            profile_id: profileId,
            transaction_id: tx.id,
            type: 'high_spend',
            description: `Unusually high ${categoryId.replace('cat_', '')} expense: $${amt.toFixed(2)} (avg $${mean.toFixed(2)})`,
            severity: amt > mean + 4 * std ? 'high' : 'medium',
            detected_at: new Date().toISOString(),
          });
        }
      });
    });

    return anomalies;
  },
};

// Forecasting Engine
// Chronological monthly spend forecasting with recency, seasonality, and capped trend adjustment.
export const ForecastingEngine = {
  forecast(transactions, categoryId, monthsAhead = 1) {
    const filtered = transactions.filter(
      (transaction) => transaction.category_id === categoryId && parseFloat(transaction.amount) < 0
    );
    if (filtered.length < 3) return null;

    const byMonth = {};
    filtered.forEach((transaction) => {
      const key = (transaction.date || '').slice(0, 7);
      if (!key || key.length !== 7) return;
      if (!byMonth[key]) byMonth[key] = 0;
      byMonth[key] += Math.abs(parseFloat(transaction.amount));
    });

    let monthKeys = Object.keys(byMonth).sort();
    if (!monthKeys.length) return null;

    const now = new Date();
    const currentMonthKey = monthKeyFromDate(now);
    if (monthKeys.length > 1 && monthKeys[monthKeys.length - 1] === currentMonthKey) {
      monthKeys = monthKeys.slice(0, -1);
    }
    if (monthKeys.length < 3) return null;

    const monthlyTotals = monthKeys.map((key) => byMonth[key]);
    const recent3 = monthlyTotals.slice(-3);
    const recent12 = monthlyTotals.slice(-12);
    const recent6 = monthlyTotals.slice(-6);
    const targetDate = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), monthsAhead);
    const targetMonthNumber = targetDate.getMonth();
    const sameMonthPriorYears = monthKeys
      .filter((key) => {
        const parsed = parseMonthKey(key);
        return parsed && parsed.getMonth() === targetMonthNumber;
      })
      .map((key) => byMonth[key]);

    const recent3Avg = average(recent3);
    const recent12Avg = average(recent12);
    const seasonalAvg = sameMonthPriorYears.length ? average(sameMonthPriorYears) : recent12Avg;

    const baseForecast = (
      recent3Avg * 0.45 +
      recent12Avg * 0.30 +
      seasonalAvg * 0.25
    );

    const trendSlope = recent6.length > 1
      ? (recent6[recent6.length - 1] - recent6[0]) / (recent6.length - 1)
      : 0;
    const rawTrendAdjustment = trendSlope * Math.max(1, monthsAhead);
    const cappedTrendAdjustment = clamp(rawTrendAdjustment, -baseForecast * 0.2, baseForecast * 0.2);
    const predicted = Math.max(0, baseForecast + cappedTrendAdjustment);

    const overallAvg = average(monthlyTotals);
    const volatility = standardDeviation(monthlyTotals, overallAvg) / (overallAvg || 1);
    const coverageScore = clamp(monthlyTotals.length / 12, 0, 1);
    const stabilityScore = clamp(1 - volatility, 0, 1);
    const seasonalityScore = clamp(sameMonthPriorYears.length / 3, 0, 1);
    const continuityScore = clamp(1 / averageMonthGap(monthKeys), 0, 1);
    const confidence = clamp(
      0.35 +
      coverageScore * 0.25 +
      stabilityScore * 0.2 +
      seasonalityScore * 0.1 +
      continuityScore * 0.1,
      0.5,
      0.95
    );

    return {
      predicted,
      confidence,
      components: {
        recent3Avg,
        recent12Avg,
        seasonalAvg,
        trendAdjustment: cappedTrendAdjustment,
        historyMonths: monthKeys.length,
      },
    };
  },
};

// Financial Recommendation Engine
// Explainable rule-based suggestions.
export const RecommendationEngine = {
  generate(transactions, budgets, categories) {
    const recommendations = [];
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const monthTransactions = transactions.filter(
      (transaction) => (transaction.date || '').startsWith(thisMonth) && parseFloat(transaction.amount) < 0
    );
    const spendByCategory = {};
    monthTransactions.forEach((transaction) => {
      spendByCategory[transaction.category_id] = (spendByCategory[transaction.category_id] || 0) + Math.abs(parseFloat(transaction.amount));
    });

    budgets.forEach((budget) => {
      const spent = spendByCategory[budget.category_id] || 0;
      const pct = spent / budget.limit_amount;
      const category = categories.find((item) => item.id === budget.category_id);
      if (pct > 0.9) {
        recommendations.push({
          type: 'warning',
          icon: '!',
          text: `${category?.name || budget.category_id} budget is ${Math.round(pct * 100)}% used ($${spent.toFixed(0)} of $${budget.limit_amount})`,
          priority: pct > 1 ? 3 : 2,
        });
      }
    });

    const sorted = Object.entries(spendByCategory).sort((left, right) => right[1] - left[1]);
    if (sorted.length > 0) {
      const [topCategoryId, topAmount] = sorted[0];
      const topCategory = categories.find((item) => item.id === topCategoryId);
      recommendations.push({
        type: 'insight',
        icon: '>',
        text: `Highest spend this month: ${topCategory?.name || topCategoryId} ($${topAmount.toFixed(0)})`,
        priority: 1,
      });
    }

    const diningSpend = spendByCategory.cat_food || 0;
    if (diningSpend > 300) {
      recommendations.push({
        type: 'tip',
        icon: '*',
        text: `Dining out cost $${diningSpend.toFixed(0)} this month. Meal prepping twice a week could save about $${Math.round(diningSpend * 0.2)}.`,
        priority: 1,
      });
    }

    return recommendations.sort((left, right) => right.priority - left.priority).slice(0, 5);
  },
};

// Subscription Detection Engine
// Detects likely active recurring charges and ranks those most likely to be forgotten "zombie" subscriptions.
export const SubscriptionEngine = {
  detect(transactions) {
    const excludedCategories = ['cat_income', 'cat_food', 'cat_transport', 'cat_rent', 'cat_utilities'];
    const merchants = {};
    const now = new Date();

    transactions.forEach((transaction) => {
      const amount = parseFloat(transaction.amount);
      if (amount >= 0) return;
      if (excludedCategories.includes(transaction.category_id)) return;

      const key = normalizeMerchantKey(transaction.merchant);
      if (!key) return;

      if (!merchants[key]) {
        merchants[key] = {
          amounts: [],
          dates: [],
          merchants: [],
        };
      }

      merchants[key].amounts.push(Math.abs(amount));
      merchants[key].dates.push(transaction.date);
      merchants[key].merchants.push(transaction.merchant);
    });

    const subscriptions = [];
    Object.entries(merchants).forEach(([merchant, data]) => {
      if (data.amounts.length < 3) return;

      const sortedDates = data.dates
        .map(parseDateValue)
        .filter(Boolean)
        .sort((left, right) => left - right);
      if (sortedDates.length < 3) return;

      const intervals = sortedDates.slice(1).map((date, index) => (
        (date - sortedDates[index]) / 86400000
      ));
      const cadence = detectCadence(intervals);
      if (!cadence) return;

      const averageAmount = average(data.amounts);
      const amountStd = standardDeviation(data.amounts, averageAmount);
      const relativeAmountStd = amountStd / (averageAmount || 1);
      const amountScore = clamp(1 - (relativeAmountStd / 0.18), 0, 1);
      if (amountScore < 0.45) return;

      const intervalStd = standardDeviation(intervals, average(intervals));
      const cadenceScore = clamp(1 - (intervalStd / cadence.maxStd), 0, 1);
      const countScore = clamp(data.amounts.length / 8, 0, 1);
      const stealthScore = averageAmount <= 20 ? 1 : averageAmount <= 50 ? 0.85 : averageAmount <= 100 ? 0.6 : 0.35;
      const recencyDays = (now - sortedDates[sortedDates.length - 1]) / 86400000;
      const activeWindowDays = cadence.frequency === 'monthly' ? 50 : 16;
      if (recencyDays > activeWindowDays) return;
      const recencyScore = clamp(1 - (recencyDays / activeWindowDays), 0, 1);

      const zombieScore = clamp(
        cadenceScore * 0.3 +
        amountScore * 0.25 +
        countScore * 0.2 +
        stealthScore * 0.15 +
        recencyScore * 0.1,
        0,
        1
      );
      if (zombieScore < 0.58) return;

      const displayMerchant = mostCommonValue(data.merchants) || titleCaseWords(merchant);
      subscriptions.push({
        merchant: displayMerchant,
        amount: -averageAmount,
        frequency: cadence.frequency,
        billing_suffix: cadence.badge,
        last_seen: sortedDates[sortedDates.length - 1].toISOString(),
        count: data.amounts.length,
        zombie_score: zombieScore,
        confidence: clamp(0.45 + zombieScore * 0.45, 0.5, 0.95),
        reason: buildZombieReason({ cadence, averageAmount, count: data.amounts.length, cadenceScore, amountScore }),
      });
    });

    return subscriptions
      .sort((left, right) => right.zombie_score - left.zombie_score || right.count - left.count);
  },
};
