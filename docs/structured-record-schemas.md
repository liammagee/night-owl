# Structured record schemas

NightOwl opens every `.jsonl` and `.csv` file in readable record mode. A schema
is optional: without one, NightOwl infers ordinary text, number, Boolean, and
JSON controls from the source values and does not impose task-completion rules.

A schema can add task-specific labels, help, ordering, typed controls, choices,
required fields, read-only identifiers, validation, progress, and an export
completion gate without changing NightOwl source.

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
