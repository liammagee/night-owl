'use strict';

const {
  COLLABORATION_DECISION,
  COLLABORATION_PROTOCOL_REQUIREMENTS,
  createRetiredCollaborationBoundary,
  documentDigest
} = require('../../../services/collaborationBoundary');

describe('retired collaboration boundary', () => {
  function client(clientId, content, version = 1) {
    return createRetiredCollaborationBoundary({
      clientId,
      document: { id: 'essay.md', content, version }
    });
  }

  test('records an explicit unsupported decision and reintroduction contract', () => {
    expect(COLLABORATION_DECISION).toMatchObject({
      status: 'retired',
      supported: false,
      transport: 'none'
    });
    expect(COLLABORATION_PROTOCOL_REQUIREMENTS).toEqual(expect.arrayContaining([
      'convergent-document-model',
      'session-and-document-identity',
      'authenticated-permissions',
      'reconnect-resynchronization',
      'conflict-preserving-local-recovery',
      'bounded-resource-lifecycle',
      'hermetic-two-client-tests'
    ]));
  });

  test('two simultaneous edit attempts cannot mutate either local document', async () => {
    const first = client('writer-a', 'Writer A local version');
    const second = client('writer-b', 'Writer B newer local version', 2);
    const before = [first.readLocalDocument(), second.readLocalDocument()];

    const [firstResult, secondResult] = await Promise.all([
      Promise.resolve(first.submitEdit({
        sessionId: 'review-session',
        documentId: 'essay.md',
        baseVersion: 1,
        content: 'Writer A proposed remote edit'
      })),
      Promise.resolve(second.submitEdit({
        sessionId: 'review-session',
        documentId: 'essay.md',
        baseVersion: 2,
        content: 'Writer B proposed remote edit'
      }))
    ]);

    expect(firstResult).toMatchObject({
      accepted: false,
      code: 'collaboration-retired',
      mutationAllowed: false,
      localDocumentPreserved: true
    });
    expect(secondResult).toMatchObject({
      accepted: false,
      code: 'collaboration-retired',
      mutationAllowed: false,
      localDocumentPreserved: true
    });
    expect([first.readLocalDocument(), second.readLocalDocument()]).toEqual(before);
  });

  test('makes reconnect and document mismatch failures explicit', () => {
    const boundary = client('writer-a', 'Keep this local content', 7);

    expect(boundary.reconnect({
      sessionId: 'review-session',
      documentId: 'essay.md'
    })).toMatchObject({
      accepted: false,
      code: 'collaboration-retired',
      phase: 'reconnect',
      resynchronization: 'unavailable'
    });
    expect(boundary.openSession({
      sessionId: 'review-session',
      documentId: 'different.md'
    })).toMatchObject({
      accepted: false,
      code: 'document-mismatch',
      requestedDocumentId: 'different.md',
      localDocument: {
        id: 'essay.md',
        version: 7,
        digest: documentDigest('Keep this local content')
      }
    });
    expect(boundary.readLocalDocument().content).toBe('Keep this local content');
  });

  test('shuts down cleanly and rejects later work without mutation', () => {
    const boundary = client('writer-a', 'Local source');

    expect(boundary.shutdown()).toEqual({
      closed: true,
      alreadyClosed: false,
      clientId: 'writer-a'
    });
    expect(boundary.shutdown()).toEqual({
      closed: true,
      alreadyClosed: true,
      clientId: 'writer-a'
    });
    expect(boundary.submitEdit({ documentId: 'essay.md', content: 'Discard me' }))
      .toMatchObject({ accepted: false, code: 'client-shutdown', mutationAllowed: false });
    expect(boundary.inspect().state).toBe('closed');
    expect(boundary.readLocalDocument().content).toBe('Local source');
  });
});
