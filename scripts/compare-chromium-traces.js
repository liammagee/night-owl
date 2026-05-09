#!/usr/bin/env node

const fs = require('fs');

function readTrace(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed.traceEvents) ? parsed.traceEvents : [];
}

function summarizeTrace(events) {
  const completeEvents = events.filter(event => event.ph === 'X' && Number.isFinite(event.dur));
  const byName = new Map();

  for (const event of completeEvents) {
    const entry = byName.get(event.name) || { count: 0, totalUs: 0, maxUs: 0 };
    entry.count += 1;
    entry.totalUs += event.dur;
    entry.maxUs = Math.max(entry.maxUs, event.dur);
    byName.set(event.name, entry);
  }

  return Array.from(byName.entries())
    .map(([name, entry]) => ({
      name,
      count: entry.count,
      totalMs: entry.totalUs / 1000,
      maxMs: entry.maxUs / 1000
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

function printSummary(label, rows, limit = 20) {
  console.log(`\n## ${label}`);
  console.log('| Event | Count | Total ms | Max ms |');
  console.log('| --- | ---: | ---: | ---: |');
  rows.slice(0, limit).forEach(row => {
    console.log(`| ${row.name.replace(/\|/g, '\\|')} | ${row.count} | ${row.totalMs.toFixed(2)} | ${row.maxMs.toFixed(2)} |`);
  });
}

function printComparison(baseRows, headRows, limit = 20) {
  const base = new Map(baseRows.map(row => [row.name, row]));
  const head = new Map(headRows.map(row => [row.name, row]));
  const names = new Set([...base.keys(), ...head.keys()]);
  const rows = Array.from(names).map(name => {
    const before = base.get(name) || { totalMs: 0, count: 0, maxMs: 0 };
    const after = head.get(name) || { totalMs: 0, count: 0, maxMs: 0 };
    return {
      name,
      beforeMs: before.totalMs,
      afterMs: after.totalMs,
      deltaMs: after.totalMs - before.totalMs,
      beforeCount: before.count,
      afterCount: after.count
    };
  }).sort((a, b) => Math.abs(b.deltaMs) - Math.abs(a.deltaMs));

  console.log('\n## Comparison');
  console.log('| Event | Base ms | Current ms | Delta ms | Base count | Current count |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: |');
  rows.slice(0, limit).forEach(row => {
    console.log(`| ${row.name.replace(/\|/g, '\\|')} | ${row.beforeMs.toFixed(2)} | ${row.afterMs.toFixed(2)} | ${row.deltaMs.toFixed(2)} | ${row.beforeCount} | ${row.afterCount} |`);
  });
}

function main(argv = process.argv.slice(2)) {
  const [basePath, currentPath] = argv;
  if (!basePath || !currentPath) {
    console.error('Usage: node scripts/compare-chromium-traces.js <base-trace.json> <current-trace.json>');
    process.exitCode = 1;
    return;
  }

  const baseSummary = summarizeTrace(readTrace(basePath));
  const currentSummary = summarizeTrace(readTrace(currentPath));
  console.log('# Chromium Trace Comparison');
  printSummary('Base Trace', baseSummary);
  printSummary('Current Trace', currentSummary);
  printComparison(baseSummary, currentSummary);
}

if (require.main === module) {
  main();
}

module.exports = {
  readTrace,
  summarizeTrace
};
