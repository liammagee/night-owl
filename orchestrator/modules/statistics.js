/**
 * Statistics Module
 * Calculates and displays document and project-wide statistics
 * including word counts, readability metrics, and content analysis.
 *
 * @module statistics
 */

// --- Module State ---
/** @type {string} Current statistics scope ('document' or 'project') */
let currentStatsScope = 'document';

/**
 * Switch between document and project statistics scope
 * Updates UI button states and refreshes the statistics pane
 *
 * @param {string} scope - The scope to switch to ('document' or 'project')
 */
function switchStatsScope(scope) {
    const documentBtn = document.getElementById('stats-scope-document');
    const projectBtn = document.getElementById('stats-scope-project');

    if (!documentBtn || !projectBtn) return;

    currentStatsScope = scope;

    // Clear any legacy inline styles and rely on token-based CSS classes
    documentBtn.style.background = '';
    documentBtn.style.color = '';
    projectBtn.style.background = '';
    projectBtn.style.color = '';

    // Update button states
    if (scope === 'document') {
        documentBtn.classList.add('active');
        projectBtn.classList.remove('active');
    } else {
        projectBtn.classList.add('active');
        documentBtn.classList.remove('active');
    }

    // Update statistics
    updateStatisticsPane();
}

/**
 * Update the statistics pane with current document or project statistics
 * Calculates and renders statistics based on current scope
 */
async function updateStatisticsPane() {
    const statisticsContent = document.getElementById('statistics-content');
    if (!statisticsContent) return;

    try {
        let stats;

        if (currentStatsScope === 'project') {
            // Calculate project-wide statistics
            statisticsContent.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">Analyzing project files...</p>';
            stats = await calculateProjectStatistics();
        } else {
            // Calculate current document statistics
            let content = '';
            if (window.editor && typeof window.editor.getValue === 'function') {
                content = window.editor.getValue();
            } else if (window.fallbackEditor) {
                content = window.fallbackEditor.value;
            }

            if (!content.trim()) {
                statisticsContent.innerHTML = `
                    <p style="color: #666; text-align: center; padding: 20px;">
                        No document content to analyze.<br>
                        <small>Open or create a markdown file to see statistics.</small>
                    </p>
                `;
                return;
            }

            stats = calculateBasicStatistics(content);
        }

        // Ensure stats object exists and has required properties
        if (!stats) {
            console.error('[Statistics] Stats calculation returned undefined');
            stats = {
                wordCount: 0,
                charCount: 0,
                paragraphCount: 0,
                headingCount: 0,
                sentenceCount: 0,
                averageSentenceLength: 0,
                averageWordLength: 0,
                readingTime: 0,
                presentationTime: 0,
                slideCount: 0,
                notesCount: 0,
                listCount: 0,
                linkCount: 0,
                codeBlockCount: 0,
                imageCount: 0
            };
        }

        const formatTime = (minutes) => {
            if (minutes < 60) return `${minutes}m`;
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return `${hours}h ${remainingMinutes}m`;
        };

        const scopeTitle = currentStatsScope === 'project' ? 'Project Overview' : 'Document Overview';
        const scopeIcon = currentStatsScope === 'project' ? '' : '';

        statisticsContent.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <!-- Overview -->
                <div style="background: #f8f9ff; border-radius: 8px; padding: 12px; border-left: 4px solid #007bff;">
                    <h4 style="margin: 0 0 8px 0; color: #007bff; font-size: 14px;">${scopeIcon} ${scopeTitle}</h4>
                    <div style="font-size: 12px; display: flex; flex-direction: column; gap: 4px;">
                        ${currentStatsScope === 'project' ? `
                        <div style="display: flex; justify-content: space-between;">
                            <span>Markdown Files:</span>
                            <span style="font-weight: bold;">${stats.fileCount}</span>
                        </div>
                        ` : ''}
                        <div style="display: flex; justify-content: space-between;">
                            <span>Total Words:</span>
                            <span style="font-weight: bold;">${(stats.wordCount || 0).toLocaleString()}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Characters:</span>
                            <span style="font-weight: bold;">${(stats.charCount || 0).toLocaleString()}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Paragraphs:</span>
                            <span style="font-weight: bold;">${stats.paragraphCount || 0}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Headings:</span>
                            <span style="font-weight: bold;">${stats.headingCount || 0}</span>
                        </div>
                    </div>
                </div>

                <!-- Presentation Stats -->
                <div style="background: #f8fff8; border-radius: 8px; padding: 12px; border-left: 4px solid #28a745;">
                    <h4 style="margin: 0 0 8px 0; color: #28a745; font-size: 14px;">${currentStatsScope === 'project' ? 'Project' : 'Presentation'} Analysis</h4>
                    <div style="font-size: 12px; display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span>Slide Markers:</span>
                            <span style="font-weight: bold;">${stats.slideCount || 0}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Speaker Notes:</span>
                            <span style="font-weight: bold;">${stats.notesCount || 0}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Est. Reading Time:</span>
                            <span style="font-weight: bold;">${formatTime(stats.readingTime || 0)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Est. Presentation:</span>
                            <span style="font-weight: bold;">${formatTime(stats.presentationTime || 0)}</span>
                        </div>
                    </div>
                </div>

                <!-- Readability Analysis -->
                <div style="background: #fff0f5; border-radius: 8px; padding: 12px; border-left: 4px solid #e91e63;">
                    <h4 style="margin: 0 0 8px 0; color: #e91e63; font-size: 14px;">Readability</h4>
                    <div style="font-size: 12px; display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span>Sentences:</span>
                            <span style="font-weight: bold;">${stats.sentenceCount || 0}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Avg Sentence Length:</span>
                            <span style="font-weight: bold;">${stats.averageSentenceLength || 0} words</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Avg Word Length:</span>
                            <span style="font-weight: bold;">${stats.averageWordLength || 0} chars</span>
                        </div>
                    </div>
                </div>

                <!-- Content Analysis -->
                <div style="background: #fffaf0; border-radius: 8px; padding: 12px; border-left: 4px solid #ffc107;">
                    <h4 style="margin: 0 0 8px 0; color: #856404; font-size: 14px;">Content Breakdown</h4>
                    <div style="font-size: 12px; display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span>Lists:</span>
                            <span style="font-weight: bold;">${stats.listCount || 0}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Links:</span>
                            <span style="font-weight: bold;">${stats.linkCount || 0}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Code Blocks:</span>
                            <span style="font-weight: bold;">${stats.codeBlockCount || 0}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Images:</span>
                            <span style="font-weight: bold;">${stats.imageCount || 0}</span>
                        </div>
                    </div>
                </div>

            </div>
        `;

    } catch (error) {
        console.error('Error calculating statistics:', error);
        statisticsContent.innerHTML = `
            <p style="color: #dc3545; text-align: center; padding: 20px;">
                Error calculating statistics: ${error.message}
            </p>
        `;
    }
}

/**
 * Calculate basic statistics from markdown content
 *
 * @param {string} content - The markdown content to analyze
 * @returns {Object} Statistics object containing all calculated metrics
 */
function calculateBasicStatistics(content) {
    const lines = content.split('\n');

    // Clean text content (remove markdown syntax for readability analysis)
    const cleanText = content
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/`[^`]+`/g, '') // Remove inline code
        .replace(/\[[^\]]*\]\([^)]*\)/g, '') // Remove links
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // Remove images
        .replace(/[#*_`\[\]()]/g, ' ') // Remove markdown symbols
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

    // Word count
    const wordCount = cleanText ? cleanText.split(' ').length : 0;

    // Character count
    const charCount = content.length;

    // Sentence count and average sentence length
    const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceCount = sentences.length;
    const averageSentenceLength = sentenceCount > 0 ? Math.round(wordCount / sentenceCount) : 0;

    // Paragraph count (non-empty lines that aren't headings or list items)
    const paragraphCount = lines.filter(line =>
        line.trim() &&
        !line.startsWith('#') &&
        !line.startsWith('*') &&
        !line.startsWith('-') &&
        !line.startsWith('+') &&
        !line.match(/^\d+\./) &&
        !line.match(/^```/)
    ).length;

    // Heading count
    const headingCount = lines.filter(line => line.startsWith('#')).length;

    // Slide markers (---SLIDE--- or similar)
    const slideCount = (content.match(/---SLIDE---|^\s*---\s*$/gm) || []).length;

    // Speaker notes blocks
    const notesCount = (content.match(/```notes/g) || []).length;

    // Lists
    const listCount = lines.filter(line =>
        line.match(/^\s*[-*+]\s+/) || line.match(/^\s*\d+\.\s+/)
    ).length;

    // Links
    const linkCount = (content.match(/\[.*?\]\(.*?\)/g) || []).length;

    // Code blocks
    const codeBlockCount = (content.match(/```/g) || []).length / 2;

    // Images
    const imageCount = (content.match(/!\[.*?\]\(.*?\)/g) || []).length;

    // Estimated reading time (200 words per minute)
    const readingTime = Math.ceil(wordCount / 200);

    // Estimated presentation time (slower than reading, ~150 words per minute)
    const presentationTime = Math.ceil(wordCount / 150);

    // Basic readability metrics
    const averageWordLength = wordCount > 0 ? Math.round((cleanText.replace(/\s/g, '').length) / wordCount * 10) / 10 : 0;

    return {
        wordCount,
        charCount,
        sentenceCount,
        averageSentenceLength,
        averageWordLength,
        paragraphCount,
        headingCount,
        slideCount: slideCount || Math.ceil(headingCount / 2), // Fallback estimate
        notesCount,
        listCount,
        linkCount,
        codeBlockCount: Math.floor(codeBlockCount),
        imageCount,
        readingTime,
        presentationTime,
        cleanText // For AI analysis
    };
}

/**
 * Calculate project-wide statistics by aggregating all markdown files
 *
 * @returns {Promise<Object>} Aggregated statistics for the entire project
 */
async function calculateProjectStatistics() {
    try {
        console.log('[Statistics] Calculating project statistics');

        // Get all markdown files in the project
        const fileResponse = await window.electronAPI.invoke('get-markdown-files');

        if (!fileResponse.success) {
            throw new Error(fileResponse.error || 'Failed to get markdown files');
        }

        const markdownFiles = fileResponse.files;
        console.log(`[Statistics] Found ${markdownFiles.length} markdown files`);

        // Initialize aggregate statistics
        let aggregatedStats = {
            fileCount: markdownFiles.length,
            wordCount: 0,
            charCount: 0,
            sentenceCount: 0,
            paragraphCount: 0,
            headingCount: 0,
            slideCount: 0,
            notesCount: 0,
            listCount: 0,
            linkCount: 0,
            codeBlockCount: 0,
            imageCount: 0,
            totalCharacters: 0,
            totalWords: 0
        };

        // Process each markdown file
        for (const filePath of markdownFiles) {
            try {
                const contentResponse = await window.electronAPI.invoke('read-file', filePath);
                if (contentResponse.success && contentResponse.content) {
                    const fileStats = calculateBasicStatistics(contentResponse.content);

                    // Aggregate the statistics
                    aggregatedStats.wordCount += fileStats.wordCount;
                    aggregatedStats.charCount += fileStats.charCount;
                    aggregatedStats.sentenceCount += fileStats.sentenceCount;
                    aggregatedStats.paragraphCount += fileStats.paragraphCount;
                    aggregatedStats.headingCount += fileStats.headingCount;
                    aggregatedStats.slideCount += fileStats.slideCount;
                    aggregatedStats.notesCount += fileStats.notesCount;
                    aggregatedStats.listCount += fileStats.listCount;
                    aggregatedStats.linkCount += fileStats.linkCount;
                    aggregatedStats.codeBlockCount += fileStats.codeBlockCount;
                    aggregatedStats.imageCount += fileStats.imageCount;

                    // For averaging calculations
                    aggregatedStats.totalCharacters += contentResponse.content.replace(/\s/g, '').length;
                    aggregatedStats.totalWords += fileStats.wordCount;
                }
            } catch (fileError) {
                console.warn(`[Statistics] Error processing file ${filePath}:`, fileError);
            }
        }

        // Calculate averages
        aggregatedStats.averageSentenceLength = aggregatedStats.sentenceCount > 0
            ? Math.round(aggregatedStats.wordCount / aggregatedStats.sentenceCount)
            : 0;

        aggregatedStats.averageWordLength = aggregatedStats.totalWords > 0
            ? Math.round((aggregatedStats.totalCharacters / aggregatedStats.totalWords) * 10) / 10
            : 0;

        // Estimated reading/presentation times
        aggregatedStats.readingTime = Math.ceil(aggregatedStats.wordCount / 200);
        aggregatedStats.presentationTime = Math.ceil(aggregatedStats.wordCount / 150);

        console.log('[Statistics] Project statistics calculated:', aggregatedStats);
        return aggregatedStats;

    } catch (error) {
        console.error('[Statistics] Error calculating project statistics:', error);
        throw error;
    }
}

/**
 * Get the current statistics scope
 *
 * @returns {string} Current scope ('document' or 'project')
 */
function getStatsScope() {
    return currentStatsScope;
}

// --- Export Functions for Global Access ---
window.switchStatsScope = switchStatsScope;
window.updateStatisticsPane = updateStatisticsPane;
window.calculateBasicStatistics = calculateBasicStatistics;
window.calculateProjectStatistics = calculateProjectStatistics;
window.getStatsScope = getStatsScope;
