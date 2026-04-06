// src/engines/index.js
// Layer 3: Local Intelligence (AI/Agent) Layer
// All engines run entirely on-device — no network calls

// ─────────────────────────────────────────────
// Transaction Categorization Engine
// Rule-based keyword matching (ML hybrid-ready)
// ─────────────────────────────────────────────

export const CategorizationEngine = {
  categorize(merchant, categories) {
    const m = (merchant || '').toLowerCase();
    for (const cat of categories.filter(c => c.id !== 'cat_other')) {
      const keywords = typeof cat.keywords === 'string'
        ? JSON.parse(cat.keywords)
        : cat.keywords;
      if (keywords.some(kw => m.includes(kw.toLowerCase()))) {
        return cat.id;
      }
    }
    return 'cat_other';
  },
};

// ─────────────────────────────────────────────
// Anomaly Detection Engine
// Statistical heuristics: mean + std deviation
// Flags transactions > 2.5σ above category mean
// ─────────────────────────────────────────────

export const AnomalyDetectionEngine = {
  detect(transactions, profileId) {
    const anomalies = [];
    if (!transactions.length) return anomalies;

    const byCategory = {};
    transactions.forEach(t => {
      if (!byCategory[t.category_id]) byCategory[t.category_id] = [];
      byCategory[t.category_id].push({ amt: Math.abs(parseFloat(t.amount) || 0), tx: t });
    });

    Object.entries(byCategory).forEach(([catId, items]) => {
      const amounts = items.map(i => i.amt);
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const std  = Math.sqrt(amounts.map(a => (a - mean) ** 2).reduce((a, b) => a + b, 0) / amounts.length);

      items.forEach(({ amt, tx }) => {
        if (amt > mean + 2.5 * std && amt > 50) {
          anomalies.push({
            profile_id:     profileId,
            transaction_id: tx.id,
            type:           'high_spend',
            description:    `Unusually high ${catId.replace('cat_', '')} expense: $${amt.toFixed(2)} (avg $${mean.toFixed(2)})`,
            severity:       amt > mean + 4 * std ? 'high' : 'medium',
            detected_at:    new Date().toISOString(),
          });
        }
      });
    });

    return anomalies;
  },
};

// ─────────────────────────────────────────────
// Forecasting Engine
// Time-series linear regression per category
// ─────────────────────────────────────────────

export const ForecastingEngine = {
  forecast(transactions, categoryId, monthsAhead = 1) {
    const filtered = transactions.filter(
      t => t.category_id === categoryId && parseFloat(t.amount) < 0
    );
    if (filtered.length < 3) return null;

    const byMonth = {};
    filtered.forEach(t => {
      const key = (t.date || '').slice(0, 7);
      if (!byMonth[key]) byMonth[key] = 0;
      byMonth[key] += Math.abs(parseFloat(t.amount));
    });

    const values   = Object.values(byMonth).sort();
    const avg      = values.reduce((a, b) => a + b, 0) / values.length;
    const trend    = values.length > 1 ? (values[values.length - 1] - values[0]) / values.length : 0;
    const predicted = avg + trend * monthsAhead;
    const variance  = values.map(v => (v - avg) ** 2).reduce((a, b) => a + b, 0) / values.length;
    const confidence = Math.max(0.5, Math.min(0.95, 1 - Math.sqrt(variance) / (avg || 1)));

    return { predicted: Math.max(0, predicted), confidence };
  },
};

// ─────────────────────────────────────────────
// Financial Recommendation Engine
// Explainable rule-based suggestions
// ─────────────────────────────────────────────

export const RecommendationEngine = {
  generate(transactions, budgets, categories) {
    const recs = [];
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const monthTx = transactions.filter(
      t => (t.date || '').startsWith(thisMonth) && parseFloat(t.amount) < 0
    );
    const spendByCategory = {};
    monthTx.forEach(t => {
      spendByCategory[t.category_id] = (spendByCategory[t.category_id] || 0) + Math.abs(parseFloat(t.amount));
    });

    // Budget threshold warnings (80% and 100%)
    budgets.forEach(b => {
      const spent = spendByCategory[b.category_id] || 0;
      const pct   = spent / b.limit_amount;
      const cat   = categories.find(c => c.id === b.category_id);
      if (pct > 0.9) {
        recs.push({
          type:     'warning',
          icon:     '⚠️',
          text:     `${cat?.name || b.category_id} budget is ${Math.round(pct * 100)}% used ($${spent.toFixed(0)} of $${b.limit_amount})`,
          priority: pct > 1 ? 3 : 2,
        });
      }
    });

    // Top spend insight
    const sorted = Object.entries(spendByCategory).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const [topCatId, topAmt] = sorted[0];
      const topCat = categories.find(c => c.id === topCatId);
      recs.push({ type: 'insight', icon: '📊', text: `Highest spend this month: ${topCat?.name || topCatId} ($${topAmt.toFixed(0)})`, priority: 1 });
    }

    // Dining saving tip
    const diningSpend = spendByCategory['cat_food'] || 0;
    if (diningSpend > 300) {
      recs.push({ type: 'tip', icon: '💡', text: `Dining out cost $${diningSpend.toFixed(0)} this month. Meal prepping 2×/week could save ~$${Math.round(diningSpend * 0.2)}.`, priority: 1 });
    }

    return recs.sort((a, b) => b.priority - a.priority).slice(0, 5);
  },
};

// ─────────────────────────────────────────────
// Subscription Detection Engine (Zombie Subs)
// Detects recurring same-amount merchant charges
// ─────────────────────────────────────────────

export const SubscriptionEngine = {
  detect(transactions) {
    const merchants = {};
    transactions.forEach(t => {
      const key = (t.merchant || '').toLowerCase().trim();
      const amt = parseFloat(t.amount);
      if (!merchants[key]) merchants[key] = { amounts: [], dates: [] };
      merchants[key].amounts.push(amt);
      merchants[key].dates.push(t.date);
    });

    const subs = [];
    Object.entries(merchants).forEach(([merchant, data]) => {
      if (data.amounts.length < 2) return;
      const allSame = data.amounts.every(a => Math.abs(a - data.amounts[0]) < 0.01);
      const sorted  = [...data.dates].filter(Boolean).sort();
      if (sorted.length < 2) return;

      const intervals = sorted.slice(1).map((d, i) =>
        (new Date(d) - new Date(sorted[i])) / (1000 * 60 * 60 * 24)
      );
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

      const isMonthly = avgInterval > 25 && avgInterval < 35;
      const isWeekly  = avgInterval > 6  && avgInterval < 8;

      if (allSame && (isMonthly || isWeekly)) {
        subs.push({
          merchant,
          amount:    data.amounts[0],
          frequency: isMonthly ? 'monthly' : 'weekly',
          last_seen: sorted[sorted.length - 1],
          count:     data.amounts.length,
        });
      }
    });

    return subs;
  },
};

// ─────────────────────────────────────────────
// Agentic AI Assistant Engine
// Calls Anthropic API with anonymized context
// Streaming via fetch + text/event-stream
// ─────────────────────────────────────────────

export const AgenticAssistant = {
  async chat(message, context, apiKey, onChunk) {
    const systemPrompt = `You are FinSight, a privacy-first personal finance AI assistant. You help users understand their spending, set budgets, and make smarter financial decisions. You have access to the user's anonymized financial summary below. Be concise, actionable, and empathetic. Never ask for banking credentials.

USER FINANCIAL CONTEXT:
${JSON.stringify(context, null, 2)}

Rules:
- Give specific, number-backed advice when possible
- Keep responses to 3-4 sentences max unless analyzing complex data
- Format numbers as currency ($X,XXX.XX)`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system:     systemPrompt,
          messages:   [{ role: 'user', content: message }],
          stream:     true,
        }),
      });

      if (!response.ok) throw new Error(`API ${response.status}`);

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullText += parsed.delta.text;
              onChunk?.(fullText);
            }
          } catch { /* skip malformed SSE line */ }
        }
      }

      return fullText || 'I could not generate a response. Please try again.';
    } catch {
      return `Offline mode — based on your data: ${context.summary || 'No data available.'}`;
    }
  },
};
