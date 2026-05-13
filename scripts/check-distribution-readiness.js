#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const build = packageJson.build || {};
const mac = build.mac || {};

const errors = [];
const warnings = [];

function requireValue(condition, message) {
  if (!condition) errors.push(message);
}

function warnUnless(condition, message) {
  if (!condition) warnings.push(message);
}

function fileExists(relativePath) {
  return Boolean(relativePath) && fs.existsSync(path.join(root, relativePath));
}

requireValue(build.appId === 'com.machinespirits.nightowl', 'build.appId must stay stable for upgrades and notarization.');
requireValue(build.productName === 'NightOwl', 'build.productName must be NightOwl.');
requireValue(build.directories?.output === 'dist', 'build.directories.output should be dist.');
requireValue(mac.category === 'public.app-category.education', 'mac.category should be set for Finder/App Store metadata.');
requireValue(fileExists(mac.icon), `mac.icon is missing: ${mac.icon || '(unset)'}`);
requireValue(mac.hardenedRuntime === true, 'mac.hardenedRuntime must be true for notarized distribution.');
requireValue(mac.gatekeeperAssess === false, 'mac.gatekeeperAssess should be false; notarization should be explicit in release flow.');
requireValue(fileExists(mac.entitlements), `mac.entitlements is missing: ${mac.entitlements || '(unset)'}`);
requireValue(fileExists(mac.entitlementsInherit), `mac.entitlementsInherit is missing: ${mac.entitlementsInherit || '(unset)'}`);
requireValue(packageJson.scripts?.['native:sign'], 'native:sign script is required for local native-module signature repair.');
requireValue(packageJson.dependencies?.['node-pty'], 'node-pty dependency is required for the integrated terminal package.');

if (process.platform === 'darwin') {
  const identity = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8'
  });
  const identityOutput = `${identity.stdout || ''}\n${identity.stderr || ''}`;
  const hasDeveloperId = identity.status === 0 && /Developer ID Application/.test(identityOutput);
  const requireIdentity = process.env.NIGHTOWL_REQUIRE_SIGNING_IDENTITY === '1';
  if (requireIdentity) {
    requireValue(hasDeveloperId, 'No Developer ID Application signing identity found in this keychain.');
  } else {
    warnUnless(hasDeveloperId, 'No Developer ID Application signing identity found; local dist builds will be unsigned.');
  }
}

const hasAppleApiKey = Boolean(process.env.APPLE_API_KEY && process.env.APPLE_API_ISSUER && process.env.APPLE_API_KEY_ID);
const hasAppleId = Boolean(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID);
const requireNotarization = process.env.NIGHTOWL_REQUIRE_NOTARIZATION_CREDS === '1';
if (requireNotarization) {
  requireValue(hasAppleApiKey || hasAppleId, 'Notarization credentials are required but not configured.');
} else {
  warnUnless(hasAppleApiKey || hasAppleId, 'Notarization credentials are not set; CI can still build artifacts, but macOS releases need credentials.');
}

for (const warning of warnings) {
  console.warn(`[dist-check] warning: ${warning}`);
}

if (errors.length) {
  for (const error of errors) {
    console.error(`[dist-check] error: ${error}`);
  }
  process.exit(1);
}

console.log('[dist-check] distribution readiness checks passed.');
