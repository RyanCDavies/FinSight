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

const GEMMA_ENDPOINT = 'http://127.0.0.1:11434';
const GEMMA_MODEL = 'gemma2:2b-instruct';

function formatCurrency(amount) {
  return `$${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildFallbackAnswer(message, context) {
  const lower = String(message || '').toLowerCase();
  const topCategory = Object.entries(context.spendByCategory || {}).sort((left, right) => right[1] - left[1])[0];
  const overBudget = (context.budgets || []).filter((budget) => budget.limit && budget.spent / budget.limit >= 0.9);

  if (lower.includes('budget')) {
    if (!context.budgets?.length) {
      return 'You do not have active budgets yet. Start with your biggest spending category so the assistant can track progress against a monthly target.';
    }

    if (!overBudget.length) {
      return 'Your tracked budgets are not near the limit right now. Keep watching your top spending category and check again around mid-month.';
    }

    return overBudget
      .slice(0, 2)
      .map((budget) => `${budget.category} is at ${Math.round((budget.spent / budget.limit) * 100)}% of budget (${formatCurrency(budget.spent)} of ${formatCurrency(budget.limit)}).`)
      .join(' ');
  }

  if (lower.includes('save') || lower.includes('cut back')) {
    if (topCategory) {
      return `${topCategory[0]} is your largest spending area at ${formatCurrency(topCategory[1])}. Reducing that category by 10% would save about ${formatCurrency(topCategory[1] * 0.1)} this month.`;
    }

    return 'Import a few transactions first and I can point to the most expensive category.';
  }

  if (lower.includes('food') || lower.includes('dining')) {
    const foodSpend = Number((context.spendByCategory || {})['Food & Dining'] || 0);
    return `Food and dining spend is ${formatCurrency(foodSpend)} this month. Trimming even one or two restaurant purchases each week would move that number quickly.`;
  }

  return `${context.summary || 'Your local finance summary is ready.'} ${topCategory ? `Your highest category is ${topCategory[0]} at ${formatCurrency(topCategory[1])}.` : ''}`.trim();
}

// Agentic AI Assistant Engine
// Uses a local Gemma 2 runtime exposed by Ollama on this device.
export const AgenticAssistant = {
  async getStatus() {
    try {
      const response = await fetch(`${GEMMA_ENDPOINT}/api/tags`);
      if (!response.ok) throw new Error(`Status ${response.status}`);

      const payload = await response.json();
      const installed = Array.isArray(payload.models) && payload.models.some((model) => String(model.name || '').startsWith('gemma2'));
      return {
        ready: installed,
        model: installed ? GEMMA_MODEL : null,
        detail: installed ? 'Gemma 2 is available locally through Ollama.' : 'Install a local Gemma 2 model in Ollama to enable chat.',
      };
    } catch {
      return {
        ready: false,
        model: null,
        detail: 'Local Gemma runtime not detected. Start Ollama with a Gemma 2 model on this device.',
      };
    }
  },

  async chat(message, context, onChunk) {
    const systemPrompt = `You are FinSight's fully offline finance assistant running locally with Google Gemma 2. Use only the provided financial context. Be concise, practical, and privacy-first. Never ask for bank credentials or imply cloud processing.

Financial context:
${JSON.stringify(context, null, 2)}

Rules:
- Prefer 2 to 4 short paragraphs or bullets
- Use exact dollar amounts when present
- If data is missing, say what is missing instead of inventing facts`;

    try {
      const response = await fetch(`${GEMMA_ENDPOINT}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GEMMA_MODEL,
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
          options: {
            temperature: 0.3,
          },
        }),
      });

      if (!response.ok) throw new Error(`Local runtime ${response.status}`);

      const payload = await response.json();
      const answer = String(payload.message?.content || '').trim() || buildFallbackAnswer(message, context);
      onChunk?.(answer);
      return answer;
    } catch {
      const fallback = `${buildFallbackAnswer(message, context)}\n\nLocal Gemma 2 is not running yet. Start Ollama with a Gemma 2 model to replace this fallback with on-device LLM responses.`;
      onChunk?.(fallback);
      return fallback;
    }
  },
};
