# Structured record schemas

NightOwl opens every `.jsonl` and `.csv` file in readable record mode. A schema
is optional: without one, NightOwl infers ordinary text, number, Boolean, and
JSON controls from the source values and does not impose task-completion rules.

A schema can add task-specific labels, help, ordering, typed controls, choices,
required fields, read-only identifiers, validation, progress, and an export
completion gate without changing NightOwl source.

An optional `workflow` block turns that schema into a keyboard-first labelling
and review workbench. It adds a grid, facets, saved views, bulk-edit previews,
resumable queues, coder/reviewer disagreement views, and handoff metadata. Files
without `workflow` keep the simpler record list and form.

## Attach a schema

NightOwl tries these sources in order:

1. `<file>.schema.json`, such as `development-items.jsonl.schema.json`.
2. A same-stem sidecar, such as `development-items.schema.json`.
3. Each workspace's `.nightowl/record-schemas.json` manifest, selecting the
   first schema whose `match` glob applies to the open file.
4. The **Choose schema…** button in record mode.

An explicitly selected schema stays attached to that file for the current app
session. **Change schema…** replaces it. Code and raw-source editing remain
available through **Show raw JSONL/CSV**.

## Sidecar example

Save this as `development-items.jsonl.schema.json` beside the task file:

```json
{
  "id": "rubric-v3-human-labelling",
  "title": "Rubric v3 human labelling",
  "description": "Complete the required judgement and confidence fields.",
  "formats": ["jsonl", "csv"],
  "fields": {
    "item_id": {
      "label": "Item",
      "readOnly": true,
      "order": 0
    },
    "scenario_context": {
      "label": "Scenario",
      "type": "multiline",
      "readOnly": true,
      "order": 1
    },
    "applicability": {
      "label": "Applicability",
      "help": "Choose whether this rubric can be applied to the item.",
      "enum": ["applicable", "not_applicable"],
      "required": true,
      "order": 2
    },
    "content_accuracy_score": {
      "label": "Content accuracy",
      "enum": [1, 2, 3, 4, 5],
      "required": true,
      "order": 3
    },
    "confidence": {
      "enum": [1, 2, 3, 4, 5],
      "required": true,
      "order": 4
    },
    "notes": {
      "type": "multiline",
      "help": "Optional rationale or ambiguity notes.",
      "order": 5
    }
  },
  "completion": {
    "blockExport": true
  }
}
```

## Workspace pattern manifest

One workspace manifest can serve several tasks. Save this as
`.nightowl/record-schemas.json`:

```json
{
  "schemas": [
    {
      "id": "development-labels",
      "title": "Development labels",
      "match": ["**/development-*.jsonl", "**/development-*.csv"],
      "fields": {
        "item_id": { "readOnly": true, "order": 0 },
        "decision": {
          "enum": ["accept", "revise", "reject"],
          "required": true,
          "order": 1
        },
        "rationale": { "type": "multiline", "required": true, "order": 2 }
      },
      "completion": { "blockExport": true }
    },
    {
      "id": "review-queue",
      "title": "Review queue",
      "match": ["review-*.csv"],
      "fields": {
        "record_id": { "readOnly": true },
        "status": { "enum": ["pending", "done"], "required": true }
      }
    }
  ]
}
```

Patterns use `*` within one path segment, `**` across directories, and `?` for
one character. A schema without a matching pattern can still be used as a
direct sidecar or selected explicitly.

## Field contract

Each entry under `fields` accepts:

| Property | Meaning |
| --- | --- |
| `label` | Human-readable field label. |
| `help` | Guidance displayed below the control. |
| `order` | Numeric display order; unspecified fields follow. |
| `type` | `string`, `multiline`, `number`, `integer`, `boolean`, `array`, `object`, or `json`. |
| `enum` | Allowed values, rendered as a select. |
| `required` | Empty values make the record incomplete. |
| `readOnly` | Display the source value without allowing form edits. |
| `min` / `max` | Numeric range validation. |
| `minLength` / `maxLength` | Text length validation. |
| `pattern` | JavaScript regular-expression text for string validation. |

Set `additionalFields` to `false` to show only declared fields. The underlying
source is never stripped; undeclared data remains intact.

## Progress and export checks

With a schema, the sidebar reports `Complete`, `Incomplete`, `Invalid`, and
`Filtered` counts. Missing required values are incomplete. Present values that
violate a type, choice, range, length, or pattern are invalid. All records stay
visible and searchable, with their status attached to both the record and its
affected fields.

**Check for export** blocks only when `completion.blockExport` is `true` and at
least one record is incomplete or invalid. If the flag is absent or false, the
check is advisory. Generic files have no schema completion gate.

For CSV, schema field names must already be present in the header. JSONL schemas
may add a missing declared field when the user supplies a valid value.

## Labelling and review workbench

Declare `workflow` only when a task benefits from queue and review semantics:

```json
{
  "id": "double-coded-review",
  "title": "Double-coded review",
  "fields": {
    "item_id": { "readOnly": true, "order": 0 },
    "domain": { "readOnly": true, "order": 1 },
    "coder_label": { "enum": ["accept", "revise", "reject"], "order": 2 },
    "reviewer_label": { "enum": ["accept", "revise", "reject"], "order": 3 },
    "final_label": { "enum": ["accept", "revise", "reject"], "order": 4 },
    "confidence": { "type": "integer", "min": 1, "max": 5, "order": 5 },
    "review_notes": { "type": "multiline", "order": 6 }
  },
  "workflow": {
    "labelField": "coder_label",
    "coderField": "coder_label",
    "reviewerField": "reviewer_label",
    "adjudicationField": "final_label",
    "notesField": "review_notes",
    "gridColumns": [
      "item_id",
      "domain",
      "coder_label",
      "reviewer_label",
      "final_label",
      "confidence"
    ],
    "facetFields": ["domain", "confidence"],
    "defaultSort": { "field": "item_id", "direction": "asc" },
    "savedViews": [
      {
        "id": "low-confidence",
        "title": "Low confidence",
        "filters": [
          { "field": "confidence", "operator": "in", "value": [1, 2] }
        ]
      },
      {
        "id": "invalid",
        "title": "Invalid records",
        "filters": [
          { "field": "$validation", "operator": "equals", "value": "invalid" }
        ]
      }
    ]
  }
}
```

The workflow properties are:

| Property | Meaning |
| --- | --- |
| `labelField` | Field changed by `Alt+1` through `Alt+9`; values come from its `enum` or `labelValues`. |
| `labelValues` | Optional explicit keyboard-label order. |
| `coderField` | Enables coded state and the coder/reviewer queues. |
| `reviewerField` | Enables reviewed state and disagreement detection against `coderField`. |
| `adjudicationField` | Enables unresolved-adjudication and adjudicated views. |
| `notesField` | Declares the review-notes field for workflow consumers and handoffs. |
| `gridColumns` | Ordered comparison columns. Defaults to the first six schema fields. |
| `facetFields` | Suggested task facets; every schema field remains filterable in the UI. |
| `defaultSort` | Initial `{ "field", "direction" }` for the queue. |
| `savedViews` | Named filter sets with optional sort. Special fields are `$validation` and `$workflow`. |

Saved-view filter operators are `equals`, `not_equals`, `contains`, `is_empty`,
`is_not_empty`, and `in`. NightOwl also supplies role-aware Coder queue,
Reviewer queue, Disagreements, Adjudication queue, and Adjudicated views when
their fields are declared. Users can save the current facet selection locally;
these personal views do not modify the task file or schema.

Grid and form views use the same selected source record. A bulk fill or clear
must be previewed before it can be applied, and all affected line or row edits
are submitted as one undoable editor transaction. JSONL clears remove the
field; CSV clears retain the column and write an empty cell.

`Alt+Up` and `Alt+Down` move within the filtered queue, `Alt+G` toggles grid and
form, and `Cmd/Ctrl+Enter` saves then advances. These shortcuts are inactive
outside a workflow-backed record file and do not intercept typing inside a form
control.

NightOwl stores the last record and queue settings locally per file and schema.
**Copy handoff metadata** emits counts and resume coordinates without copying
record content or the full source path. `recordMode.checkForExport()` returns
the same metadata under `handoff`, alongside the normal validation gate.
