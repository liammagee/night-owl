'use strict';

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { constants } = require('fs');
const pendingWrites = new Map();
const SAVE_BACKUP_DIR_NAME = '.nightowl-backups';
const SAVE_CONFLICT_CODE = 'FILE_MODIFIED_EXTERNALLY';

async function statOrNull(filePath, fsApi = fs) {
  try {
    return await fsApi.stat(filePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function lstatOrNull(filePath, fsApi = fs) {
  try {
    return await fsApi.lstat(filePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function hasExternalModification(currentStat, baselineMtimeMs) {
  if (!currentStat || !Number.isFinite(baselineMtimeMs)) return false;
  // Small epsilon handles fs precision differences.
  return Math.abs(currentStat.mtimeMs - baselineMtimeMs) > 1;
}

function buildBackupFilePath(filePath, timestamp = Date.now()) {
  const directory = path.dirname(filePath);
  const backupDir = path.join(directory, SAVE_BACKUP_DIR_NAME);
  const parsed = path.parse(filePath);
  const backupName = `${parsed.name}.${timestamp}${parsed.ext || '.md'}.bak`;
  return path.join(backupDir, backupName);
}

async function createFileBackup(filePath, fsApi = fs) {
  const existingStat = await statOrNull(filePath, fsApi);
  if (!existingStat) return null;

  const backupPath = buildBackupFilePath(filePath, `${Date.now()}-${crypto.randomUUID()}`);
  await fsApi.mkdir(path.dirname(backupPath), { recursive: true });
  // Recovery copies belong on disk, not in an author's published repository.
  // Keep this local to our own directory and preserve any existing ignore file.
  try {
    await fsApi.writeFile(path.join(path.dirname(backupPath), '.gitignore'), '*\n', { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await fsApi.copyFile(filePath, backupPath, constants.COPYFILE_EXCL);
  return backupPath;
}

async function writeGuardedVersion(filePath, content, options = {}, context = {}) {
  const fsApi = context.fsApi || fs;
  const fileStateMap = context.fileStateMap || new Map();
  const expectedMtimeMs = Number.isFinite(options.expectedMtimeMs) ? options.expectedMtimeMs : null;
  const force = Boolean(options.force);
  const knownState = fileStateMap.get(filePath);
  const baselineMtimeMs = expectedMtimeMs ?? (knownState ? knownState.mtimeMs : null);
  const currentStat = await statOrNull(filePath, fsApi);
  let externallyModified = currentStat
    ? hasExternalModification(currentStat, baselineMtimeMs)
    : Number.isFinite(baselineMtimeMs);

  // Recovered buffers can predate this process's mtime cache. Compare their
  // saved content with disk before autosave is allowed to replace newer work.
  if (!force && !externallyModified && typeof options.expectedContent === 'string') {
    const diskContent = currentStat ? await fsApi.readFile(filePath, 'utf8') : null;
    externallyModified = diskContent !== options.expectedContent;
  }

  if (!force && externallyModified) {
    return {
      success: false,
      code: SAVE_CONFLICT_CODE,
      error: 'File has changed on disk since it was opened. Review changes before overwriting.',
      filePath,
      currentMtimeMs: currentStat ? currentStat.mtimeMs : null,
      expectedMtimeMs: baselineMtimeMs
    };
  }

  const backupPath = await createFileBackup(filePath, fsApi);
  await atomicWriteFile(filePath, content, { fsApi, mode: currentStat?.mode });
  const updatedStat = await statOrNull(filePath, fsApi);
  if (updatedStat) {
    fileStateMap.set(filePath, { mtimeMs: updatedStat.mtimeMs, size: updatedStat.size });
  }

  return {
    success: true,
    filePath,
    backupPath,
    mtimeMs: updatedStat ? updatedStat.mtimeMs : null
  };
}

/** Stage and flush bytes before an atomic rename; never truncate the live file. */
async function atomicWriteFile(filePath, content, { fsApi = fs, mode } = {}) {
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fsApi.open(temporary, 'wx', mode == null ? 0o666 : mode & 0o777);
    await handle.writeFile(content, 'utf8');
    if (mode != null) await handle.chmod(mode & 0o777);
    await handle.sync();
    await handle.close();
    handle = null;
    await fsApi.rename(temporary, filePath);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fsApi.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

/** Serialize writes by canonical target, including requests made through aliases. */
async function guardedWriteFile(filePath, content, options = {}, context = {}) {
  const fsApi = context.fsApi || fs;
  const fileStateMap = context.fileStateMap;
  const baseline = fileStateMap?.get(filePath);
  const resolvedOptions = Number.isFinite(options.expectedMtimeMs) || !baseline
    ? options : { ...options, expectedMtimeMs: baseline.mtimeMs };
  let target;
  try { target = await fsApi.realpath(filePath); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // Resolve the parent too so new files through workspace aliases share a queue.
    target = path.join(await fsApi.realpath(path.dirname(filePath)), path.basename(filePath));
  }
  const previous = pendingWrites.get(target) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    const result = await writeGuardedVersion(target, content, resolvedOptions, { ...context, fileStateMap: new Map() });
    if (result.success && fileStateMap) {
      const stat = await statOrNull(target, fsApi);
      if (stat) fileStateMap.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size });
    }
    return { ...result, filePath };
  });
  pendingWrites.set(target, operation);
  try { return await operation; }
  finally { if (pendingWrites.get(target) === operation) pendingWrites.delete(target); }
}

module.exports = { SAVE_CONFLICT_CODE, atomicWriteFile, statOrNull, lstatOrNull, hasExternalModification, buildBackupFilePath, createFileBackup, guardedWriteFile };
