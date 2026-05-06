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
// Lightweight monthly trend estimation per category.
export const ForecastingEngine = {
  forecast(transactions, categoryId, monthsAhead = 1) {
    const filtered = transactions.filter(
      (transaction) => transaction.category_id === categoryId && parseFloat(transaction.amount) < 0
    );
    if (filtered.length < 3) return null;

    const byMonth = {};
    filtered.forEach((transaction) => {
      const key = (transaction.date || '').slice(0, 7);
      if (!byMonth[key]) byMonth[key] = 0;
      byMonth[key] += Math.abs(parseFloat(transaction.amount));
    });

    const values = Object.values(byMonth).sort((left, right) => left - right);
    const avg = values.reduce((left, right) => left + right, 0) / values.length;
    const trend = values.length > 1 ? (values[values.length - 1] - values[0]) / values.length : 0;
    const predicted = avg + trend * monthsAhead;
    const variance = values.map((value) => (value - avg) ** 2).reduce((left, right) => left + right, 0) / values.length;
    const confidence = Math.max(0.5, Math.min(0.95, 1 - Math.sqrt(variance) / (avg || 1)));

    return { predicted: Math.max(0, predicted), confidence };
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
// Detects recurring same-amount merchant charges.
export const SubscriptionEngine = {
  detect(transactions) {
    const excludedCategories = ['cat_income', 'cat_food', 'cat_transport'];
    const merchants = {};

    transactions.forEach((transaction) => {
      const amount = parseFloat(transaction.amount);
      if (amount >= 0) return;
      if (excludedCategories.includes(transaction.category_id)) return;

      const key = (transaction.merchant || '').toLowerCase().trim();
      if (!merchants[key]) merchants[key] = { amounts: [], dates: [] };
      merchants[key].amounts.push(amount);
      merchants[key].dates.push(transaction.date);
    });

    const subscriptions = [];
    Object.entries(merchants).forEach(([merchant, data]) => {
      if (data.amounts.length < 2) return;

      const allSame = data.amounts.every((amount) => Math.abs(amount - data.amounts[0]) < 0.01);
      const sortedDates = [...data.dates].filter(Boolean).sort();
      if (sortedDates.length < 2) return;

      const intervals = sortedDates.slice(1).map((date, index) =>
        (new Date(date) - new Date(sortedDates[index])) / (1000 * 60 * 60 * 24)
      );
      const avgInterval = intervals.reduce((left, right) => left + right, 0) / intervals.length;

      const isMonthly = avgInterval > 25 && avgInterval < 35;
      const isWeekly = avgInterval > 6 && avgInterval < 8;

      if (allSame && (isMonthly || isWeekly)) {
        subscriptions.push({
          merchant,
          amount: data.amounts[0],
          frequency: isMonthly ? 'monthly' : 'weekly',
          last_seen: sortedDates[sortedDates.length - 1],
          count: data.amounts.length,
        });
      }
    });

    return subscriptions;
  },
};
