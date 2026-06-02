// KeepThinking Memory Discovery Engine v7.2.0
// Auto-discovers and imports existing AI memories without data loss
//
// Scans OpenClaw agent session JSONL files and imports key decisions,
// bug fixes, deployments, and architecture changes into the cognitive graph.

const fs = require('fs');
const path = require('path');

// ── 1. Discover OpenClaw agent sessions ──
function discoverOpenClawSessions(homeDir) {
  const sessionsDir = path.join(homeDir, '.openclaw', 'agents', 'main', 'sessions');
  if (!fs.existsSync(sessionsDir)) return [];
  
  const sessions = [];
  const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.jsonl')) continue;
    if (entry.name.includes('.trajectory.')) continue;
    if (entry.name === 'sessions.json') continue;
    
    const filePath = path.join(sessionsDir, entry.name);
    try {
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      const extractedText = extractMessageText(content);
      
      sessions.push({
        file: entry.name,
        path: filePath,
        size: content.length,
        mtime: stat.mtime.toISOString(),
        keywords: extractSessionKeywords(extractedText),
        lineCount: content.split('\n').filter(Boolean).length
      });
    } catch(_) {}
  }
  
  sessions.sort((a, b) => {
    const sa = a.keywords.length + Math.min(a.lineCount, 10);
    const sb = b.keywords.length + Math.min(b.lineCount, 10);
    return sb - sa;
  });
  
  return sessions;
}

// ── 2. Discover git projects under home ──
function discoverGitProjects(homeDir) {
  const projects = [];
  const scanDirs = [
    homeDir,
    path.join(homeDir, 'workspaces'),
    path.join(homeDir, 'projects')
  ];
  
  for (const dir of scanDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        const projPath = path.join(dir, entry.name);
        if (fs.existsSync(path.join(projPath, '.git'))) {
          projects.push({ name: entry.name, path: projPath });
        }
      }
    } catch(_) {}
  }
  
  const seen = new Set();
  return projects.filter(p => {
    if (seen.has(p.path)) return false;
    seen.add(p.path);
    return true;
  });
}

// ── 3. Extract readable text from JSONL session content ──
function extractMessageText(content) {
  const lines = content.split('\n').filter(Boolean);
  const texts = [];
  
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type !== 'message') continue;
      
      let msg = obj.message;
      if (typeof msg === 'string') {
        try { msg = JSON.parse(msg.replace(/'/g, '"')); } catch(_) {
          // Not valid JSON, use as-is but trim
          texts.push(msg.slice(0, 500));
          continue;
        }
      }
      
      const msgContent = msg.content;
      if (!msgContent) continue;
      
      if (Array.isArray(msgContent)) {
        for (const block of msgContent) {
          if (typeof block === 'string') {
            texts.push(block);
          } else if (block && typeof block === 'object' && block.type === 'text') {
            texts.push(block.text || '');
          }
        }
      } else if (typeof msgContent === 'string') {
        texts.push(msgContent);
      }
    } catch(_) {}
  }
  
  return texts.join('\n');
}

// ── 4. Extract keywords from text ──
function extractSessionKeywords(text) {
  const keywords = [];
  const lower = text.toLowerCase();
  const kwPatterns = [
    'bug', 'fix', 'deploy', 'refactor', 'migrate',
    'architecture', 'database', 'api', 'performance',
    'security', 'install', 'config', 'docker',
    'memory', 'graph', 'keepthinking', 'openclaw',
    'node', 'server', 'cache', 'error', 'crash',
    'test', 'build', 'release', 'version', 'update',
    '修复', '部署', '重构', '迁移', '安装', '配置'
  ];
  for (const kw of kwPatterns) {
    if (lower.includes(kw)) keywords.push(kw);
  }
  return keywords;
}

// ── 5. Extract key decisions from text ──
function extractKeyDecisions(text) {
  const decisions = [];
  
  const patterns = [
    // Match: "决定：..." or "决定:..."
    { regex: /决定[：:]\s*(.{8,120})/g, type: 'decision', project: 'auto' },
    // Match: "修复了...bug/Bug/问题/错误/issue"  
    { regex: /修复[了]?\s*(.{5,100})(?:bug|Bug|问题|错误|issue)/g, type: 'bug-fix', project: 'auto', tags: ['bug-fix'] },
    // Match: "修复..." (standalone) followed by context within 200 chars
    { regex: /修复[：:]\s*(.{8,120})/g, type: 'bug-fix', project: 'auto', tags: ['bug-fix'] },
    // Match: "部署了..." or "部署到..." or "部署：..."
    { regex: /部署[了到]?\s*(.{5,120})/g, type: 'deployment', project: 'auto' },
    // Match: "重构了..."
    { regex: /重构[了]?\s*(.{5,120})/g, type: 'refactor', project: 'auto' },
    // Match: "迁移到..." or "迁移了..."
    { regex: /迁移[了到]?\s*(.{5,120})/g, type: 'migration', project: 'auto' },
    // Match: "安装了..." or "安装：..."
    { regex: /安装[了]?\s*(.{5,120})/g, type: 'install', project: 'auto' },
    // Match: "配置了..." or "配置：..."
    { regex: /配置[了：:]\s*(.{5,120})/g, type: 'config', project: 'auto' },
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      let label = match[0].trim();
      
      // Clean up artifacts
      label = label
        .replace(/['\u2018\u2019]/g, '')
        .replace(/["\u201c\u201d]/g, '')
        .replace(/[\{\}\[\]\\]/g, '')
        .replace(/\b(timestamp|partialArgs|toolCallId|query)\b[^,;\s]*/gi, '')
        .replace(/\n+/g, ' — ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      
      // Skip short/noisy labels
      if (label.length < 8) continue;
      if (label.length > 120) label = label.slice(0, 120) + '...';
      
      // Must have some meaningful content
      const meaningful = label.replace(/[：:，,\s\-\—\.]+/g, '').length;
      if (meaningful < 6) continue;
      
      decisions.push({
        label,
        type: pattern.type,
        tags: pattern.tags || ['auto-import', pattern.type],
        context: label.slice(0, 200)
      });
    }
  }
  
  // Deduplicate by label similarity
  const unique = [];
  const seen = new Set();
  for (const d of decisions) {
    const key = d.label.slice(0, 40);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(d);
    }
  }
  
  return unique.slice(0, 10);
}

// ── 6. Import session decisions into cognitive graph ──
function importSessionToGraph(engine, sessionText, sessionFile) {
  const keyPoints = extractKeyDecisions(sessionText);
  const g = engine.loadGraph();
  g.nodes = g.nodes || [];
  g.edges = g.edges || [];
  
  let imported = 0;
  for (const point of keyPoints) {
    const exists = (g.nodes || []).some(n => n.label === point.label);
    if (!exists) {
      engine.addNode(g, point.label, point.project || 'imported', point.tags || ['auto-import'], point.context || '', {
        source: 'session-import',
        type: point.type || 'decision',
        metadata: {
          importedFrom: sessionFile,
          importedAt: new Date().toISOString()
        }
      });
      imported++;
    }
  }
  return imported;
}

// ── Main discovery function ──
function runDiscovery(engine, homeDir) {
  const hd = homeDir || process.env.HOME;
  const report = {
    sessionsFound: 0,
    sessionsImported: 0,
    decisionsImported: 0,
    gitProjectsFound: 0,
    errors: []
  };
  
  // Discover and import OpenClaw sessions
  try {
    const sessions = discoverOpenClawSessions(hd);
    report.sessionsFound = sessions.length;
    
    const significant = sessions.filter(s => s.keywords.length > 0).slice(0, 20);
    for (const session of significant) {
      try {
        const rawContent = fs.readFileSync(session.path, 'utf8');
        const extractedText = extractMessageText(rawContent);
        const imported = importSessionToGraph(engine, extractedText, session.file);
        if (imported > 0) {
          report.sessionsImported++;
          report.decisionsImported += imported;
        }
      } catch(e) {
        report.errors.push(`Failed to import ${session.file}: ${e.message}`);
      }
    }
  } catch(e) {
    report.errors.push(`Session discovery failed: ${e.message}`);
  }
  
  // Discover git projects
  try {
    const projects = discoverGitProjects(hd);
    report.gitProjectsFound = projects.length;
  } catch(e) {
    report.errors.push(`Git discovery failed: ${e.message}`);
  }
  
  return report;
}

module.exports = {
  runDiscovery,
  discoverOpenClawSessions,
  discoverGitProjects,
  importSessionToGraph,
  extractKeyDecisions,
  extractSessionKeywords,
  extractMessageText
};
