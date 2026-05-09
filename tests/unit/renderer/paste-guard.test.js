describe('paste gesture guard', () => {
  test('suppresses repeated acquisitions inside the lock window', () => {
    const { createPasteGestureGuard } = require('../../../orchestrator/modules/paste-guard.js');

    let now = 1000;
    const guard = createPasteGestureGuard({
      now: () => now,
      lockMs: 120
    });

    expect(guard.tryAcquire()).toBe(true);

    now = 1050;
    expect(guard.tryAcquire()).toBe(false);

    now = 1120;
    expect(guard.tryAcquire()).toBe(true);
  });
});
