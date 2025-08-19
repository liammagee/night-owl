// === File Tagging System with YAML Frontmatter ===
// Handles parsing, managing, and filtering files by tags

class TagManager {
    constructor() {
        this.fileTags = new Map(); // Map<filePath, {tags: [], metadata: {}}>
        this.tagIndex = new Map(); // Map<tag, Set<filePath>>
        this.initialized = false;
    }

    // Parse YAML frontmatter from markdown content
    parseFrontmatter(content) {
        if (!content || typeof content !== 'string') {
            return { frontmatter: {}, content: content || '' };
        }

        // Check if content starts with YAML frontmatter (---)
        const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
        const match = content.match(frontmatterRegex);

        if (!match) {
            return { frontmatter: {}, content };
        }

        const yamlContent = match[1];
        const markdownContent = match[2];

        try {
            // Simple YAML parser for basic frontmatter
            const frontmatter = this.parseSimpleYaml(yamlContent);
            return { frontmatter, content: markdownContent };
        } catch (error) {
            console.warn('[TagManager] Error parsing YAML frontmatter:', error);
            return { frontmatter: {}, content };
        }
    }

    // Simple YAML parser for frontmatter (handles basic cases)
    parseSimpleYaml(yamlString) {
        const result = {};
        const lines = yamlString.split('\n');

        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('#')) continue;

            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) continue;

            const key = line.substring(0, colonIndex).trim();
            let value = line.substring(colonIndex + 1).trim();

            // Handle different value types
            if (value.startsWith('[') && value.endsWith(']')) {
                // Array format: [item1, item2, item3]
                value = value.slice(1, -1)
                    .split(',')
                    .map(item => item.trim().replace(/^["']|["']$/g, ''))
                    .filter(item => item.length > 0);
            } else if (value.startsWith('"') && value.endsWith('"')) {
                // Quoted string
                value = value.slice(1, -1);
            } else if (value.startsWith("'") && value.endsWith("'")) {
                // Single quoted string
                value = value.slice(1, -1);
            } else if (value === 'true' || value === 'false') {
                // Boolean
                value = value === 'true';
            } else if (!isNaN(value) && !isNaN(parseFloat(value))) {
                // Number
                value = parseFloat(value);
            }
            // Otherwise keep as string

            result[key] = value;
        }

        return result;
    }

    // Extract tags and metadata from a file
    processFile(filePath, content) {
        const { frontmatter, content: markdownContent } = this.parseFrontmatter(content);
        
        const fileData = {
            tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : 
                  typeof frontmatter.tags === 'string' ? [frontmatter.tags] : [],
            metadata: {
                title: frontmatter.title || null,
                category: frontmatter.category || null,
                author: frontmatter.author || null,
                date: frontmatter.date || null,
                description: frontmatter.description || null,
                ...frontmatter
            },
            content: markdownContent
        };

        // Store file data
        this.fileTags.set(filePath, fileData);

        // Update tag index
        this.updateTagIndex(filePath, fileData.tags);

        return fileData;
    }

    // Update the tag index for faster searching
    updateTagIndex(filePath, tags) {
        // Remove file from old tags
        for (const [tag, files] of this.tagIndex) {
            files.delete(filePath);
            if (files.size === 0) {
                this.tagIndex.delete(tag);
            }
        }

        // Add file to new tags
        for (const tag of tags) {
            if (!this.tagIndex.has(tag)) {
                this.tagIndex.set(tag, new Set());
            }
            this.tagIndex.get(tag).add(filePath);
        }
    }

    // Get all tags with file counts
    getAllTags() {
        const tagStats = [];
        for (const [tag, files] of this.tagIndex) {
            tagStats.push({
                tag,
                count: files.size,
                files: Array.from(files)
            });
        }
        return tagStats.sort((a, b) => b.count - a.count);
    }

    // Get tags for a specific file
    getFileTags(filePath) {
        const fileData = this.fileTags.get(filePath);
        return fileData ? fileData.tags : [];
    }

    // Get metadata for a specific file
    getFileMetadata(filePath) {
        const fileData = this.fileTags.get(filePath);
        return fileData ? fileData.metadata : {};
    }

    // Find files by tag(s)
    findFilesByTags(tags, matchAll = false) {
        if (!Array.isArray(tags)) {
            tags = [tags];
        }

        if (tags.length === 0) {
            return Array.from(this.fileTags.keys());
        }

        let result = new Set();

        if (matchAll) {
            // Find files that have ALL tags
            const firstTag = tags[0];
            if (this.tagIndex.has(firstTag)) {
                result = new Set(this.tagIndex.get(firstTag));
                
                for (let i = 1; i < tags.length; i++) {
                    const tag = tags[i];
                    if (this.tagIndex.has(tag)) {
                        const tagFiles = this.tagIndex.get(tag);
                        result = new Set([...result].filter(file => tagFiles.has(file)));
                    } else {
                        return []; // If any tag doesn't exist, no files match
                    }
                }
            }
        } else {
            // Find files that have ANY of the tags
            for (const tag of tags) {
                if (this.tagIndex.has(tag)) {
                    for (const file of this.tagIndex.get(tag)) {
                        result.add(file);
                    }
                }
            }
        }

        return Array.from(result);
    }

    // Search files by tag patterns
    searchTags(query) {
        const lowercaseQuery = query.toLowerCase();
        const matchingTags = [];

        for (const tag of this.tagIndex.keys()) {
            if (tag.toLowerCase().includes(lowercaseQuery)) {
                matchingTags.push({
                    tag,
                    count: this.tagIndex.get(tag).size
                });
            }
        }

        return matchingTags.sort((a, b) => b.count - a.count);
    }

    // Add tags to a file
    addTagsToFile(filePath, newTags) {
        const fileData = this.fileTags.get(filePath);
        if (!fileData) return false;

        const currentTags = new Set(fileData.tags);
        for (const tag of newTags) {
            currentTags.add(tag);
        }

        fileData.tags = Array.from(currentTags);
        this.updateTagIndex(filePath, fileData.tags);
        return true;
    }

    // Remove tags from a file
    removeTagsFromFile(filePath, tagsToRemove) {
        const fileData = this.fileTags.get(filePath);
        if (!fileData) return false;

        fileData.tags = fileData.tags.filter(tag => !tagsToRemove.includes(tag));
        this.updateTagIndex(filePath, fileData.tags);
        return true;
    }

    // Generate YAML frontmatter for a file
    generateFrontmatter(metadata, tags) {
        const lines = ['---'];
        
        // Add title if present
        if (metadata.title) {
            lines.push(`title: "${metadata.title}"`);
        }

        // Add tags if present
        if (tags && tags.length > 0) {
            const formattedTags = tags.map(tag => `"${tag}"`).join(', ');
            lines.push(`tags: [${formattedTags}]`);
        }

        // Add other metadata
        for (const [key, value] of Object.entries(metadata)) {
            if (key === 'title' || key === 'tags') continue; // Already handled
            
            if (typeof value === 'string') {
                lines.push(`${key}: "${value}"`);
            } else if (Array.isArray(value)) {
                const formattedArray = value.map(item => `"${item}"`).join(', ');
                lines.push(`${key}: [${formattedArray}]`);
            } else {
                lines.push(`${key}: ${value}`);
            }
        }

        lines.push('---', '');
        return lines.join('\n');
    }

    // Update file with new frontmatter
    updateFileFrontmatter(filePath, newMetadata, newTags) {
        const fileData = this.fileTags.get(filePath);
        if (!fileData) return null;

        // Update internal data
        fileData.metadata = { ...fileData.metadata, ...newMetadata };
        fileData.tags = newTags || fileData.tags;
        this.updateTagIndex(filePath, fileData.tags);

        // Generate new content with updated frontmatter
        const frontmatter = this.generateFrontmatter(fileData.metadata, fileData.tags);
        const newContent = frontmatter + fileData.content;

        return newContent;
    }

    // Clear all data
    clear() {
        this.fileTags.clear();
        this.tagIndex.clear();
    }

    // Get statistics
    getStats() {
        return {
            totalFiles: this.fileTags.size,
            totalTags: this.tagIndex.size,
            taggedFiles: Array.from(this.fileTags.values()).filter(data => data.tags.length > 0).length,
            averageTagsPerFile: this.fileTags.size > 0 ? 
                Array.from(this.fileTags.values()).reduce((sum, data) => sum + data.tags.length, 0) / this.fileTags.size : 0
        };
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.TagManager = TagManager;
}

// Create global instance
const tagManager = new TagManager();
if (typeof window !== 'undefined') {
    window.tagManager = tagManager;
}

// console.log('[TagManager] Tag management system initialized');