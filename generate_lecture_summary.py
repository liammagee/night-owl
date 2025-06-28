#!/usr/bin/env python3
"""
Script to parse lectures folder and generate a schematic summary Markdown file
similar to the sample-presentation.md format.
"""

import os
import re
import sys
from pathlib import Path
from typing import List, Dict, Optional

def extract_markdown_headers(content: str) -> List[Dict[str, str]]:
    """Extract headers from markdown content."""
    headers = []
    lines = content.split('\n')
    
    for line in lines:
        line = line.strip()
        if line.startswith('#'):
            level = len(line) - len(line.lstrip('#'))
            title = line.lstrip('#').strip()
            if title:
                headers.append({
                    'level': level,
                    'title': title,
                    'content': line
                })
    
    return headers

def extract_key_concepts(content: str) -> List[str]:
    """Extract key concepts, quotes, and important ideas from content."""
    concepts = []
    lines = content.split('\n')
    
    for line in lines:
        line = line.strip()
        # Extract quoted text
        if line.startswith('>'):
            concepts.append(line)
        # Extract bold concepts
        bold_matches = re.findall(r'\*\*(.*?)\*\*', line)
        concepts.extend([f"**{match}**" for match in bold_matches])
        # Extract italic concepts
        italic_matches = re.findall(r'\*(.*?)\*', line)
        concepts.extend([f"*{match}*" for match in italic_matches if not match.startswith('*')])
    
    return concepts

def parse_lecture_file(file_path: Path) -> Dict:
    """Parse a single lecture file and extract key information."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return {}
    
    if not content.strip():
        return {}
    
    headers = extract_markdown_headers(content)
    concepts = extract_key_concepts(content)
    
    # Get the main title (first level 1 or 2 header)
    main_title = None
    for header in headers:
        if header['level'] <= 2:
            main_title = header['title']
            break
    
    if not main_title and headers:
        main_title = headers[0]['title']
    
    return {
        'filename': file_path.name,
        'title': main_title or file_path.stem,
        'headers': headers,
        'concepts': concepts[:10],  # Limit to first 10 concepts
        'word_count': len(content.split())
    }

def generate_summary_markdown(lectures_data: List[Dict]) -> str:
    """Generate a schematic summary markdown file."""
    
    summary = """# Hegel Pedagogy AI - Lecture Summary
## A Schematic Overview of Course Materials

Welcome to a systematic exploration of the lecture materials in this repository, structured to reveal the philosophical architecture of the course.

---

## Overview of Course Structure

"""
    
    # Add course overview section
    if lectures_data:
        summary += f"This collection contains **{len(lectures_data)} lecture files** covering:\n\n"
        for lecture in lectures_data:
            if lecture.get('title'):
                summary += f"- **{lecture['title']}** ({lecture['filename']})\n"
        
        summary += "\n---\n\n"
    
    # Add individual lecture summaries
    for lecture in lectures_data:
        if not lecture:
            continue
            
        summary += f"## {lecture['title']}\n"
        summary += f"*Source: {lecture['filename']} | ~{lecture['word_count']} words*\n\n"
        
        # Add header structure
        if lecture['headers']:
            summary += "### Key Sections:\n"
            current_level = 0
            for header in lecture['headers'][:8]:  # Limit to first 8 headers
                indent = "  " * (header['level'] - 1)
                summary += f"{indent}- {header['title']}\n"
            summary += "\n"
        
        # Add key concepts
        if lecture['concepts']:
            summary += "### Key Concepts:\n"
            for concept in lecture['concepts'][:6]:  # Limit to first 6 concepts
                summary += f"- {concept}\n"
            summary += "\n"
        
        summary += "---\n\n"
    
    # Add pedagogical reflections
    summary += """## Pedagogical Architecture

### Dialectical Structure
The course materials embody Hegelian dialectical principles through:

1. **Progressive Development**: Building from fundamental concepts to complex applications
2. **Conceptual Integration**: Weaving together philosophy, technology, and pedagogy  
3. **Historical Consciousness**: Connecting classical philosophy to contemporary AI
4. **Practical Application**: Moving from theory to educational implementation

### Thematic Connections
- **Human-Machine Learning Dialectic**: The fundamental tension driving the course
- **Experience and Consciousness**: How subjects form themselves through learning
- **Social and Individual Development**: The interplay of personal and collective learning
- **Continuous vs. Discrete Learning**: Philosophical implications of learning temporality

---

## Course Navigation

### Recommended Reading Order
1. Begin with foundational philosophical concepts
2. Explore the human-machine learning dialectic
3. Investigate practical pedagogical applications
4. Synthesize insights for educational innovation

### Interactive Engagement
This summary serves as a navigational aid for deeper exploration. Each lecture builds upon previous insights while opening new dialectical possibilities.

> "Philosophy is its own time apprehended in thought." - Hegel

**Your philosophical journey through AI pedagogy continues with each connection made between these materials.**

---

*This summary was generated automatically from the lectures folder structure and content.*
"""
    
    return summary

def main():
    """Main function to generate lecture summary."""
    # Get command line arguments
    if len(sys.argv) >= 3:
        lectures_dir = Path(sys.argv[1])
        output_file = Path(sys.argv[2])
    else:
        # Fallback to default behavior
        lectures_dir = Path("lectures")
        output_file = Path("lecture_summary.md")
    
    if not lectures_dir.exists():
        print(f"Lectures directory not found: {lectures_dir}")
        return
    
    lectures_data = []
    
    # Process each markdown file in the lectures directory
    for file_path in lectures_dir.glob("*.md"):
        if file_path.name.lower() in ["readme.md", "summary.md"]:
            continue  # Skip README and existing summary files
            
        lecture_data = parse_lecture_file(file_path)
        if lecture_data:
            lectures_data.append(lecture_data)
    
    # Sort by filename for consistent ordering
    lectures_data.sort(key=lambda x: x.get('filename', ''))
    
    # Generate summary
    summary_content = generate_summary_markdown(lectures_data)
    
    # Write summary file
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(summary_content)
        print(f"Generated summary: {output_file}")
        print(f"Processed {len(lectures_data)} lecture files")
    except Exception as e:
        print(f"Error writing summary file: {e}")

if __name__ == "__main__":
    main()