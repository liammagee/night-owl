# Find & Replace Demo

This document demonstrates the Find & Replace functionality with various examples.

## Basic Text Examples

The concept of dialectic appears throughout Hegel's philosophy. The dialectical method involves thesis, antithesis, and synthesis.

### Repeated Words

Here we have the word "the" appearing multiple times in the text. The word "the" is one of the most common words in English. When you search for "the", you'll find it appears both as a standalone word and as part of other words like "these", "them", "theory".

## Case Sensitivity Examples

- Hegel (capitalized)
- hegel (lowercase)  
- HEGEL (all caps)

Test case sensitivity by searching for "Hegel" with and without the case-sensitive option.

## Whole Word Examples

- philosophy
- philosopher  
- philosophical

Search for "philosophy" with whole word option to see the difference.

## Numbers for Regex Testing

- Year 1807: Phenomenology of Spirit
- Year 1821: Philosophy of Right  
- Page 123, line 45
- ISBN: 978-0123456789

Try regex patterns like:
- `\d{4}` for 4-digit years
- `\d+` for any numbers
- `\b\d{3}\b` for 3-digit numbers

## Special Characters

Some text with (parentheses), [square brackets], and {curly braces}.

Email: example@domain.com
URL: https://example.com/path

## Markdown Elements

**Bold text** and *italic text* and `code text`.

### Headers
- H1: #
- H2: ##  
- H3: ###

## Common Replacement Tasks

Replace "old_term" with "new_term" throughout the document.
Replace "TODO" with "COMPLETED" when tasks are done.
Replace "http://" with "https://" for secure URLs.

## Testing Instructions

1. Press **Ctrl+F** to open Find dialog
2. Search for "concept" - should find 1 match
3. Search for "the" with whole word - count the matches
4. Press **Ctrl+H** to open Find & Replace
5. Try replacing "philosophy" with "Philosophy"
6. Test regex pattern `\b[A-Z][a-z]+\b` to find capitalized words
7. Use **F3** and **Shift+F3** to navigate matches

This document provides comprehensive examples for testing all Find & Replace features!