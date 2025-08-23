/**
 * Test utilities index
 * Provides centralized access to all test utilities
 */

const domSetup = require('./dom-setup');
const mockSetup = require('./mock-setup');
const testHelpers = require('./test-helpers');

module.exports = {
  ...domSetup,
  ...mockSetup,
  ...testHelpers
};