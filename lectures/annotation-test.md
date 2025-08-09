# Annotation System Test

This document demonstrates the new annotation system with various types of annotations.

## Comment Annotations

Here's a paragraph with a hidden comment annotation. <!-- @note: This is a comment annotation that explains something important about this paragraph -->

The comment above is invisible in the editor but shows as a marker in the preview.

## Inline Highlight Annotations

This paragraph contains ==highlighted text=={@note This is an important concept to remember} that has been annotated with additional context.

You can also create ==critical information=={@warning Pay special attention to this part} with different annotation types.

## Block Annotations

:::annotation type="note" author="instructor"
This is a block annotation that provides extended commentary or explanation about a concept. Block annotations are useful for longer explanations that don't fit well as inline comments.
:::

:::annotation type="question" author="student"
How does this concept relate to what we learned in the previous chapter? This is a student question that could be addressed in discussion.
:::

:::annotation type="thought" author="researcher"
This connects to contemporary debates in the field. We might want to explore the implications of this idea in our next research project.
:::

## Mixed Content

This paragraph demonstrates <!-- @note: Mixed annotations work well together --> multiple ==annotation types=={@link See chapter 3 for more details} in the same content block.

:::annotation type="warning" author="editor"
Remember to cite sources when making claims like this. Academic rigor is important.
:::

## Plain Content

This paragraph has no annotations and should render normally without any special markers or highlights.

The annotation system preserves the readability of plain markdown while adding rich interactive capabilities in the preview mode.