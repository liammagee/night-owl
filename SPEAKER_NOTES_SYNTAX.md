# Speaker Notes Markdown Extension

## Syntax Design

We'll use a custom syntax that's intuitive and doesn't conflict with standard Markdown:

### Option 1: Fenced Code Block Approach (Recommended)
```markdown
# Slide Title

This is the visible slide content that audiences will see.

- Bullet point 1
- Bullet point 2

```notes
This is speaker notes content that only the presenter will see.

Remember to:
- Speak slowly and clearly
- Make eye contact with the audience
- Pause for questions after this slide

Additional talking points:
- This slide covers the main concepts
- Be prepared for questions about implementation details
```

More slide content here if needed.

---
```

### Option 2: HTML Comment Approach (Alternative)
```markdown
# Slide Title

This is the visible slide content.

<!-- NOTES:
These are speaker notes in HTML comments.
- Point 1 to remember
- Point 2 to emphasize
-->

---
```

### Option 3: Custom Block Syntax (Clean)
```markdown
# Slide Title

This is visible content.

:::notes
These are speaker notes.
- Remember to pause here
- Ask for questions
:::

---
```

## Chosen Syntax: Fenced Code Block with `notes`

We'll use the fenced code block approach with the `notes` language identifier because:

1. **Familiar**: Uses standard Markdown syntax
2. **Editor Support**: Most editors will highlight it properly
3. **Portable**: Won't break in standard Markdown parsers
4. **Clear**: Visually distinct from content
5. **Flexible**: Can contain any text, lists, formatting

## Implementation Plan

1. **Parser Enhancement**: Modify the Markdown renderer to detect `notes` code blocks
2. **Content Separation**: Extract speaker notes during parsing
3. **Presentation Mode**: Show notes in a separate panel during presentations
4. **Editor Integration**: Add toolbar button to insert speaker notes template
5. **Preview Mode**: Option to show/hide notes in preview

## Example Usage

```markdown
# Introduction to Hegel's Dialectical Method

Welcome to today's lecture on Hegelian philosophy.

```notes
Start with energy and enthusiasm. This is a complex topic so begin by reassuring students that we'll build up to the difficult concepts gradually.

Key points to emphasize:
- This is foundational to understanding Hegel
- We'll use concrete examples
- Encourage questions throughout

Timing: Spend about 5 minutes on this slide.
```

## Core Concepts

The dialectical method consists of three moments:

1. **Thesis** - Initial position
2. **Antithesis** - Negation of thesis  
3. **Synthesis** - Higher unity

```notes
Use the blackboard to draw this out visually. Many students are visual learners.

Real-world example to use: How democracy (thesis) and authoritarianism (antithesis) can lead to constitutional democracy (synthesis).

Watch for confused looks - this is where students often get lost. Be ready to slow down and use more examples.

Common question: "Isn't this just compromise?" - Answer: No, synthesis preserves and elevates both sides, doesn't just split the difference.
```

---

## Historical Context

Hegel developed this method in early 19th century Germany...

```notes
Brief historical context - post-Napoleonic era, Industrial Revolution beginning.

If time permits, mention how this influenced Marx, but don't get sidetracked into Marxism - save that for next week.
```

---
```

This syntax will allow presenters to have rich, detailed notes alongside their slide content while keeping the slides themselves clean and focused.