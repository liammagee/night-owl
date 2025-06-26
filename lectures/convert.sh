#!/bin/bash

# Usage: ./convert.sh <input_file.md> <output_format>
# Example: ./convert.sh main.md pdf

INPUT_FILE=$1
OUTPUT_FORMAT=$2

if [ -z "$INPUT_FILE" ] || [ -z "$OUTPUT_FORMAT" ]; then
    echo "Usage: $0 <input_file.md> <output_format>"
    echo "Supported formats: pdf, html"
    exit 1
fi

FILENAME=$(basename -- "$INPUT_FILE")
EXTENSION="${FILENAME##*.}"
FILENAME_NO_EXT="${FILENAME%.*}"

BIB_FILE="references.bib"
CSL_FILE="chicago-author-date.csl"

if [ ! -f "$BIB_FILE" ]; then
    echo "Error: Bibliography file '$BIB_FILE' not found."
    exit 1
fi

if [ ! -f "$CSL_FILE" ]; then
    echo "Error: CSL style file '$CSL_FILE' not found."
    exit 1
fi

pandoc "$INPUT_FILE" \
    --bibliography="$BIB_FILE" \
    --citeproc \
    --csl="$CSL_FILE" \
    -o "${FILENAME_NO_EXT}.${OUTPUT_FORMAT}" \
    --metadata title="${FILENAME_NO_EXT}"

echo "Successfully converted '$INPUT_FILE' to '${FILENAME_NO_EXT}.${OUTPUT_FORMAT}'"
