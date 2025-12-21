#!/usr/bin/env node
/**
 * Thumbnail Generator using Google Nano Banana (Gemini 2.5 Flash Image)
 *
 * Analyzes markdown files and generates appropriate thumbnails that summarize the content.
 * Can be used as a standalone CLI tool or invoked from the NightOwl interface.
 *
 * Usage:
 *   node scripts/generate-thumbnail.js <file-or-folder> [options]
 *
 * Options:
 *   --output, -o     Output directory for thumbnails (default: same as input)
 *   --size, -s       Image size: small (256), medium (512), large (1024) (default: medium)
 *   --style          Style: photo, illustration, abstract, minimal (default: illustration)
 *   --format, -f     Output format: png, jpg, webp (default: png)
 *   --recursive, -r  Process folders recursively
 *   --dry-run        Show what would be generated without creating files
 *   --json           Output results as JSON (for programmatic use)
 *
 * Environment:
 *   GEMINI_API_KEY   Required. Your Google AI API key.
 *
 * Examples:
 *   node scripts/generate-thumbnail.js ./markdown/lectures/week-01.md
 *   node scripts/generate-thumbnail.js ./markdown/lectures -r --style abstract
 *   node scripts/generate-thumbnail.js ./docs --output ./thumbnails --size large
 */

import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
    model: 'gemini-2.5-flash-preview-05-20',  // Image generation model
    imageModel: 'imagen-3.0-generate-002',     // Imagen model for actual image generation
    sizes: {
        small: { width: 256, height: 256 },
        medium: { width: 512, height: 512 },
        large: { width: 1024, height: 1024 }
    },
    styles: {
        photo: 'photorealistic, high quality photograph',
        illustration: 'digital illustration, clean lines, modern style',
        abstract: 'abstract art, geometric shapes, vibrant colors',
        minimal: 'minimalist design, simple shapes, limited color palette'
    }
};

// Parse command line arguments
function parseArgs(args) {
    const options = {
        input: null,
        output: null,
        size: 'medium',
        style: 'illustration',
        format: 'png',
        recursive: false,
        dryRun: false,
        json: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--output' || arg === '-o') {
            options.output = args[++i];
        } else if (arg === '--size' || arg === '-s') {
            options.size = args[++i];
        } else if (arg === '--style') {
            options.style = args[++i];
        } else if (arg === '--format' || arg === '-f') {
            options.format = args[++i];
        } else if (arg === '--recursive' || arg === '-r') {
            options.recursive = true;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--json') {
            options.json = true;
        } else if (arg === '--help' || arg === '-h') {
            showHelp();
            process.exit(0);
        } else if (!arg.startsWith('-') && !options.input) {
            options.input = arg;
        }
    }

    return options;
}

function showHelp() {
    console.log(`
Thumbnail Generator - Generate AI thumbnails from Markdown content

Usage: node scripts/generate-thumbnail.js <file-or-folder> [options]

Options:
  --output, -o     Output directory for thumbnails (default: same as input)
  --size, -s       Image size: small (256), medium (512), large (1024)
  --style          Style: photo, illustration, abstract, minimal
  --format, -f     Output format: png, jpg, webp
  --recursive, -r  Process folders recursively
  --dry-run        Show what would be generated without creating files
  --json           Output results as JSON
  --help, -h       Show this help message

Environment:
  GEMINI_API_KEY   Required. Your Google AI API key.

Examples:
  node scripts/generate-thumbnail.js ./docs/intro.md
  node scripts/generate-thumbnail.js ./lectures -r --style abstract
  node scripts/generate-thumbnail.js ./content --output ./thumbnails --size large
`);
}

// Load environment variables
function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match && !process.env[match[1]]) {
                process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
            }
        }
    }
}

// Find markdown files
function findMarkdownFiles(inputPath, recursive = false) {
    const files = [];
    const stat = fs.statSync(inputPath);

    if (stat.isFile()) {
        if (inputPath.endsWith('.md')) {
            files.push(inputPath);
        }
    } else if (stat.isDirectory()) {
        const entries = fs.readdirSync(inputPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(inputPath, entry.name);

            if (entry.isFile() && entry.name.endsWith('.md')) {
                files.push(fullPath);
            } else if (entry.isDirectory() && recursive && !entry.name.startsWith('.')) {
                files.push(...findMarkdownFiles(fullPath, recursive));
            }
        }
    }

    return files;
}

// Extract key content from markdown for summarization
function extractContentSummary(markdown) {
    // Remove frontmatter
    let content = markdown.replace(/^---[\s\S]*?---\n?/, '');

    // Extract title (first H1)
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : null;

    // Extract headings for structure
    const headings = [];
    const headingRegex = /^#{1,3}\s+(.+)$/gm;
    let match;
    while ((match = headingRegex.exec(content)) !== null) {
        headings.push(match[1]);
    }

    // Remove code blocks and links
    content = content.replace(/```[\s\S]*?```/g, '');
    content = content.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    content = content.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');

    // Get first few paragraphs
    const paragraphs = content
        .split(/\n\n+/)
        .filter(p => p.trim() && !p.startsWith('#'))
        .slice(0, 3)
        .join('\n\n');

    // Extract key terms (words that appear multiple times or are capitalized)
    const words = content.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const wordCounts = {};
    for (const word of words) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
    const keyTerms = Object.entries(wordCounts)
        .filter(([_, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word]) => word);

    return {
        title,
        headings: headings.slice(0, 5),
        excerpt: paragraphs.slice(0, 500),
        keyTerms
    };
}

// Generate image prompt from content analysis
async function generateImagePrompt(ai, contentSummary, style) {
    const styleDescription = CONFIG.styles[style] || CONFIG.styles.illustration;

    const analysisPrompt = `Analyze this document content and suggest a single compelling visual concept for a thumbnail image.

Document Title: ${contentSummary.title || 'Untitled'}
Key Sections: ${contentSummary.headings.join(', ') || 'None'}
Key Terms: ${contentSummary.keyTerms.join(', ') || 'None'}
Excerpt: ${contentSummary.excerpt || 'No content'}

Create a brief (1-2 sentence) image generation prompt that captures the essence of this document.
The image should be ${styleDescription}.
Focus on abstract or symbolic representation rather than literal text.
Do not include any text or words in the image.

Respond with ONLY the image prompt, nothing else.`;

    try {
        const response = await ai.models.generateContent({
            model: CONFIG.model,
            contents: analysisPrompt
        });

        const promptText = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        return promptText || `${styleDescription} representing ${contentSummary.title || 'a document'}`;
    } catch (error) {
        console.error('Error generating prompt:', error.message);
        // Fallback to basic prompt
        return `${styleDescription} representing ${contentSummary.title || 'knowledge and learning'}`;
    }
}

// Generate thumbnail image using Imagen
async function generateThumbnail(ai, prompt, options) {
    const size = CONFIG.sizes[options.size] || CONFIG.sizes.medium;

    try {
        // Use Imagen for image generation
        const response = await ai.models.generateImages({
            model: CONFIG.imageModel,
            prompt: prompt,
            config: {
                numberOfImages: 1,
                aspectRatio: '1:1',
                outputOptions: {
                    mimeType: options.format === 'jpg' ? 'image/jpeg' : 'image/png'
                }
            }
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
            const imageData = response.generatedImages[0].image;
            if (imageData && imageData.imageBytes) {
                return Buffer.from(imageData.imageBytes, 'base64');
            }
        }

        throw new Error('No image data in response');
    } catch (error) {
        // If Imagen fails, try using Gemini Flash with image generation
        console.error('Imagen generation failed, trying Gemini Flash:', error.message);

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-preview-05-20',
                contents: `Generate an image: ${prompt}`,
                config: {
                    responseModalities: ['IMAGE', 'TEXT']
                }
            });

            // Check for image in response
            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData && part.inlineData.data) {
                    return Buffer.from(part.inlineData.data, 'base64');
                }
            }
        } catch (flashError) {
            console.error('Gemini Flash generation also failed:', flashError.message);
        }

        throw error;
    }
}

// Process a single file
async function processFile(ai, filePath, options) {
    const result = {
        input: filePath,
        output: null,
        prompt: null,
        success: false,
        error: null
    };

    try {
        // Read markdown content
        const content = fs.readFileSync(filePath, 'utf-8');

        // Extract summary
        const summary = extractContentSummary(content);

        // Generate image prompt
        const imagePrompt = await generateImagePrompt(ai, summary, options.style);
        result.prompt = imagePrompt;

        if (!options.json) {
            console.log(`\n📄 ${path.basename(filePath)}`);
            console.log(`   Title: ${summary.title || 'Untitled'}`);
            console.log(`   Prompt: ${imagePrompt.slice(0, 80)}...`);
        }

        if (options.dryRun) {
            result.success = true;
            result.output = '[dry run]';
            return result;
        }

        // Generate thumbnail
        const imageBuffer = await generateThumbnail(ai, imagePrompt, options);

        // Determine output path
        const inputDir = path.dirname(filePath);
        const baseName = path.basename(filePath, '.md');
        const outputDir = options.output || inputDir;
        const outputPath = path.join(outputDir, `${baseName}-thumbnail.${options.format}`);

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Write image
        fs.writeFileSync(outputPath, imageBuffer);

        result.output = outputPath;
        result.success = true;

        if (!options.json) {
            console.log(`   ✅ Generated: ${outputPath}`);
        }

    } catch (error) {
        result.error = error.message;
        if (!options.json) {
            console.error(`   ❌ Error: ${error.message}`);
        }
    }

    return result;
}

// Main function
async function main() {
    loadEnv();

    const args = process.argv.slice(2);
    const options = parseArgs(args);

    if (!options.input) {
        console.error('Error: Please specify a file or folder to process.');
        console.error('Use --help for usage information.');
        process.exit(1);
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
        console.error('Error: GEMINI_API_KEY environment variable is required.');
        console.error('Set it in your .env file or export it in your shell.');
        process.exit(1);
    }

    // Validate input path
    if (!fs.existsSync(options.input)) {
        console.error(`Error: Path not found: ${options.input}`);
        process.exit(1);
    }

    // Validate options
    if (!CONFIG.sizes[options.size]) {
        console.error(`Error: Invalid size. Use: ${Object.keys(CONFIG.sizes).join(', ')}`);
        process.exit(1);
    }

    if (!CONFIG.styles[options.style]) {
        console.error(`Error: Invalid style. Use: ${Object.keys(CONFIG.styles).join(', ')}`);
        process.exit(1);
    }

    // Initialize AI client
    const ai = new GoogleGenAI({ apiKey });

    // Find files to process
    const files = findMarkdownFiles(options.input, options.recursive);

    if (files.length === 0) {
        console.error('No markdown files found.');
        process.exit(1);
    }

    if (!options.json) {
        console.log(`\n🎨 Thumbnail Generator`);
        console.log(`   Style: ${options.style}`);
        console.log(`   Size: ${options.size}`);
        console.log(`   Files: ${files.length}`);
        if (options.dryRun) {
            console.log(`   Mode: DRY RUN`);
        }
    }

    // Process each file
    const results = [];
    for (const file of files) {
        const result = await processFile(ai, file, options);
        results.push(result);
    }

    // Output summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    if (options.json) {
        console.log(JSON.stringify({
            total: files.length,
            successful,
            failed,
            results
        }, null, 2));
    } else {
        console.log(`\n📊 Summary: ${successful} successful, ${failed} failed`);
    }

    process.exit(failed > 0 ? 1 : 0);
}

// Run if called directly
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

// Export for programmatic use
export { processFile, extractContentSummary, generateImagePrompt, CONFIG };
