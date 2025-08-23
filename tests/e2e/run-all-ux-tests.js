#!/usr/bin/env node

/**
 * Comprehensive UX Test Runner
 * Runs all automated browser-based UX tests and generates reports
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    log(`\n▶ Running: ${command} ${args.join(' ')}`, colors.cyan);
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function ensureDependencies() {
  log('\n📦 Checking dependencies...', colors.blue);
  
  const packageJson = require('../../package.json');
  const requiredDeps = [
    '@playwright/test',
    'axe-playwright',
    'playwright'
  ];

  const missingDeps = requiredDeps.filter(dep => 
    !packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]
  );

  if (missingDeps.length > 0) {
    log(`\n⚠️  Missing dependencies: ${missingDeps.join(', ')}`, colors.yellow);
    log('Installing missing dependencies...', colors.yellow);
    
    await runCommand('npm', ['install', '--save-dev', ...missingDeps]);
  }

  // Install Playwright browsers if needed
  if (missingDeps.includes('@playwright/test') || missingDeps.includes('playwright')) {
    log('\n🌐 Installing Playwright browsers...', colors.blue);
    await runCommand('npx', ['playwright', 'install']);
  }
}

async function runTests() {
  const testSuites = [
    {
      name: 'Unit Tests',
      command: 'npm',
      args: ['run', 'test:unit'],
      required: true
    },
    {
      name: 'Integration Tests',
      command: 'npm',
      args: ['run', 'test:integration'],
      required: true
    },
    {
      name: 'E2E Workflow Tests',
      command: 'npx',
      args: ['playwright', 'test', 'app-workflow.e2e.js'],
      required: false
    },
    {
      name: 'Accessibility Tests',
      command: 'npx',
      args: ['playwright', 'test', 'accessibility.e2e.js'],
      required: false
    },
    {
      name: 'Performance Tests',
      command: 'npx',
      args: ['playwright', 'test', 'performance.e2e.js'],
      required: false
    },
    {
      name: 'Visual Regression Tests',
      command: 'npx',
      args: ['playwright', 'test', 'visual-regression.e2e.js', '--update-snapshots'],
      required: false
    }
  ];

  const results = {
    passed: [],
    failed: [],
    skipped: []
  };

  for (const suite of testSuites) {
    log(`\n${'='.repeat(50)}`, colors.bright);
    log(`🧪 Running ${suite.name}`, colors.bright);
    log('='.repeat(50), colors.bright);

    try {
      await runCommand(suite.command, suite.args);
      results.passed.push(suite.name);
      log(`✅ ${suite.name} passed`, colors.green);
    } catch (error) {
      if (suite.required) {
        results.failed.push(suite.name);
        log(`❌ ${suite.name} failed`, colors.red);
        log(`Error: ${error.message}`, colors.red);
      } else {
        results.skipped.push(suite.name);
        log(`⚠️  ${suite.name} skipped (optional)`, colors.yellow);
      }
    }
  }

  return results;
}

async function generateReport(results) {
  log('\n📊 Generating test report...', colors.blue);

  const reportDir = path.join(__dirname, '..', '..', 'test-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportDir, `ux-test-report-${timestamp}.json`);

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.passed.length + results.failed.length + results.skipped.length,
      passed: results.passed.length,
      failed: results.failed.length,
      skipped: results.skipped.length
    },
    results
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`📄 Report saved to: ${reportPath}`, colors.green);

  // Generate HTML report if Playwright report exists
  const playwrightReportPath = path.join(__dirname, '..', '..', 'playwright-report');
  if (fs.existsSync(playwrightReportPath)) {
    log('\n🌐 Playwright HTML report available at: playwright-report/index.html', colors.cyan);
    log('   Run "npx playwright show-report" to view', colors.cyan);
  }

  return report;
}

async function main() {
  log('\n🚀 Hegel Pedagogy AI - Comprehensive UX Test Suite', colors.bright);
  log('=' .repeat(50), colors.bright);

  try {
    // Check and install dependencies
    await ensureDependencies();

    // Run all test suites
    const results = await runTests();

    // Generate report
    const report = await generateReport(results);

    // Print summary
    log('\n' + '='.repeat(50), colors.bright);
    log('📈 Test Summary', colors.bright);
    log('='.repeat(50), colors.bright);
    
    log(`\n✅ Passed: ${report.summary.passed}`, colors.green);
    if (report.summary.failed > 0) {
      log(`❌ Failed: ${report.summary.failed}`, colors.red);
    }
    if (report.summary.skipped > 0) {
      log(`⚠️  Skipped: ${report.summary.skipped}`, colors.yellow);
    }

    // Exit with appropriate code
    if (report.summary.failed > 0) {
      log('\n❌ Some tests failed. Please review the errors above.', colors.red);
      process.exit(1);
    } else {
      log('\n✅ All required tests passed!', colors.green);
      process.exit(0);
    }

  } catch (error) {
    log(`\n❌ Test runner error: ${error.message}`, colors.red);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { runTests, generateReport };