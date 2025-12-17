#!/usr/bin/env python3
"""
Docling PDF to Markdown Converter Script

This script converts PDF documents to Markdown using IBM's Docling library.
It handles:
- Basic PDF to Markdown conversion
- Complex layouts, tables, and formulas
- Progress reporting via stderr
- Error handling and graceful degradation

Usage:
    python docling-convert.py <input.pdf> [output.md]

If output.md is not specified, outputs to stdout.

Requirements:
    pip install docling
"""

import sys
import os
import json
from pathlib import Path

def check_docling_installed():
    """Check if docling is installed and return version info."""
    try:
        import docling
        return True, getattr(docling, '__version__', 'unknown')
    except ImportError:
        return False, None

def convert_pdf_to_markdown(pdf_path, output_path=None, verbose=False):
    """
    Convert a PDF file to Markdown using Docling.

    Args:
        pdf_path: Path to the input PDF file
        output_path: Optional path for output markdown file
        verbose: If True, print progress to stderr

    Returns:
        dict with success status, markdown content, and metadata
    """
    from docling.document_converter import DocumentConverter

    result = {
        'success': False,
        'markdown': '',
        'error': None,
        'metadata': {}
    }

    try:
        # Validate input file exists
        pdf_path = Path(pdf_path)
        if not pdf_path.exists():
            result['error'] = f"File not found: {pdf_path}"
            return result

        if not pdf_path.suffix.lower() == '.pdf':
            result['error'] = f"Not a PDF file: {pdf_path}"
            return result

        if verbose:
            print(f"[docling] Converting: {pdf_path}", file=sys.stderr)

        # Initialize converter
        converter = DocumentConverter()

        # Convert the document
        if verbose:
            print("[docling] Processing document...", file=sys.stderr)

        conversion_result = converter.convert(str(pdf_path))

        # Export to markdown
        markdown_content = conversion_result.document.export_to_markdown()

        if verbose:
            print(f"[docling] Conversion complete. {len(markdown_content)} characters", file=sys.stderr)

        result['success'] = True
        result['markdown'] = markdown_content
        result['metadata'] = {
            'source_file': str(pdf_path),
            'source_filename': pdf_path.name,
            'markdown_length': len(markdown_content)
        }

        # Write to output file if specified
        if output_path:
            output_path = Path(output_path)
            output_path.write_text(markdown_content, encoding='utf-8')
            result['metadata']['output_file'] = str(output_path)
            if verbose:
                print(f"[docling] Saved to: {output_path}", file=sys.stderr)

        return result

    except Exception as e:
        result['error'] = str(e)
        if verbose:
            print(f"[docling] Error: {e}", file=sys.stderr)
        return result

def main():
    """Main entry point for CLI usage."""
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python docling-convert.py <input.pdf> [output.md]'
        }))
        sys.exit(1)

    # Check if docling is installed
    installed, version = check_docling_installed()
    if not installed:
        print(json.dumps({
            'success': False,
            'error': 'Docling is not installed. Install with: pip install docling',
            'install_command': 'pip install docling'
        }))
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    # Check for --json flag for machine-readable output
    json_output = '--json' in sys.argv
    verbose = '--verbose' in sys.argv or '-v' in sys.argv

    result = convert_pdf_to_markdown(pdf_path, output_path, verbose=verbose)

    if json_output or not result['success']:
        # Output JSON for programmatic use
        print(json.dumps(result, indent=2))
    else:
        # Output just the markdown for piping
        if output_path:
            print(f"Converted {pdf_path} to {output_path}")
        else:
            print(result['markdown'])

    sys.exit(0 if result['success'] else 1)

if __name__ == '__main__':
    main()
