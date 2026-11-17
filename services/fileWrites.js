'use strict';

const fs = require('fs').promises;
const path = require('path');
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

  const backupPath = buildBackupFilePath(filePath);
  await fsApi.mkdir(path.dirname(backupPath), { recursive: true });
  // Recovery copies belong on disk, not in an author's published repository.
  // Keep this local to our own directory and preserve any existing ignore file.
  try {
    await fsApi.writeFile(path.join(path.dirname(backupPath), '.gitignore'), '*\n', { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await fsApi.copyFile(filePath, backupPath);
  return backupPath;
}

async function guardedWriteFile(filePath, content, options = {}, context = {}) {
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
  await fsApi.writeFile(filePath, content, 'utf8');
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

module.exports = { SAVE_CONFLICT_CODE, statOrNull, lstatOrNull, hasExternalModification, buildBackupFilePath, createFileBackup, guardedWriteFile };
