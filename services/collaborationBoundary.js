'use strict';

const crypto = require('crypto');

const COLLABORATION_PROTOCOL_REQUIREMENTS = Object.freeze([
  'convergent-document-model',
  'session-and-document-identity',
  'authenticated-permissions',
  'reconnect-resynchronization',
  'conflict-preserving-local-recovery',
  'bounded-resource-lifecycle',
  'hermetic-two-client-tests'
]);

const COLLABORATION_DECISION = Object.freeze({
  status: 'retired',
  supported: false,
  transport: 'none',
  reasonCode: 'unsafe-positional-edit-prototype-retired',
  summary: 'Real-time collaboration is unsupported until a convergent, identity-aware protocol meets the published safety contract.',
  requirements: COLLABORATION_PROTOCOL_REQUIREMENTS
});

function documentDigest(content) {
  return crypto.createHash('sha256').update(String(content)).digest('hex');
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeDocument(document) {
  if (!document || typeof document !== 'object') {
    throw new TypeError('document must be an object');
  }
  const id = requireNonEmptyString(document.id, 'document.id');
  const content = typeof document.content === 'string' ? document.content : '';
  const version = Number.isInteger(document.version) && document.version >= 0
    ? document.version
    : 0;
  return Object.freeze({ id, content, version, digest: documentDigest(content) });
}

function createRetiredCollaborationBoundary(options = {}) {
  const clientId = requireNonEmptyString(options.clientId, 'clientId');
  const localDocument = normalizeDocument(options.document);
  let closed = false;

  function publicDocumentIdentity() {
    return Object.freeze({
      id: localDocument.id,
      version: localDocument.version,
      digest: localDocument.digest
    });
  }

  function inspect() {
    return Object.freeze({
      decision: COLLABORATION_DECISION,
      clientId,
      state: closed ? 'closed' : 'unsupported',
      document: publicDocumentIdentity()
    });
  }

  function reject(phase, request = {}) {
    const requestedDocumentId = typeof request.documentId === 'string'
      ? request.documentId.trim()
      : null;
    const documentMismatch = Boolean(
      requestedDocumentId && requestedDocumentId !== localDocument.id
    );

    return Object.freeze({
      accepted: false,
      code: closed
        ? 'client-shutdown'
        : documentMismatch
          ? 'document-mismatch'
          : 'collaboration-retired',
      phase,
      clientId,
      sessionId: typeof request.sessionId === 'string' ? request.sessionId : null,
      requestedDocumentId,
      localDocument: publicDocumentIdentity(),
      permission: 'none',
      resynchronization: 'unavailable',
      mutationAllowed: false,
      localDocumentPreserved: true
    });
  }

  return Object.freeze({
    inspect,
    openSession: request => reject('join', request),
    reconnect: request => reject('reconnect', request),
    submitEdit: request => reject('edit', request),
    readLocalDocument: () => ({
      id: localDocument.id,
      content: localDocument.content,
      version: localDocument.version,
      digest: localDocument.digest
    }),
    shutdown: () => {
      const alreadyClosed = closed;
      closed = true;
      return Object.freeze({ closed: true, alreadyClosed, clientId });
    }
  });
}

module.exports = {
  COLLABORATION_DECISION,
  COLLABORATION_PROTOCOL_REQUIREMENTS,
  createRetiredCollaborationBoundary,
  documentDigest
};
