import { AIStorage } from './storage';
import { buildAssistantPrompt } from './promptBuilder';
import { LocalLLMBridge } from '../platform/localLLM';

const runtimeState = globalThis.__finsightAiRuntime || (globalThis.__finsightAiRuntime = {
  loaded: false,
  metadata: null,
  packageData: null,
});

function sanitizeAssistantText(value) {
  let text = String(value || '');
  if (!text) return '';

  text = text.replace(/\r\n/g, '\n');

  const responseMatch = text.match(/###\s*Response\s*([\s\S]*?)(?:###\s*Instruction\b|$)/i);
  const altResponseMatch = text.match(/==\s*Response\s*==\s*([\s\S]*?)(?:If local Data is insufficient:|###\s*Instruction\b|$)/i);
  if (responseMatch?.[1]) {
    text = responseMatch[1];
  } else if (altResponseMatch?.[1]) {
    text = altResponseMatch[1];
  } else {
    text = text.replace(/###\s*Instruction[\s\S]*$/i, '');
    text = text.replace(/^###\s*Response\s*/i, '');
    text = text.replace(/^==\s*Response\s*==\s*/i, '');
    text = text.replace(/\n*\(Note:[\s\S]*$/i, '');
    text = text.replace(/\n*If local Data is insufficient:[\s\S]*$/i, '');
  }

  text = text
    .replace(/^\s+|\s+$/g, '')
    .replace(/^(Response|Instruction)\s*:?\s*/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s&/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCurrency(amount) {
  const numericAmount = Number(amount || 0);
  return `$${numericAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function sortCategoryEntries(spendByCategory) {
  return Object.entries(spendByCategory || {}).sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0));
}

function sortTransactionsByDate(transactions) {
  return [...(transactions || [])].sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));
}

function getTransactionsInCurrentMonth(transactions) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  return (transactions || []).filter((transaction) => String(transaction.date || '').startsWith(currentMonth));
}

function titleCase(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function extractKeywords(prompt) {
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'about', 'any', 'as', 'at', 'be', 'by', 'can', 'did', 'do', 'does', 'for', 'from',
    'get', 'give', 'had', 'has', 'have', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'last', 'latest',
    'me', 'month', 'my', 'of', 'on', 'or', 'our', 'please', 'recent', 'show', 'spent', 'tell', 'that', 'the',
    'this', 'to', 'up', 'use', 'was', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'would', 'you',
    'your',
  ]);

  return Array.from(new Set(
    normalizeText(prompt)
      .split(' ')
      .filter((word) => word.length > 2 && !stopWords.has(word))
  ));
}

function resolvePromptWithHistory(userPrompt, conversationHistory = []) {
  const lower = normalizeText(userPrompt);
  const priorUserMessages = [...(conversationHistory || [])]
    .filter((message) => message?.role === 'user' && normalizeText(message.text) !== lower)
    .map((message) => message.text)
    .filter(Boolean);
  const previousUserText = priorUserMessages[priorUserMessages.length - 1];

  if (!previousUserText) {
    return userPrompt;
  }

  if (/\b(that|it|those|them|there|same one|same category)\b/.test(lower) || /^(what about|how about|and|also)\b/.test(lower)) {
    return `${userPrompt} Context from the previous user question: ${previousUserText}`;
  }

  return userPrompt;
}

function buildGeneralAnswer(prompt) {
  const lower = normalizeText(prompt);

  if (!lower) {
    return 'Ask about spending, budgets, transactions, subscriptions, or imports. I can also answer simple finance questions that do not need your local data.';
  }

  if (/\b(hi|hello|hey)\b/.test(lower)) {
    return 'Hi. I can answer from your on-device FinSight data or handle simple finance questions when your personal data is not needed.';
  }

  if (/\b(who are you|what can you do|help)\b/.test(lower)) {
    return 'I can summarize spending, inspect transactions, check budgets, review subscriptions or anomalies, and answer basic finance questions directly on this device.';
  }

  if (/\b(private|privacy|local|offline|on device)\b/.test(lower)) {
    return 'Your assistant runs against FinSight data stored on this device. It can also answer simple general questions without using your personal records.';
  }

  if (/\b(what is a budget|define budget|budget mean)\b/.test(lower)) {
    return 'A budget is a spending limit for a category or time period that helps you compare planned spending against what you actually spent.';
  }

  if (/\b(what is cash flow|define cash flow)\b/.test(lower)) {
    return 'Cash flow is the money coming in minus the money going out over a period of time.';
  }

  return '';
}

function findCategoryMatch(prompt, context) {
  const lower = normalizeText(prompt);
  const categories = context.categories || [];
  const spendEntries = sortCategoryEntries(context.spendByCategory);
  const spendNames = spendEntries.map(([name]) => name);

  const candidates = [
    ...categories.map((category) => category.name),
    ...spendNames,
  ].filter(Boolean);

  return candidates.find((candidate) => {
    const normalized = normalizeText(candidate);
    return normalized && (lower.includes(normalized) || normalized.includes(lower));
  }) || null;
}

function findMerchantMatch(prompt, context) {
  const lower = normalizeText(prompt);
  const merchants = Array.from(new Set((context.transactions || []).map((transaction) => transaction.merchant).filter(Boolean)));

  return merchants.find((merchant) => {
    const normalized = normalizeText(merchant);
    return normalized && lower.includes(normalized);
  }) || null;
}

function answerBudgetQuestion(context, prompt) {
  if (!context.budgets?.length) {
    return 'You do not have active budgets yet. Add one for a major spending category and I can track progress against it.';
  }

  const lower = normalizeText(prompt);
  const categoryMatch = findCategoryMatch(prompt, context);
  const targetBudgets = categoryMatch
    ? context.budgets.filter((budget) => normalizeText(budget.category) === normalizeText(categoryMatch))
    : context.budgets;

  if (!targetBudgets.length && categoryMatch) {
    return `I found spending data for ${categoryMatch}, but there is no budget set for it yet.`;
  }

  const overBudget = [...targetBudgets]
    .filter((budget) => Number(budget.limit || 0) > 0)
    .sort((left, right) => Number(right.progress || 0) - Number(left.progress || 0));

  if (categoryMatch && overBudget.length) {
    const budget = overBudget[0];
    return `${budget.category} is at ${formatPercent(budget.progress)} of budget, with ${formatCurrency(budget.spent)} spent out of ${formatCurrency(budget.limit)}.`;
  }

  if (/\b(which|what).*(attention|risk|closest|worst)\b/.test(lower) || /\b(over|close)\b/.test(lower)) {
    const riskiestBudget = overBudget[0];
    if (!riskiestBudget) {
      return 'Your budgets are loaded, but none have a valid limit to compare against yet.';
    }

    if (Number(riskiestBudget.progress || 0) < 0.9) {
      return `${riskiestBudget.category} is your closest budget at ${formatPercent(riskiestBudget.progress)}, and none of your budgets are currently in the danger zone.`;
    }

    return `${riskiestBudget.category} needs the most attention at ${formatPercent(riskiestBudget.progress)} of budget (${formatCurrency(riskiestBudget.spent)} of ${formatCurrency(riskiestBudget.limit)}).`;
  }

  return overBudget
    .slice(0, 3)
    .map((budget) => `${budget.category}: ${formatCurrency(budget.spent)} of ${formatCurrency(budget.limit)} used (${formatPercent(budget.progress)}).`)
    .join(' ');
}

function answerCategorySpendQuestion(context, prompt) {
  const categoryMatch = findCategoryMatch(prompt, context);
  if (!categoryMatch) {
    return '';
  }

  const amount = Number((context.spendByCategory || {})[categoryMatch] || 0);
  if (!amount) {
    return `I do not see spending for ${categoryMatch} in the current month yet.`;
  }

  const matchingTransactions = getTransactionsInCurrentMonth(context.transactions).filter(
    (transaction) => normalizeText(transaction.category) === normalizeText(categoryMatch) && Number(transaction.amount) < 0
  );
  const merchantHint = matchingTransactions[0]?.merchant;

  return merchantHint
    ? `${categoryMatch} spending is ${formatCurrency(amount)} this month. A recent transaction in that category was ${merchantHint}.`
    : `${categoryMatch} spending is ${formatCurrency(amount)} this month.`;
}

function answerMerchantQuestion(context, prompt) {
  const merchantMatch = findMerchantMatch(prompt, context);
  if (!merchantMatch) {
    return '';
  }

  const matches = sortTransactionsByDate(context.transactions).filter(
    (transaction) => normalizeText(transaction.merchant) === normalizeText(merchantMatch)
  );

  if (!matches.length) {
    return '';
  }

  const total = matches.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const latest = matches[0];
  return `${titleCase(merchantMatch)} appears ${pluralize(matches.length, 'time')} in your local history for ${formatCurrency(total)} total. The most recent was ${formatCurrency(Math.abs(Number(latest.amount || 0)))} on ${latest.date}.`;
}

function answerExactTransactionQuestion(context, prompt) {
  const lower = normalizeText(prompt);
  const merchantMatch = findMerchantMatch(prompt, context);
  if (!merchantMatch) {
    return '';
  }

  const merchantTransactions = sortTransactionsByDate(context.transactions).filter(
    (transaction) =>
      normalizeText(transaction.merchant) === normalizeText(merchantMatch) &&
      Number(transaction.amount || 0) < 0
  );

  if (!merchantTransactions.length) {
    return '';
  }

  const latest = merchantTransactions[0];
  if (/\b(how much|amount|what did i spend|what was)\b/.test(lower) && /\b(last|latest|most recent)\b/.test(lower)) {
    return formatCurrency(Math.abs(Number(latest.amount || 0)));
  }

  if (/\bwhen\b/.test(lower) && /\b(last|latest|most recent)\b/.test(lower)) {
    return String(latest.date || '');
  }

  return '';
}

function answerRecentTransactionsQuestion(context) {
  const recent = sortTransactionsByDate(context.transactions).slice(0, 3);
  if (!recent.length) {
    return 'There are no saved transactions on this device yet.';
  }

  return recent
    .map((transaction) => `${transaction.date}: ${transaction.merchant || 'Unknown merchant'} ${Number(transaction.amount) < 0 ? 'spent' : 'received'} ${formatCurrency(Math.abs(Number(transaction.amount || 0)))} in ${transaction.category}.`)
    .join(' ');
}

function answerSummaryQuestion(context) {
  const topCategory = sortCategoryEntries(context.spendByCategory)[0];
  const summary = context.summary || 'Your local finance summary is ready.';
  return topCategory
    ? `${summary} Your highest spend category this month is ${topCategory[0]} at ${formatCurrency(topCategory[1])}.`
    : summary;
}

function answerSavingsQuestion(context) {
  const topCategory = sortCategoryEntries(context.spendByCategory)[0];
  if (!topCategory) {
    return 'Import a few transactions first and I can point out your biggest savings opportunity.';
  }

  return `${topCategory[0]} is your largest spending area at ${formatCurrency(topCategory[1])}. Reducing that category by 10% would save about ${formatCurrency(Number(topCategory[1]) * 0.1)} this month.`;
}

function answerImportQuestion(context) {
  const uncategorized = (context.transactions || []).filter((transaction) => transaction.categoryId === 'cat_other');
  const sourceCounts = (context.transactions || []).reduce((counts, transaction) => {
    const key = transaction.source || 'manual';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

  const parts = [];
  if (sourceCounts.csv) parts.push(`${sourceCounts.csv} CSV import ${sourceCounts.csv === 1 ? 'row is' : 'rows are'} saved`);
  if (sourceCounts['ocr-image'] || sourceCounts['ocr-camera']) {
    const ocrCount = Number(sourceCounts['ocr-image'] || 0) + Number(sourceCounts['ocr-camera'] || 0);
    parts.push(`${ocrCount} OCR-derived ${ocrCount === 1 ? 'transaction is' : 'transactions are'} saved`);
  }

  if (!parts.length) {
    parts.push('your imported transaction history is available locally');
  }

  const uncategorizedText = uncategorized.length
    ? `${uncategorized.length} imported ${uncategorized.length === 1 ? 'item is' : 'items are'} still in Other and worth reviewing.`
    : 'I do not see uncategorized imported items right now.';

  return `${parts.join(', ')}. ${uncategorizedText}`;
}

function answerSubscriptionQuestion(context) {
  if (!context.subscriptions?.length) {
    return 'No recurring subscriptions are currently detected in your local data.';
  }

  return context.subscriptions
    .slice(0, 3)
    .map((subscription) => `${titleCase(subscription.merchant || 'Subscription')} appears ${subscription.frequency} at ${formatCurrency(Math.abs(subscription.amount))}.`)
    .join(' ');
}

function answerAnomalyQuestion(context) {
  if (!context.anomalies?.length) {
    return 'I do not see any anomaly flags in your local data right now.';
  }

  return context.anomalies
    .slice(0, 3)
    .map((anomaly) => anomaly.description)
    .join(' ');
}

function answerForecastQuestion(context, prompt) {
  const categoryMatch = findCategoryMatch(prompt, context);
  const forecasts = context.forecasts || [];
  const target = categoryMatch
    ? forecasts.find((forecast) => normalizeText(forecast.category) === normalizeText(categoryMatch))
    : forecasts[0];

  if (!target) {
    return 'I do not have enough history yet to forecast that category.';
  }

  return `${target.category} is forecast at ${formatCurrency(target.predicted)} next month with about ${Math.round(Number(target.confidence || 0) * 100)}% confidence.`;
}

function findRelevantTransactions(prompt, context) {
  const keywords = extractKeywords(prompt);
  if (!keywords.length) {
    return [];
  }

  return sortTransactionsByDate(context.transactions)
    .map((transaction) => {
      const haystack = normalizeText(`${transaction.merchant} ${transaction.note} ${transaction.category} ${transaction.date}`);
      const score = keywords.reduce((total, keyword) => total + (haystack.includes(keyword) ? 1 : 0), 0);
      return { transaction, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || String(right.transaction.date || '').localeCompare(String(left.transaction.date || '')))
    .slice(0, 3)
    .map((entry) => entry.transaction);
}

function answerRelevantTransactions(prompt, context) {
  const matches = findRelevantTransactions(prompt, context);
  if (!matches.length) {
    return '';
  }

  if (matches.length === 1) {
    const transaction = matches[0];
    return `The closest local match I found is ${transaction.merchant || 'an uncategorized transaction'} on ${transaction.date} for ${formatCurrency(Math.abs(Number(transaction.amount || 0)))} in ${transaction.category}.`;
  }

  return `The closest matches in your local data are ${matches.map((transaction) => `${transaction.merchant || 'Unknown merchant'} on ${transaction.date} for ${formatCurrency(Math.abs(Number(transaction.amount || 0)))}`).join('; ')}.`;
}

function createOfflineAssistantResponse(userPrompt, context, conversationHistory = []) {
  const resolvedPrompt = resolvePromptWithHistory(userPrompt, conversationHistory);
  const lower = normalizeText(resolvedPrompt);
  const generalAnswer = buildGeneralAnswer(resolvedPrompt);
  if (generalAnswer && (!context.transactions?.length || /\b(hi|hello|hey|what can you do|help|privacy|local|offline|what is|define)\b/.test(lower))) {
    return generalAnswer;
  }

  if (!lower) {
    return generalAnswer || answerSummaryQuestion(context);
  }

  if (/\b(recent|latest|last few|last transactions)\b/.test(lower) && /\b(transaction|purchase|charge|expense|spent)\b/.test(lower)) {
    return answerRecentTransactionsQuestion(context);
  }

  const merchantAnswer = answerMerchantQuestion(context, resolvedPrompt);
  if (merchantAnswer) {
    return merchantAnswer;
  }

  if (/\b(budget|limit|overspend|over budget)\b/.test(lower)) {
    return answerBudgetQuestion(context, resolvedPrompt);
  }

  if (/\b(import|ocr|scan|categori[sz]e|title|receipt)\b/.test(lower)) {
    return answerImportQuestion(context);
  }

  if (/\b(subscription|recurring|monthly charge)\b/.test(lower)) {
    return answerSubscriptionQuestion(context);
  }

  if (/\b(anomal(y|ies)|unusual|suspicious|weird)\b/.test(lower)) {
    return answerAnomalyQuestion(context);
  }

  if (/\b(forecast|predict|next month)\b/.test(lower)) {
    return answerForecastQuestion(context, resolvedPrompt);
  }

  if (/\b(save|saving|cut back|reduce)\b/.test(lower)) {
    return answerSavingsQuestion(context);
  }

  const categoryAnswer = answerCategorySpendQuestion(context, resolvedPrompt);
  if (categoryAnswer) {
    return categoryAnswer;
  }

  const relevantTransactionAnswer = answerRelevantTransactions(resolvedPrompt, context);
  if (relevantTransactionAnswer) {
    return relevantTransactionAnswer;
  }

  if (/\b(summary|overview|spend|spent|income|cash flow)\b/.test(lower)) {
    return answerSummaryQuestion(context);
  }

  if (generalAnswer) {
    return generalAnswer;
  }

  return `I couldn't map that cleanly to your local data yet. Try naming a merchant, category, budget, import, or time range, and I’ll answer from what is stored on this device.`;
}

function toTitleCase(value, aliasMap = {}) {
  return String(value || '')
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const normalized = normalizeText(word);
      if (aliasMap[normalized]) return aliasMap[normalized];
      if (/^\d+$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function cleanMerchantCandidate(candidate, packageData) {
  const noiseWords = new Set(packageData?.ocr?.noiseWords || []);
  const aliasMap = packageData?.ocr?.aliasMap || {};
  const cleaned = String(candidate || '')
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/[-+]?[$]?\(?\d[\d,]*\.\d{2}\)?/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/[#*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const filtered = cleaned
    .split(' ')
    .filter((word) => {
      const normalized = normalizeText(word);
      return normalized && !noiseWords.has(normalized);
    })
    .join(' ')
    .trim();

  if (!filtered) {
    return '';
  }

  return toTitleCase(filtered, aliasMap).slice(0, 48).trim();
}

export const AIRuntime = {
  async getBackendStatus() {
    return LocalLLMBridge.getBackendStatus();
  },

  async isAvailable() {
    const metadata = await AIStorage.readCurrentMetadata();
    if (!metadata) return false;

    const backendStatus = await LocalLLMBridge.getBackendStatus();
    return !!backendStatus.configured || !!metadata;
  },

  async loadModel() {
    const metadata = await AIStorage.readCurrentMetadata();
    if (!metadata) {
      throw new Error('No local AI model is installed.');
    }

    const packageData = await AIStorage.readCurrentPackage(metadata);
    if (!packageData) {
      throw new Error('Installed local AI package could not be loaded.');
    }

    if (
      runtimeState.loaded &&
      runtimeState.metadata?.id === metadata.id &&
      runtimeState.metadata?.version === metadata.version &&
      runtimeState.packageData
    ) {
      return {
        loaded: true,
        metadata: runtimeState.metadata,
        packageData: runtimeState.packageData,
        backendStatus: await LocalLLMBridge.getBackendStatus(),
      };
    }

    const windowsProvider = packageData?.providers?.windows || {};
    const backendStatus = await LocalLLMBridge.loadModel({
      modelDirectory: windowsProvider.modelDirectory || null,
      runtime: metadata.runtime,
      modelId: metadata.id,
    });
    if (!backendStatus?.loaded) {
      throw new Error(backendStatus?.reason || 'The Windows local AI model did not finish loading.');
    }

    runtimeState.loaded = true;
    runtimeState.metadata = metadata;
    runtimeState.packageData = packageData;
    return { loaded: true, metadata, packageData, backendStatus };
  },

  async unloadModel() {
    await LocalLLMBridge.unloadModel();
    runtimeState.loaded = false;
    runtimeState.metadata = null;
    runtimeState.packageData = null;
  },

  async cancelGeneration() {
    return LocalLLMBridge.cancelGeneration();
  },

  async getLoadedModel() {
    return runtimeState.loaded
      ? { metadata: runtimeState.metadata, packageData: runtimeState.packageData }
      : null;
  },

  async generate({ userPrompt, fullContext, conversationHistory }) {
    if (!runtimeState.loaded || !runtimeState.metadata || !runtimeState.packageData) {
      throw new Error('Local AI model is not loaded.');
    }

    const directAnswer = answerExactTransactionQuestion(fullContext || {}, userPrompt);
    if (directAnswer) {
      return {
        text: directAnswer,
        backend: 'deterministic-local',
      };
    }

    const promptPayload = buildAssistantPrompt({
      userPrompt,
      fullContext: fullContext || {},
      conversationHistory: conversationHistory || [],
    });
    const generated = await LocalLLMBridge.generate({
      ...promptPayload,
      model: runtimeState.metadata,
      packageData: runtimeState.packageData,
    });

    if (generated?.text) {
      return {
        ...generated,
        text: sanitizeAssistantText(generated.text),
      };
    }

    if (generated?.reason) {
      return {
        text: createOfflineAssistantResponse(userPrompt, fullContext || {}, conversationHistory || []),
        backend: generated.backend || 'windows-native-onnx',
        reason: generated.reason,
      };
    }

    return {
      text: createOfflineAssistantResponse(userPrompt, fullContext || {}, conversationHistory || []),
      backend: 'heuristic-fallback',
    };
  },

  async suggestTransactionTitle({ merchant, note, ocrText }) {
    if (!runtimeState.loaded || !runtimeState.packageData) {
      throw new Error('Local AI model is not loaded.');
    }

    const candidates = [
      merchant,
      String(note || '').split('\n')[0],
      ...String(ocrText || '').split(/\r?\n/).slice(0, 4),
    ];

    for (const candidate of candidates) {
      const cleaned = cleanMerchantCandidate(candidate, runtimeState.packageData);
      if (cleaned) {
        return cleaned;
      }
    }

    return '';
  },
};
