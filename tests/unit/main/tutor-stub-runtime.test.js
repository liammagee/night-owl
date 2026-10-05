const path = require('path');
const { candidatePaths, findTutorStubRuntime, validateRepository } = require('../../../services/tutorStubRuntime');

describe('tutorStubRuntime', () => {
  test('prefers an explicitly configured repository', () => {
    const candidates = candidatePaths({
      configuredPath: '/projects/custom-eval',
      workingDirectory: '/projects/content'
    });
    expect(candidates[0]).toBe(path.resolve('/projects/custom-eval'));
    expect(candidates).toContain(path.resolve('/projects/machinespirits-eval'));
  });

  test('validates the tutor:stub npm entry point', () => {
    const root = '/projects/machinespirits-eval';
    const result = validateRepository(root, {
      existsSync: filePath => [
        path.join(root, 'package.json'),
        path.join(root, 'scripts', 'tutor-stub.js')
      ].includes(filePath),
      readFileSync: () => JSON.stringify({ scripts: { 'tutor:stub': 'node scripts/tutor-stub.js' } })
    });

    expect(result).toEqual({
      available: true,
      reason: null,
      repositoryPath: root,
      command: 'npm',
      args: ['run', 'tutor:stub']
    });
  });

  test('returns a redacted not-found status when no checkout validates', () => {
    expect(findTutorStubRuntime({ existsSync: () => false })).toEqual({
      available: false,
      reason: 'not-found',
      repositoryPath: null,
      command: null,
      args: []
    });
  });
});
