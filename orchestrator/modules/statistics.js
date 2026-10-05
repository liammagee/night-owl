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
            statisticsContent.innerHTML = '<p class="statistics-empty-state" style="text-align: center; padding: 20px;">Analyzing project files...</p>';
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
                    <p class="statistics-empty-state" style="text-align: center; padding: 20px;">
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
                uniqueWordCount: 0,
                charCount: 0,
                paragraphCount: 0,
                headingCount: 0,
                sentenceCount: 0,
                averageSentenceLength: 0,
                averageWordLength: 0,
                readingEase: 0,
                gradeLevel: 0,
                syllableCount: 0,
                longSentenceCount: 0,
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

        const formatScore = (value) => Number.isFinite(value) ? value.toFixed(1) : '0.0';
        const scopeTitle = currentStatsScope === 'project' ? 'Project Overview' : 'Document Overview';

        statisticsContent.innerHTML = `
            <div class="statistics-stack">
                <div class="statistics-card statistics-card-overview">
                    <h4>${scopeTitle}</h4>
                    <div class="statistics-rows">
                        ${currentStatsScope === 'project' ? `
                        <div class="statistics-row">
                            <span>Markdown Files:</span>
                            <strong>${stats.fileCount}</strong>
                        </div>
                        ` : ''}
                        <div class="statistics-row">
                            <span>Total Words:</span>
                            <strong>${(stats.wordCount || 0).toLocaleString()}</strong>
                        </div>
                        <div class="statistics-row">
                            <span>Unique Words:</span>
                            <strong>${(stats.uniqueWordCount || 0).toLocaleString()}</strong>
                        </div>
                        <div class="statistics-row">
                            <span>Characters:</span>
                            <strong>${(stats.charCount || 0).toLocaleString()}</strong>
                        </div>
                        <div class="statistics-row">
                            <span>Paragraphs:</span>
                            <strong>${stats.paragraphCount || 0}</strong>
                        </div>
                        <div class="statistics-row">
                            <span>Headings:</span>
                            <strong>${stats.headingCount || 0}</strong>
                        </div>
                    </div>
                </div>

                <div class="statistics-card statistics-card-presentation">
                    <h4>${currentStatsScope === 'project' ? 'Project' : 'Presentation'} Analysis</h4>
                    <div class="statistics-rows">
                        <div class="statistics-row">
                            <span>Slide Markers:</span>
                            <strong>${stats.slideCount || 0}</strong>
                        </div>
                        <div class="statistics-row">
                            <span>Speaker Notes:</span>
                            <strong>${stats.notesCount || 0}</strong>
                        </div>
                        <div class="statistics-row">
                            <span>Est. Reading Time:</span>
                            <strong>${formatTime(stats.readingTime || 0)}</strong>
                        </div>
                        <div class="statistics-row">
                            <span>Est. Presentation:</span>
                            <strong>${formatTime(stats.presentationTime || 0)}</strong>
                        </div>
                    </div>
                </div>

                <div class="statistics-card statistics-card-readability">
                    <h4>Readability</h4>
                    <div class="statistics-rows">
                        <div class="statistics-row">
                            <span>Flesch Ease:</span>
                            <strong>${formatScore(stats.readingEase)}</strong>
                        </div>
                        <div class="statistics-row">
                            <span>Grade Level:</span>
                            <strong>${formatScore(stats.gradeLevel)}</strong>
                        </div>
                        <div class="statistics-row">
                            <span>Sentences:</span>
                            <strong>${stats.sentenceCount || 0}</strong>
                        </div>
                        <div class="statistics-row">
                            <span>Avg Sentence Length:</span>
                            <strong>${stats.averageSentenceLength || 0} words</strong>
                        </div>
                        <div class="statistics-row">
                            <span>Avg Word Length:</span>
                            <strong>${stats.averageWordLength || 0} chars</strong>
                        </div>
                        <div class="statistics-row">
                            <span>Long Sentences:</span>
                            <strong>${stats.longSentenceCount || 0}</strong>
                        </div>
                    </div>
                </div>

                <div class="statistics-card statistics-card-content">
                    <h4>Content Breakdown</h4>
                    <div class="statistics-rows">
                        <div class="statistics-row">
                            <span>Lists:</span>
                            <strong>${stats.listCount || 0}</strong>
                        </div>
                        <div class="statistics-row">
                            <span>Links:</span>
                            <strong>${stats.linkCount || 0}</strong>
                        </div>
                        <div class="statistics-row">
                            <span>Code Blocks:</span>
                            <strong>${stats.codeBlockCount || 0}</strong>
                        </div>
                        <div class="statistics-row">
                            <span>Images:</span>
                            <strong>${stats.imageCount || 0}</strong>
                        </div>
                    </div>
                </div>

            </div>
        `;

    } catch (error) {
        console.error('Error calculating statistics:', error);
        statisticsContent.innerHTML = `
            <p class="statistics-error-state" style="text-align: center; padding: 20px;">
                Error calculating statistics: ${error.message}
            </p>
        `;
    }
}

function countSyllables(word) {
    const normalized = String(word || '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');
    if (!normalized) return 0;
    if (normalized.length <= 3) return 1;

    const withoutSilentE = normalized.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    const syllableGroups = withoutSilentE.match(/[aeiouy]{1,2}/g);
    return Math.max(1, syllableGroups ? syllableGroups.length : 1);
}

function calculateReadabilityMetrics(words, sentences) {
    const wordCount = words.length;
    const sentenceCount = sentences.length;
    if (wordCount === 0 || sentenceCount === 0) {
        return {
            syllableCount: 0,
            readingEase: 0,
            gradeLevel: 0,
            longSentenceCount: 0
        };
    }

    const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);
    const wordsPerSentence = wordCount / sentenceCount;
    const syllablesPerWord = syllableCount / wordCount;
    const readingEase = Math.max(0, Math.min(100,
        206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord)
    ));
    const gradeLevel = Math.max(0,
        (0.39 * wordsPerSentence) + (11.8 * syllablesPerWord) - 15.59
    );
    const longSentenceCount = sentences.filter(sentence => {
        const sentenceWords = sentence.trim().split(/\s+/).filter(Boolean);
        return sentenceWords.length > 30;
    }).length;

    return {
        syllableCount,
        readingEase: Math.round(readingEase * 10) / 10,
        gradeLevel: Math.round(gradeLevel * 10) / 10,
        longSentenceCount
    };
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

    const words = cleanText ? cleanText.split(' ').filter(Boolean) : [];
    const normalizedWords = words
        .map(word => word.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ''))
        .filter(Boolean);

    // Word count
    const wordCount = words.length;
    const uniqueWordCount = new Set(normalizedWords).size;

    // Character count
    const charCount = content.length;

    // Sentence count and average sentence length
    const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceCount = sentences.length;
    const averageSentenceLength = sentenceCount > 0 ? Math.round(wordCount / sentenceCount) : 0;
    const readability = calculateReadabilityMetrics(words, sentences);

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
        uniqueWordCount,
        charCount,
        sentenceCount,
        averageSentenceLength,
        averageWordLength,
        ...readability,
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
        const fileResponse = await window.electronAPI.files.getMarkdownFiles();

        if (!fileResponse.success) {
            throw new Error(fileResponse.error || 'Failed to get markdown files');
        }

        const markdownFiles = fileResponse.files;
        console.log(`[Statistics] Found ${markdownFiles.length} markdown files`);

        // Initialize aggregate statistics
        let aggregatedStats = {
            fileCount: markdownFiles.length,
            wordCount: 0,
            uniqueWordCount: 0,
            charCount: 0,
            sentenceCount: 0,
            paragraphCount: 0,
            headingCount: 0,
            syllableCount: 0,
            readingEase: 0,
            gradeLevel: 0,
            longSentenceCount: 0,
            slideCount: 0,
            notesCount: 0,
            listCount: 0,
            linkCount: 0,
            codeBlockCount: 0,
            imageCount: 0,
            totalCharacters: 0,
            totalWords: 0
        };
        const projectUniqueWords = new Set();

        // Process each markdown file
        for (const filePath of markdownFiles) {
            try {
                const contentResponse = await window.electronAPI.files.readFile(filePath);
                if (contentResponse.success && contentResponse.content) {
                    const fileStats = calculateBasicStatistics(contentResponse.content);

                    // Aggregate the statistics
                    aggregatedStats.wordCount += fileStats.wordCount;
                    aggregatedStats.charCount += fileStats.charCount;
                    aggregatedStats.sentenceCount += fileStats.sentenceCount;
                    aggregatedStats.paragraphCount += fileStats.paragraphCount;
                    aggregatedStats.headingCount += fileStats.headingCount;
                    aggregatedStats.syllableCount += fileStats.syllableCount || 0;
                    aggregatedStats.longSentenceCount += fileStats.longSentenceCount || 0;
                    aggregatedStats.slideCount += fileStats.slideCount;
                    aggregatedStats.notesCount += fileStats.notesCount;
                    aggregatedStats.listCount += fileStats.listCount;
                    aggregatedStats.linkCount += fileStats.linkCount;
                    aggregatedStats.codeBlockCount += fileStats.codeBlockCount;
                    aggregatedStats.imageCount += fileStats.imageCount;
                    if (fileStats.cleanText) {
                        fileStats.cleanText
                            .split(/\s+/)
                            .map(word => word.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ''))
                            .filter(Boolean)
                            .forEach(word => projectUniqueWords.add(word));
                    }

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
        aggregatedStats.uniqueWordCount = projectUniqueWords.size;
        if (aggregatedStats.totalWords > 0 && aggregatedStats.sentenceCount > 0) {
            const wordsPerSentence = aggregatedStats.totalWords / aggregatedStats.sentenceCount;
            const syllablesPerWord = aggregatedStats.syllableCount / aggregatedStats.totalWords;
            aggregatedStats.readingEase = Math.round(Math.max(0, Math.min(100,
                206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord)
            )) * 10) / 10;
            aggregatedStats.gradeLevel = Math.round(Math.max(0,
                (0.39 * wordsPerSentence) + (11.8 * syllablesPerWord) - 15.59
            ) * 10) / 10;
        }

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
