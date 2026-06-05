// KeepThinking v7.7.0 — Bug Pattern Engine
// "同一个错误不犯两次 — Never debug the same bug twice."
// Bug模式库：常见Bug模式的向量化定义 + 识别 + 修复建议
// Integrated with engine.js semanticSearch() for automatic bug diagnosis during search.

"use strict";

// ══════════════════════════════════════════════════════════════
//  BUG PATTERNS — Vectorized bug pattern definitions
// ══════════════════════════════════════════════════════════════

const BUG_PATTERNS = {
  'null-pointer': {
    keywords: ['null', 'undefined', 'cannot read property', 'NullPointer', '空指针', 'null reference', 'TypeError', 'is null', 'is undefined', 'of null', 'of undefined', 'reading', 'null reference exception'],
    tags: ['bug-critical', 'null-safety'],
    fixTemplate: '检查变量是否存在，添加空值保护或使用可选链 (?.) / 空值合并 (??)',
    priority: 'critical',
    examples: [
      'Cannot read property user of undefined',
      'TypeError: null is not an object',
      'Uncaught TypeError: Cannot read properties of null',
    ],
  },
  'state-not-updated': {
    keywords: ['state', '未更新', '不刷新', '不生效', 'mounted', 'setState', 'not re-rendering', '没有重新渲染', '状态没变', '界面不刷新', 'useState', 'useEffect', 'did not update', 'stale state', 'stale closure', '闭包', '旧状态', '旧值'],
    tags: ['bug-state', 'react-lifecycle'],
    fixTemplate: '确认状态更新时机：检查是否在 mounted 后调用、是否依赖过期闭包、是否使用了函数式更新 setState(prev => ...)',
    priority: 'high',
    examples: [
      'setState之后页面没有重新渲染',
      'useState更新了但UI没变化',
      'useEffect里拿到的state是旧值',
    ],
  },
  'api-error': {
    keywords: ['404', '500', '502', '503', '403', '401', 'timeout', 'CORS', 'fetch failed', 'request failed', 'Network Error', 'network error', 'ERR_CONNECTION', 'ECONNREFUSED', '请求失败', '接口报错', '连接超时', '跨域', 'status code', 'HTTP'],
    tags: ['bug-api', 'network'],
    fixTemplate: '检查 API 端点、请求头、参数格式；添加错误处理 retry/fallback；检查 CORS 配置',
    priority: 'high',
    examples: [
      'fetch返回404错误',
      'POST请求返回500 Internal Server Error',
      'API请求 CORS blocked',
    ],
  },
  'dependency-conflict': {
    keywords: ['version', 'incompatible', 'peer dependency', 'node-gyp', 'native module', '编译失败', 'build failed', 'ERESOLVE', 'UNMET', 'missing peer', 'dep conflict', '依赖冲突', '版本不兼容', 'node_modules', 'npm ERR', 'yarn error', 'pnpm err'],
    tags: ['bug-deps', 'build'],
    fixTemplate: '检查 package.json 版本约束，尝试 npm ls 排查冲突，必要时锁定版本或使用 --legacy-peer-deps',
    priority: 'high',
    examples: [
      'npm install报ERESOLVE unable to resolve dependency tree',
      'peer dependency version mismatch',
      'node-gyp rebuild failed',
    ],
  },
  'async-race': {
    keywords: ['race condition', '竞态', '时序', '先执行', '后执行', 'async', 'await missing', '竞态条件', '异步顺序', '顺序错误', '先删后改', '并发', '同时', 'promise', 'Promise.all', 'then chain'],
    tags: ['bug-async', 'concurrency'],
    fixTemplate: '添加锁/队列/取消令牌(AbortController)，确保异步操作顺序正确，使用 async/await 替代裸 Promise',
    priority: 'high',
    examples: [
      '先执行了删除再执行更新',
      '两个async函数同时操作同一资源导致数据错乱',
      'promise.then执行顺序不对',
    ],
  },
  'config-missing': {
    keywords: ['环境变量', 'env', 'config', '未配置', 'token', 'key', 'secret', '.env', 'ENV', 'API_KEY', 'DATABASE_URL', '未设置', 'undefined key', 'missing config', '配置缺失', '没有配置'],
    tags: ['bug-config', 'deployment'],
    fixTemplate: '检查 .env 文件是否存在、环境变量是否正确设置、配置键名是否拼写正确',
    priority: 'medium',
    examples: [
      '环境变量没有配token',
      'API_KEY is not defined',
      '.env文件缺少DATABASE_URL配置',
    ],
  },
};

// ══════════════════════════════════════════════════════════════
//  classifyBug(description) — identify bug type from description
// ══════════════════════════════════════════════════════════════

function classifyBug(description) {
  if (!description || typeof description !== 'string' || description.length < 2) {
    return [];
  }

  const text = description.toLowerCase();
  const matches = [];

  for (const [bugType, pattern] of Object.entries(BUG_PATTERNS)) {
    let hitCount = 0;
    let weightedScore = 0;

    for (const kw of pattern.keywords) {
      const kwLower = kw.toLowerCase();
      // Count occurrences and weight by keyword length (longer = more specific)
      let idx = 0;
      while ((idx = text.indexOf(kwLower, idx)) !== -1) {
        hitCount++;
        weightedScore += Math.min(kwLower.length / 5, 3); // Cap per-keyword contribution
        idx += kwLower.length;
      }
    }

    if (hitCount > 0) {
      // Calculate confidence: base on hit count, weighted score, and keyword count
      const totalKeywords = pattern.keywords.length;
      const density = hitCount / Math.max(1, text.split(/\s+/).length / 10);
      let confidence = Math.min(
        1.0,
        (hitCount / Math.max(1, totalKeywords * 0.3)) * 0.6 + // Hit ratio
        (weightedScore / Math.max(1, totalKeywords * 0.5)) * 0.3 + // Weighted score
        Math.min(density, 1) * 0.1 // Density bonus
      );

      matches.push({
        type: bugType,
        confidence: Math.round(confidence * 100) / 100,
        hitCount,
        tags: pattern.tags,
        fixTemplate: pattern.fixTemplate,
        priority: pattern.priority,
      });
    }
  }

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches;
}

// ══════════════════════════════════════════════════════════════
//  searchBugPatterns(query) — search for bug patterns by query
// ══════════════════════════════════════════════════════════════

function searchBugPatterns(query) {
  if (!query || typeof query !== 'string' || query.length < 2) {
    return [];
  }

  const text = query.toLowerCase();
  const results = [];

  for (const [bugType, pattern] of Object.entries(BUG_PATTERNS)) {
    let score = 0;

    // Check keywords
    for (const kw of pattern.keywords) {
      if (text.includes(kw.toLowerCase())) {
        score += 2;
      }
    }

    // Check tags
    for (const tag of pattern.tags) {
      if (text.includes(tag.toLowerCase())) {
        score += 1.5;
      }
    }

    // Check type name
    if (text.includes(bugType.toLowerCase())) {
      score += 3;
    }

    if (score > 0) {
      results.push({
        type: bugType,
        score,
        tags: pattern.tags,
        fixTemplate: pattern.fixTemplate,
        priority: pattern.priority,
        keywords: pattern.keywords.slice(0, 5),
        examples: pattern.examples,
      });
    }
  }

  // Also match by partial keyword overlap for broader coverage
  if (results.length === 0) {
    // Fallback: loose matching — check each word of query against keywords
    const words = text.split(/\s+/).filter(w => w.length > 2);
    for (const [bugType, pattern] of Object.entries(BUG_PATTERNS)) {
      let looseScore = 0;
      for (const word of words) {
        for (const kw of pattern.keywords) {
          if (kw.toLowerCase().includes(word) || word.includes(kw.toLowerCase())) {
            looseScore += 1;
          }
        }
      }
      if (looseScore > 0) {
        results.push({
          type: bugType,
          score: looseScore * 0.5,
          tags: pattern.tags,
          fixTemplate: pattern.fixTemplate,
          priority: pattern.priority,
          keywords: pattern.keywords.slice(0, 5),
          examples: pattern.examples,
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

// ══════════════════════════════════════════════════════════════
//  getFixTemplate(bugType) — get fix template for a bug type
// ══════════════════════════════════════════════════════════════

function getFixTemplate(bugType) {
  const pattern = BUG_PATTERNS[bugType];
  if (!pattern) return null;

  return {
    type: bugType,
    fixTemplate: pattern.fixTemplate,
    priority: pattern.priority,
    tags: pattern.tags,
    examples: pattern.examples,
  };
}

// ══════════════════════════════════════════════════════════════
//  suggestFix(description) — one-stop: classify + fix suggestion
// ══════════════════════════════════════════════════════════════

function suggestFix(description) {
  const matches = classifyBug(description);

  if (matches.length === 0) {
    return {
      query: description,
      matches: [],
      suggestion: '未匹配到已知 Bug 模式。建议手动排查或提交新的 Bug 模式。',
      timestamp: new Date().toISOString(),
    };
  }

  const topMatch = matches[0];

  return {
    query: description,
    matches,
    topMatch: {
      type: topMatch.type,
      confidence: topMatch.confidence,
      priority: topMatch.priority,
      fixTemplate: topMatch.fixTemplate,
    },
    suggestion: `匹配到 ${matches.length} 个 Bug 模式。最可能: [${topMatch.type}] (置信度 ${Math.round(topMatch.confidence * 100)}%)。\n修复建议: ${topMatch.fixTemplate}`,
    timestamp: new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════
//  listBugPatterns() — list all known bug patterns
// ══════════════════════════════════════════════════════════════

function listBugPatterns() {
  return Object.entries(BUG_PATTERNS).map(([type, pattern]) => ({
    type,
    tags: pattern.tags,
    priority: pattern.priority,
    fixTemplate: pattern.fixTemplate,
    keywordCount: pattern.keywords.length,
    exampleCount: pattern.examples.length,
  }));
}

// ══════════════════════════════════════════════════════════════
//  MODULE EXPORTS
// ══════════════════════════════════════════════════════════════

module.exports = {
  BUG_PATTERNS,
  classifyBug,
  searchBugPatterns,
  getFixTemplate,
  suggestFix,
  listBugPatterns,
};
