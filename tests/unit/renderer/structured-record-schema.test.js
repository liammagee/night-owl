const schemaTools = require('../../../orchestrator/modules/structured-record-schema');

const TASK_SCHEMA = {
  id: 'human-labels',
  title: 'Human labels',
  match: ['**/development-*.jsonl', 'labels-*.csv'],
  fields: {
    item_id: { label: 'Item', readOnly: true, order: 0 },
    applicability: {
      label: 'Applicability',
      enum: ['applicable', 'not_applicable'],
      required: true,
      help: 'Decide whether the rubric applies.',
      order: 1
    },
    score: { type: 'integer', min: 1, max: 5, required: true, order: 2 }
  },
  completion: { blockExport: true }
};

describe('structured record schemas', () => {
  test('normalizes object fields and matches basename or workspace patterns', () => {
    const schema = schemaTools.normalizeSchema(TASK_SCHEMA);

    expect(schema.fields.map(field => field.name)).toEqual(['item_id', 'applicability', 'score']);
    expect(schema.fieldsByName.item_id.readOnly).toBe(true);
    expect(schema.completion.requiredFields).toEqual(['applicability', 'score']);
    expect(schemaTools.schemaMatchesFile(schema, '/workspace/bundle/development-items.jsonl')).toBe(true);
    expect(schemaTools.schemaMatchesFile(schema, '/workspace/labels-a.csv')).toBe(true);
    expect(schemaTools.schemaMatchesFile(schema, '/workspace/notes.jsonl')).toBe(false);
  });

  test('selects the first matching schema from a workspace manifest', () => {
    const schema = schemaTools.selectSchemaFromDocument({
      schemas: [
        { title: 'CSV labels', match: ['*.csv'], fields: {} },
        TASK_SCHEMA
      ]
    }, '/workspace/development-items.jsonl', { source: 'workspace' });

    expect(schema.title).toBe('Human labels');
    expect(schema.source).toBe('workspace');
  });

  test('keeps incomplete and invalid records visible with field issues', () => {
    const schema = schemaTools.normalizeSchema(TASK_SCHEMA);
    const records = [
      { value: { item_id: 'a', applicability: 'applicable', score: 4 } },
      { value: { item_id: 'b', applicability: '', score: '' } },
      { value: { item_id: 'c', applicability: 'maybe', score: 8 } }
    ];
    const result = schemaTools.summarizeRecords(records, schema, 2);

    expect(result.progress).toEqual({ total: 3, complete: 1, incomplete: 1, invalid: 1, filtered: 2 });
    expect(result.validation[1].fields.applicability[0].kind).toBe('required');
    expect(result.validation[2].fields.score[0].message).toContain('at most 5');
  });

  test('orders schema fields, retains generic extras, and coerces JSONL types', () => {
    const schema = schemaTools.normalizeSchema(TASK_SCHEMA);
    const fields = schemaTools.orderedFields({ extra: 'keep', score: 2, item_id: 'a' }, schema);

    expect(fields.map(field => field.name)).toEqual(['item_id', 'applicability', 'score', 'extra']);
    expect(schemaTools.coerceValue('5', schema.fieldsByName.score, 'jsonl').value).toBe(5);
    expect(() => schemaTools.coerceValue('7', schema.fieldsByName.score, 'jsonl')).toThrow('at most 5');
  });

  test('rejects unsupported field types and malformed patterns early', () => {
    expect(() => schemaTools.normalizeSchema({ fields: { value: { type: 'date' } } })).toThrow('Unsupported type');
    expect(() => schemaTools.normalizeSchema({ fields: { value: { pattern: '[' } } })).toThrow('Invalid pattern');
  });

  test('normalizes optional labelling workflow fields, saved views, and keyboard labels', () => {
    const schema = schemaTools.normalizeSchema({
      ...TASK_SCHEMA,
      workflow: {
        labelField: 'applicability',
        coderField: 'applicability',
        gridColumns: ['item_id', 'applicability', 'score'],
        facetFields: ['applicability'],
        defaultSort: { field: 'item_id', direction: 'desc' },
        savedViews: [{
          id: 'needs-score',
          title: 'Needs score',
          filters: [{ field: 'score', operator: 'is_empty' }]
        }]
      }
    });

    expect(schema.workflow).toMatchObject({
      labelField: 'applicability',
      labelValues: ['applicable', 'not_applicable'],
      coderField: 'applicability',
      gridColumns: ['item_id', 'applicability', 'score'],
      facetFields: ['applicability'],
      defaultSort: { field: 'item_id', direction: 'desc' }
    });
    expect(schema.workflow.savedViews[0]).toMatchObject({ id: 'needs-score', builtin: false });
    expect(() => schemaTools.normalizeSchema({
      fields: { label: {} },
      workflow: { reviewerField: 'missing' }
    })).toThrow('unknown field');
  });
});
