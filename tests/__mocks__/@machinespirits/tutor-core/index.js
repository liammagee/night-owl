// Mock @machinespirits/tutor-core for Jest tests
// This mock is resolved via modulePaths in jest.config.js

const writingPadService = {
  initializeWritingPad: jest.fn(),
  addWorkingThought: jest.fn(),
};

const learnerIntegrationService = {
  detectResistance: jest.fn(),
  detectBreakthrough: jest.fn(),
};

const tutorDialogueEngine = {
  runDialogue: jest.fn(),
};

const recognitionGamificationService = {
  getLearnerRecognitionProfile: jest.fn(),
};

module.exports = {
  writingPadService,
  learnerIntegrationService,
  tutorDialogueEngine,
  recognitionGamificationService,
};
