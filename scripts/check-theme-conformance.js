#!/usr/bin/env node
'use strict';

const contract = require('../plugins/techne-theme-manager/theme-contract');
const themes = require('../plugins/techne-theme-manager/themes');

function formatIssue(issue) {
  if (issue.code === 'contrast') {
    return `${issue.label}: ${issue.ratio ?? 'invalid'}:1 (minimum ${issue.minimum}:1)`;
  }
  if (Number.isFinite(issue.distance)) {
    return `${issue.label}: hue distance ${issue.distance} degrees`;
  }
  return issue.label;
}

function main() {
  const report = contract.validateAll(themes);
  for (const result of report.results) {
    if (result.valid) {
      console.log(`PASS ${result.id} (${result.colorScheme})`);
      continue;
    }
    console.error(`FAIL ${result.id} (${result.colorScheme})`);
    result.issues.forEach(issue => console.error(`  - ${formatIssue(issue)}`));
  }
  console.log(
    `Theme conformance: ${report.themeCount - report.failureCount}/${report.themeCount} passed ` +
    `(contract v${contract.VERSION})`
  );
  if (!report.valid) process.exitCode = 1;
  return report;
}

if (require.main === module) main();

module.exports = { formatIssue, main };
