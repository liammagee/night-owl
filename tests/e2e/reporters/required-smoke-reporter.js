'use strict';

class RequiredSmokeReporter {
  onBegin(_config, suite) {
    this.planned = suite.allTests().length;
    this.results = new Map();
  }

  onTestEnd(test, result) {
    this.results.set(test.id, result.status);
  }

  onEnd() {
    const statuses = Array.from(this.results.values());
    const skipped = statuses.filter(status => status === 'skipped').length;
    const failed = statuses.filter(status => ['failed', 'timedOut', 'interrupted'].includes(status)).length;
    const passed = statuses.filter(status => status === 'passed').length;
    const executed = statuses.length - skipped;

    console.log(
      `Required Electron E2E summary: planned=${this.planned} executed=${executed} ` +
      `passed=${passed} failed=${failed} skipped=${skipped}`
    );

    if (this.planned === 0 || executed === 0) {
      console.error('Required Electron E2E smoke did not execute any tests; failing the run.');
      return { status: 'failed' };
    }
    return undefined;
  }
}

module.exports = RequiredSmokeReporter;
