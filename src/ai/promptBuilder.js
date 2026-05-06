function formatCurrency(amount) {
  return `$${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
  return safeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s&/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(text) {
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'about', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for', 'from', 'have', 'how',
    'i', 'in', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'please', 'show', 'tell', 'that', 'the', 'this',
    'to', 'was', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'would', 'you', 'your',
  ]);

  return Array.from(new Set(
    normalizeText(text)
      .split(' ')
      .filter((word) => word.length > 2 && !stopWords.has(word))
  ));
}

function formatHistory(conversationHistory = []) {
  return conversationHistory
    .filter((message) => message?.role && message?.text)
    .slice(-4)
    .map((message) => `${message.role.toUpperCase()}: ${safeText(message.text)}`)
    .join('\n');
}

function scoreTextMatch(text, keywords) {
  if (!keywords.length) return 0;
  const haystack = normalizeText(text);
  return keywords.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0);
}

function selectRelevantTransactions(userPrompt, transactions = []) {
  const keywords = extractKeywords(userPrompt);
  const ranked = [...(transactions || [])]
    .map((transaction) => ({
      transaction,
      score: scoreTextMatch(
        `${transaction.merchant} ${transaction.category} ${transaction.note} ${transaction.date}`,
        keywords
      ),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(right.transaction.date || '').localeCompare(String(left.transaction.date || ''));
    });

  const matching = ranked.filter((entry) => entry.score > 0).slice(0, 4).map((entry) => entry.transaction);
  if (matching.length) return matching;

  return [...(transactions || [])]
    .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')))
    .slice(0, 2);
}

function selectRelevantBudgets(userPrompt, budgets = []) {
  const keywords = extractKeywords(userPrompt);
  const ranked = [...(budgets || [])]
    .map((budget) => ({
      budget,
      score: scoreTextMatch(`${budget.category} ${budget.description}`, keywords) + Number(budget.progress || 0),
    }))
    .sort((left, right) => right.score - left.score);

  return ranked.slice(0, 2).map((entry) => entry.budget);
}

function selectRelevantCategories(userPrompt, spendByCategory = {}) {
  const keywords = extractKeywords(userPrompt);
  const ranked = Object.entries(spendByCategory || {})
    .map(([category, amount]) => ({
      category,
      amount,
      score: scoreTextMatch(category, keywords) + (Number(amount || 0) / 1000),
    }))
    .sort((left, right) => right.score - left.score || Number(right.amount || 0) - Number(left.amount || 0));

  return ranked.slice(0, 3);
}

function formatTransactions(transactions = []) {
  if (!transactions.length) return '';
  return transactions
    .map((transaction) => `${transaction.date} | ${transaction.merchant || 'Unknown'} | ${transaction.category} | ${Number(transaction.amount) < 0 ? '-' : '+'}${formatCurrency(Math.abs(Number(transaction.amount || 0)))}`)
    .join('\n');
}

function formatBudgets(budgets = []) {
  if (!budgets.length) return '';
  return budgets
    .map((budget) => `${budget.category}: ${formatCurrency(budget.spent)} of ${formatCurrency(budget.limit)} (${Math.round(Number(budget.progress || 0) * 100)}%)`)
    .join('\n');
}

function formatCategories(entries = []) {
  if (!entries.length) return '';
  return entries
    .map((entry) => `${entry.category}: ${formatCurrency(entry.amount)}`)
    .join('\n');
}

function needsPersonalContext(userPrompt, fullContext = {}) {
  const lower = normalizeText(userPrompt);
  if (!fullContext || !Object.keys(fullContext).length) return false;

  return /\b(my|me|mine|spend|spent|budget|budgets|transaction|transactions|merchant|category|categories|subscription|subscriptions|forecast|anomaly|income|cash flow|recent|latest|last)\b/.test(lower);
}

export function buildAssistantPrompt({ userPrompt, fullContext = {}, conversationHistory = [] }) {
  const compactUserPrompt = safeText(userPrompt);
  const systemPrompt = [
    'You are FinSight, a fast on-device financial assistant.',
    'Answer in 1 to 3 short sentences.',
    'Prefer direct answers over explanation.',
    'Use local data only when it helps answer the question.',
    'If local data is insufficient, say so plainly.',
  ].join(' ');

  const includeContext = needsPersonalContext(compactUserPrompt, fullContext);
  const relevantTransactions = includeContext ? selectRelevantTransactions(compactUserPrompt, fullContext.transactions) : [];
  const relevantBudgets = includeContext ? selectRelevantBudgets(compactUserPrompt, fullContext.budgets) : [];
  const relevantCategories = includeContext ? selectRelevantCategories(compactUserPrompt, fullContext.spendByCategory) : [];

  const contextParts = [];
  if (includeContext && fullContext.summary) {
    contextParts.push(`Summary: ${safeText(fullContext.summary)}`);
  }
  if (relevantCategories.length) {
    contextParts.push(`Relevant category totals:\n${formatCategories(relevantCategories)}`);
  }
  if (relevantBudgets.length) {
    contextParts.push(`Relevant budgets:\n${formatBudgets(relevantBudgets)}`);
  }
  if (relevantTransactions.length) {
    contextParts.push(`Relevant transactions:\n${formatTransactions(relevantTransactions)}`);
  }

  const historyBlock = formatHistory(conversationHistory);
  const contextBlock = contextParts.join('\n\n');

  return {
    systemPrompt,
    contextBlock,
    historyBlock,
    userPrompt: compactUserPrompt,
    fullPrompt: [
      systemPrompt,
      contextBlock ? `LOCAL DATA\n${contextBlock}` : null,
      historyBlock ? `RECENT CHAT\n${historyBlock}` : null,
      `USER QUESTION\n${compactUserPrompt}`,
      'Answer briefly.',
    ].filter(Boolean).join('\n\n'),
  };
}
