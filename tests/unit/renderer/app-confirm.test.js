describe('app confirmation helper', () => {
  let showConfirmDialog;
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    showConfirmDialog = jest.fn();
    window.electronAPI = { app: { showConfirmDialog } };
    require('../../../orchestrator/modules/app-confirm.js');
  });

  test('uses native Electron confirmation when available', async () => {
    showConfirmDialog.mockResolvedValue({
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

    expect(showConfirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Delete File',
        paths: ['/workspace/file.md'],
        confirmText: 'Delete'
      })
    );
  });

  test('falls back to an in-app modal with exact paths', async () => {
    showConfirmDialog.mockRejectedValue(new Error('native unavailable'));

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
