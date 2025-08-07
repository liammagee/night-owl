# Test Internal Links

This document demonstrates Obsidian-style internal linking functionality.

## Basic Internal Links

Here are some examples of internal links:

- Basic link: [[lecture-1]]
- Link with display text: [[lecture-1|First Lecture]]
- Link to another file: [[robo_phenomenology]]
- Link with custom text: [[robo_phenomenology|Robot Phenomenology]]

## Features

The internal linking system supports:

1. **Auto .md extension**: Links like `[[lecture-1]]` automatically become `lecture-1.md`
2. **Custom display text**: Use `[[filename|Display Text]]` for custom text
3. **File creation**: Click on non-existent files to create them
4. **Navigation**: Click links to open files in the editor

## Test Links

- [[lecture-1]] - This should open lecture-1.md in both editor and preview
- [[robo_phenomenology]] - This should open the robo phenomenology file
- [[summary]] - This should open the summary file
- [[new-file]] - This should offer to create a new file if it doesn't exist

## Mixed Content

You can mix internal links with regular markdown:

Regular link: [External Link](https://example.com)
Internal link: [[summary]]
**Bold with internal link**: [[lecture-1|Important Lecture]]

Done!