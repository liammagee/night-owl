// File filtering utilities for visualization views
// Supports glob patterns for include/exclude filtering

// Simple glob pattern matching
function matchGlob(pattern, str) {
    // Handle empty or invalid patterns
    if (!pattern || !str) return false;
    
    // Convert glob pattern to regex step by step
    let regexPattern = pattern;
    
    // Step 1: Replace ** with a unique placeholder
    regexPattern = regexPattern.replace(/\*\*/g, '§DOUBLESTAR§');
    
    // Step 2: Replace single * with a unique placeholder 
    regexPattern = regexPattern.replace(/\*/g, '§SINGLESTAR§');
    
    // Step 3: Escape all regex special characters
    regexPattern = regexPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    
    // Step 4: Replace placeholders with appropriate regex
    regexPattern = regexPattern.replace(/§DOUBLESTAR§/g, '.*');      // ** matches anything
    regexPattern = regexPattern.replace(/§SINGLESTAR§/g, '[^/\\\\]*'); // * matches anything except path separators
    
    // Step 5: Add anchors
    regexPattern = '^' + regexPattern + '$';
    
    try {
        const regex = new RegExp(regexPattern, 'i'); // Case insensitive
        const result = regex.test(str);
        // Only log detailed pattern info if enabled for debugging
        // console.log(`[FileFilters] Pattern "${pattern}" -> regex "${regexPattern}" -> testing "${str}" = ${result}`);
        return result;
    } catch (error) {
        console.warn('[FileFilters] Invalid glob pattern:', pattern, error);
        return false;
    }
}

// Check if a file matches any of the patterns
function matchesAnyPattern(fileItem, patterns) {
    if (!patterns || patterns.length === 0) return false;
    
    // Extract file path from file item (could be string or object)
    const filePath = typeof fileItem === 'string' ? fileItem : (fileItem.path || fileItem.filePath || fileItem.name || String(fileItem));
    
    // Ensure filePath is a string
    if (typeof filePath !== 'string') {
        console.warn('[FileFilters] Invalid file path type:', typeof filePath, fileItem);
        return false;
    }
    
    return patterns.some(pattern => {
        if (!pattern.trim()) return false;
        
        const trimmedPattern = pattern.trim();
        
        const normalizedFullPath = filePath.replace(/\\/g, '/');
        const justFilename = normalizedFullPath.split('/').pop();

        // Prefer explicit relativePath from IPC (relative to working directory)
        const relativeCandidates = [];
        if (fileItem && typeof fileItem === 'object' && typeof fileItem.relativePath === 'string') {
            relativeCandidates.push(fileItem.relativePath.replace(/\\/g, '/'));
        }

        // Backward-compatible: infer a lectures-relative path (keeps "lectures/" prefix)
        const lecturesIndex = normalizedFullPath.toLowerCase().lastIndexOf('/lectures/');
        if (lecturesIndex !== -1) {
            relativeCandidates.push(normalizedFullPath.slice(lecturesIndex + 1)); // "lectures/..."
        }
        
        // Test all variations
        const fullPathMatch = matchGlob(trimmedPattern, normalizedFullPath);
        const relativePathMatch = relativeCandidates.some(candidate => matchGlob(trimmedPattern, candidate));
        const filenameMatch = matchGlob(trimmedPattern, justFilename);
        
        // Only log if there's a match to reduce noise
        if (fullPathMatch || relativePathMatch || filenameMatch) {
            console.log(`[FileFilters] ✓ Pattern "${trimmedPattern}" matched "${filePath}"`);
        }
        
        return fullPathMatch || relativePathMatch || filenameMatch;
    });
}

// Main filtering function
function filterVisualizationFiles(allFiles, includePatterns = [], excludePatterns = []) {
    if (!allFiles || allFiles.length === 0) {
        console.log('[FileFilters] No files to filter');
        return [];
    }
    
    console.log(`[FileFilters] Filtering ${allFiles.length} files with patterns:`, {
        include: includePatterns,
        exclude: excludePatterns
    });
    
    // Start with all files
    let filteredFiles = [...allFiles];
    
    // Apply include patterns (if any)
    if (includePatterns && includePatterns.length > 0) {
        const beforeCount = filteredFiles.length;
        filteredFiles = filteredFiles.filter(file => {
            return matchesAnyPattern(file, includePatterns);
        });
        console.log(`[FileFilters] Include patterns filtered ${beforeCount} files down to ${filteredFiles.length}`);
    }
    
    // Apply exclude patterns (if any)
    if (excludePatterns && excludePatterns.length > 0) {
        const beforeCount = filteredFiles.length;
        filteredFiles = filteredFiles.filter(file => {
            return !matchesAnyPattern(file, excludePatterns); // Keep files that DON'T match exclude patterns
        });
        console.log(`[FileFilters] Exclude patterns filtered ${beforeCount} files down to ${filteredFiles.length}`);
    }
    
    console.log(`[FileFilters] Filtered ${allFiles.length} files down to ${filteredFiles.length} files`);
    
    return filteredFiles;
}

// Get visualization settings from app settings
async function getVisualizationFilters() {
    try {
        const settings = await window.electronAPI.invoke('get-settings');
        const vizSettings = settings?.visualization || {};
        
        return {
            includePatterns: vizSettings.includePatterns || ['lectures/**/*.md', '**/*.md', '**/*.markdown'],
            excludePatterns: vizSettings.excludePatterns || ['**/test/**', '**/tests/**', 'HELP.md', 'README.md', '**/node_modules/**'],
            cacheExpiryHours: vizSettings.cacheExpiryHours || 24,
            changeThreshold: vizSettings.changeThreshold || 0.15
        };
    } catch (error) {
        console.error('[FileFilters] Error getting visualization settings:', error);
        // Return defaults
        return {
            includePatterns: ['lectures/**/*.md', '**/*.md', '**/*.markdown'],
            excludePatterns: ['**/test/**', '**/tests/**', 'HELP.md', 'README.md', '**/node_modules/**'],
            cacheExpiryHours: 24,
            changeThreshold: 0.15
        };
    }
}

// Get filtered files for visualization views
async function getFilteredVisualizationFiles() {
    try {
        // Get all files
        const allFiles = await window.electronAPI.invoke('get-available-files');
        
        console.log('[FileFilters] Raw files from get-available-files:', allFiles.slice(0, 10)); // Show first 10 for debugging
        
        // Get filter settings
        const filters = await getVisualizationFilters();
        
        console.log('[FileFilters] Filter settings:', filters);
        
        // Apply filters
        const filteredFiles = filterVisualizationFiles(
            allFiles, 
            filters.includePatterns, 
            filters.excludePatterns
        );
        
        return {
            files: filteredFiles,
            filters: filters,
            totalFiles: allFiles.length
        };
    } catch (error) {
        console.error('[FileFilters] Error getting filtered files:', error);
        throw error;
    }
}

// Export for global use
window.filterVisualizationFiles = filterVisualizationFiles;
window.getVisualizationFilters = getVisualizationFilters;
window.getFilteredVisualizationFiles = getFilteredVisualizationFiles;
window.matchGlob = matchGlob;
