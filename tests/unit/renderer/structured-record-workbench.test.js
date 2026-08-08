const workbench = require('../../../orchestrator/modules/structured-record-workbench');

const workflow = {
  coderField: 'coder_label',
  reviewerField: 'reviewer_label',
  adjudicationField: 'final_label',
  savedViews: [{
    id: 'high-confidence',
    title: 'High confidence',
    filters: [{ field: 'confidence', operator: 'equals', value: 5 }],
    sort: { field: 'item_id', direction: 'desc' }
  }]
};

const records = [
  { value: { item_id: 'item-10', confidence: 5, coder_label: 'yes', reviewer_label: 'yes', final_label: '' } },
  { value: { item_id: 'item-2', confidence: 3, coder_label: 'yes', reviewer_label: 'no', final_label: '' } },
  { value: { item_id: 'item-1', confidence: 5, coder_label: 'no', reviewer_label: 'yes', final_label: 'no' } },
  { value: { item_id: 'item-20', confidence: '', coder_label: '', reviewer_label: '', final_label: '' } }
];

const validation = [
  { status: 'complete' },
  { status: 'complete' },
  { status: 'complete' },
  { status: 'incomplete' }
];

describe('structured record workbench helpers', () => {
  test('derives coder, reviewer, disagreement, and adjudication queues', () => {
    expect(workbench.workflowState(records[1], workflow)).toMatchObject({
      coderComplete: true,
      reviewerComplete: true,
      disagreement: true,
      adjudicated: false,
      bucket: 'disagreement'
    });
    expect(workbench.workflowState(records[2], workflow).bucket).toBe('adjudicated');

    const views = workbench.availableViews(workflow);
    expect(views.map(view => view.id)).toEqual([
      'all',
      'high-confidence',
      'coder-queue',
      'reviewer-queue',
      'disagreements',
      'adjudication-queue',
      'adjudicated'
    ]);
    expect(workbench.selectRows(records, validation, {
      workflow,
      viewId: 'disagreements'
    }).map(row => row.index)).toEqual([1]);
    expect(workbench.selectRows(records, validation, {
      workflow,
      viewId: 'adjudicated'
    }).map(row => row.index)).toEqual([2]);
  });

  test('combines saved filters, free-text search, facets, and stable natural sorting', () => {
    const rows = workbench.selectRows(records, validation, {
      workflow,
      viewId: 'high-confidence',
      query: 'item',
      filterField: '$validation',
      filterValue: 'complete'
    });
    expect(rows.map(row => row.record.value.item_id)).toEqual(['item-10', 'item-1']);
    expect(workbench.facetCounts(records, validation, workflow, '$workflow')).toEqual([
      { value: 'adjudicated', count: 1 },
      { value: 'disagreement', count: 1 },
      { value: 'pending', count: 1 },
      { value: 'reviewed', count: 1 }
    ]);
    expect(workbench.selectRows(records, validation, {
      workflow,
      sortField: 'item_id',
      sortDirection: 'asc'
    }).map(row => row.record.value.item_id)).toEqual(['item-1', 'item-2', 'item-10', 'item-20']);
  });

  test('previews fill and clear operations without mutating records', () => {
    const fill = workbench.previewBulk(records, new Set([1, 3]), 'reviewer_label', 'yes');
    expect(fill).toMatchObject({ affected: 2, clear: false });
    expect(fill.changes.map(change => change.recordId)).toEqual(['item-2', 'item-20']);
    expect(records[1].value.reviewer_label).toBe('no');

    const clear = workbench.previewBulk(records, [0, 3], 'coder_label', undefined, { clear: true });
    expect(clear).toMatchObject({ affected: 1, clear: true });
    expect(clear.changes[0]).toMatchObject({ index: 0, oldValue: 'yes' });
  });

  test('produces source-free resume and review handoff metadata', () => {
    const metadata = workbench.handoffMetadata(records, validation, workflow, {
      generatedAt: '2026-08-09T00:00:00.000Z',
      filePath: '/private/task/items.jsonl',
      schemaId: 'labels-v1',
      selectedIndex: 1,
      activeView: 'disagreements',
      updatedAt: '2026-08-08T23:59:00.000Z'
    });
    expect(metadata).toEqual(expect.objectContaining({
      fileName: 'items.jsonl',
      schemaId: 'labels-v1',
      totalRecords: 4,
      validation: { complete: 3, incomplete: 1, invalid: 0 },
      workflow: {
        coded: 3,
        reviewed: 3,
        disagreements: 2,
        unresolvedDisagreements: 1,
        adjudicated: 1
      },
      resume: expect.objectContaining({
        selectedIndex: 1,
        selectedRecordId: 'item-2',
        activeView: 'disagreements'
      })
    }));
    expect(JSON.stringify(metadata)).not.toContain('/private/task');
  });
});
