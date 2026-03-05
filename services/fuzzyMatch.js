/**
 * Fuzzy matching utility for citation search.
 * Works in both Node.js and browser contexts.
 *
 * Supports:
 * - Wildcard patterns: * (any chars) and ? (single char)
 * - Bigram-based fuzzy matching for typo tolerance
 */

/**
 * Check if a query contains wildcard characters.
 */
function hasWildcards(query) {
    return /[*?]/.test(query);
}

/**
 * Convert a wildcard pattern to a RegExp.
 * Escapes regex-special chars except * and ?.
 */
function wildcardToRegex(pattern) {
    const escaped = pattern.replace(/([.+^${}()|[\]\\])/g, '\\$1');
    const regexStr = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp('^' + regexStr + '$', 'i');
}

/**
 * Extract character bigrams from a string.
 */
function getBigrams(str) {
    const bigrams = new Map();
    const s = str.toLowerCase();
    for (let i = 0; i < s.length - 1; i++) {
        const pair = s.substring(i, i + 2);
        bigrams.set(pair, (bigrams.get(pair) || 0) + 1);
    }
    return bigrams;
}

/**
 * Compute bigram-based similarity (Dice coefficient) between two strings.
 * Returns a value between 0.0 and 1.0.
 */
function bigramSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    if (s1 === s2) return 1.0;
    if (s1.length < 2 || s2.length < 2) {
        return s1[0] === s2[0] ? 0.5 : 0;
    }

    const bigrams1 = getBigrams(s1);
    const bigrams2 = getBigrams(s2);

    let intersection = 0;
    for (const [pair, count] of bigrams1) {
        if (bigrams2.has(pair)) {
            intersection += Math.min(count, bigrams2.get(pair));
        }
    }

    let total1 = 0;
    for (const count of bigrams1.values()) total1 += count;
    let total2 = 0;
    for (const count of bigrams2.values()) total2 += count;

    return (2 * intersection) / (total1 + total2);
}

/**
 * Perform fuzzy matching of a query against text.
 *
 * @param {string} query - The search query
 * @param {string} text - The text to match against
 * @param {object} [options]
 * @param {number} [options.threshold=0.3] - Minimum score to consider a match
 * @returns {{ match: boolean, score: number }}
 */
function fuzzyMatch(query, text, options = {}) {
    const threshold = options.threshold ?? 0.3;

    if (!query || !text) return { match: false, score: 0 };

    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    // Exact match
    if (textLower === queryLower) {
        return { match: true, score: 1.0 };
    }

    // Wildcard matching
    if (hasWildcards(query)) {
        const regex = wildcardToRegex(query);
        const isMatch = regex.test(text);
        return { match: isMatch, score: isMatch ? 0.95 : 0 };
    }

    // Substring containment — strong signal
    if (textLower.includes(queryLower)) {
        const ratio = queryLower.length / textLower.length;
        const score = 0.7 + 0.25 * ratio;
        return { match: true, score };
    }

    // Bigram fuzzy matching — handles typos
    const score = bigramSimilarity(queryLower, textLower);
    return { match: score >= threshold, score };
}

/**
 * Score a query against multiple fields, returning the best score.
 *
 * @param {string} query
 * @param {string[]} fields - Array of text values to match against
 * @param {object} [options]
 * @returns {{ match: boolean, score: number }}
 */
function fuzzyMatchBest(query, fields, options = {}) {
    let best = { match: false, score: 0 };
    for (const field of fields) {
        if (!field) continue;
        const result = fuzzyMatch(query, field, options);
        if (result.score > best.score) {
            best = result;
        }
    }
    return best;
}

// Export for Node.js / CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { fuzzyMatch, fuzzyMatchBest, hasWildcards, wildcardToRegex, bigramSimilarity };
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
    window.fuzzyMatch = fuzzyMatch;
    window.fuzzyMatchBest = fuzzyMatchBest;
    window.hasWildcards = hasWildcards;
}
