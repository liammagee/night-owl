describe('app confirmation helper', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.electronAPI = { invoke: jest.fn() };
    require('../../../orchestrator/modules/app-confirm.js');
  });

  test('uses native Electron confirmation when available', async () => {
    window.electronAPI.invoke.mockResolvedValue({
      success: true,
      confirmed: true
    });

    await expect(window.showAppConfirm({
      title: 'Delete File',
      message: 'Delete file?',
      paths: ['/workspace/file.md'],
      confirmText: 'Delete',
      variant: 'danger'
    })).resolves.toBe(true);

    expect(window.electronAPI.invoke).toHaveBeenCalledWith(
      'show-confirm-dialog',
      expect.objectContaining({
        title: 'Delete File',
        paths: ['/workspace/file.md'],
        confirmText: 'Delete'
      })
    );
  });

  test('falls back to an in-app modal with exact paths', async () => {
    window.electronAPI.invoke.mockRejectedValue(new Error('native unavailable'));

    const promise = window.showAppConfirm({
      title: 'Remove Workspace Folder',
      message: 'Remove folder?',
      detail: 'This does not delete files on disk.',
      paths: ['/workspace/docs'],
      confirmText: 'Remove',
      variant: 'warning'
    });
    await Promise.resolve();

    const dialog = document.querySelector('.app-confirm-dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('Remove Workspace Folder');
    expect(dialog.textContent).toContain('/workspace/docs');

    document.querySelector('.app-confirm-actions .btn-primary').click();
    await expect(promise).resolves.toBe(true);
  });
});
