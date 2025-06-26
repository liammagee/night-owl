# Markdown to PDF/HTML Conversion

This directory contains a script to convert Markdown files into beautifully formatted PDF or HTML documents with proper citations.

## Dependencies

Before you can use the conversion script, you need to install two essential tools:

1.  **Pandoc**: A universal document converter. You can install it via Homebrew on macOS:
    ```sh
    brew install pandoc
    ```

2.  **MacTeX**: A full LaTeX distribution, which is required by Pandoc to create PDF files. You can install it via Homebrew as well:
    ```sh
    brew install --cask mactex
    ```
    *Note: MacTeX is a large download (over 4GB), so it may take some time to install.*

## Usage

The `convert.sh` script handles the conversion process. It requires two arguments: the input Markdown file and the desired output format (`pdf` or `html`).

### Make the script executable:
First, you need to give the script permission to run:
```sh
chmod +x convert.sh
```

### Run the script:
To convert `main.md` to a PDF, run:
```sh
./convert.sh main.md pdf
```

To convert `main.md` to an HTML file, run:
```sh
./convert.sh main.md html
```

The script will automatically find the `references.bib` file for citations and use the `chicago-author-date.csl` style for formatting. The output file will be created in the same directory with the same base name (e.g., `main.pdf` or `main.html`).
