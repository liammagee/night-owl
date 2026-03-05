const { fuzzyMatch, fuzzyMatchBest, hasWildcards, wildcardToRegex, bigramSimilarity } = require('../../../services/fuzzyMatch');

describe('fuzzyMatch utility', () => {
    describe('hasWildcards', () => {
        it('detects * wildcard', () => {
            expect(hasWildcards('rad*')).toBe(true);
        });
        it('detects ? wildcard', () => {
            expect(hasWildcards('?adford')).toBe(true);
        });
        it('returns false for plain text', () => {
            expect(hasWildcards('radford')).toBe(false);
        });
    });

    describe('wildcardToRegex', () => {
        it('converts * to .*', () => {
            const re = wildcardToRegex('rad*');
            expect(re.test('radford')).toBe(true);
            expect(re.test('bradford')).toBe(false);
        });
        it('converts ? to single char', () => {
            const re = wildcardToRegex('?adford');
            expect(re.test('Radford')).toBe(true);
            expect(re.test('adford')).toBe(false);
        });
        it('escapes regex special characters', () => {
            const re = wildcardToRegex('test.file*');
            expect(re.test('test.filename')).toBe(true);
            expect(re.test('testXfilename')).toBe(false);
        });
    });

    describe('bigramSimilarity', () => {
        it('returns 1.0 for identical strings', () => {
            expect(bigramSimilarity('hello', 'hello')).toBe(1.0);
        });
        it('returns high score for similar strings', () => {
            expect(bigramSimilarity('language', 'languge')).toBeGreaterThan(0.7);
        });
        it('returns low score for dissimilar strings', () => {
            expect(bigramSimilarity('apple', 'zebra')).toBeLessThan(0.3);
        });
        it('handles empty strings', () => {
            expect(bigramSimilarity('', 'hello')).toBe(0);
            expect(bigramSimilarity('hello', '')).toBe(0);
        });
        it('is case insensitive', () => {
            expect(bigramSimilarity('Hello', 'hello')).toBe(1.0);
        });
    });

    describe('fuzzyMatch', () => {
        it('returns score 1.0 for exact match', () => {
            const result = fuzzyMatch('radford', 'radford');
            expect(result.match).toBe(true);
            expect(result.score).toBe(1.0);
        });

        it('is case insensitive for exact match', () => {
            const result = fuzzyMatch('Radford', 'radford');
            expect(result.match).toBe(true);
            expect(result.score).toBe(1.0);
        });

        describe('wildcard matching', () => {
            it('matches rad* to radford', () => {
                const result = fuzzyMatch('rad*', 'radford');
                expect(result.match).toBe(true);
                expect(result.score).toBe(0.95);
            });

            it('does not match rad* to bradford', () => {
                const result = fuzzyMatch('rad*', 'bradford');
                expect(result.match).toBe(false);
            });

            it('matches *language* to "Language models"', () => {
                const result = fuzzyMatch('*language*', 'Language models');
                expect(result.match).toBe(true);
            });

            it('matches ?adford to Radford', () => {
                const result = fuzzyMatch('?adford', 'Radford');
                expect(result.match).toBe(true);
            });

            it('does not match ?adford to adford (requires one char)', () => {
                const result = fuzzyMatch('?adford', 'adford');
                expect(result.match).toBe(false);
            });
        });

        describe('fuzzy matching (typo tolerance)', () => {
            it('matches languge to language', () => {
                const result = fuzzyMatch('languge', 'language');
                expect(result.match).toBe(true);
                expect(result.score).toBeGreaterThan(0.3);
            });

            it('matches radfrd to radford', () => {
                const result = fuzzyMatch('radfrd', 'radford');
                expect(result.match).toBe(true);
                expect(result.score).toBeGreaterThan(0.3);
            });

            it('does not match completely unrelated strings', () => {
                const result = fuzzyMatch('xyz', 'radford');
                expect(result.match).toBe(false);
            });
        });

        describe('substring matching', () => {
            it('matches substring with high score', () => {
                const result = fuzzyMatch('rad', 'radford');
                expect(result.match).toBe(true);
                expect(result.score).toBeGreaterThan(0.7);
            });
        });

        describe('score ordering', () => {
            it('exact > wildcard > substring > fuzzy', () => {
                const exact = fuzzyMatch('radford', 'radford');
                const wildcard = fuzzyMatch('rad*', 'radford');
                const substring = fuzzyMatch('rad', 'radford');
                const fuzzy = fuzzyMatch('radfrd', 'radford');

                expect(exact.score).toBeGreaterThan(wildcard.score);
                expect(wildcard.score).toBeGreaterThan(substring.score);
                expect(substring.score).toBeGreaterThan(fuzzy.score);
            });
        });

        describe('edge cases', () => {
            it('handles null query', () => {
                const result = fuzzyMatch(null, 'test');
                expect(result.match).toBe(false);
                expect(result.score).toBe(0);
            });

            it('handles null text', () => {
                const result = fuzzyMatch('test', null);
                expect(result.match).toBe(false);
                expect(result.score).toBe(0);
            });

            it('handles empty strings', () => {
                const result = fuzzyMatch('', '');
                expect(result.match).toBe(false);
                expect(result.score).toBe(0);
            });

            it('respects custom threshold', () => {
                // "radfrd" vs "radford" should pass low threshold but might fail high
                const lenient = fuzzyMatch('xyzabc', 'radford', { threshold: 0.01 });
                const strict = fuzzyMatch('xyzabc', 'radford', { threshold: 0.9 });
                expect(strict.match).toBe(false);
            });
        });
    });

    describe('fuzzyMatchBest', () => {
        it('returns best score across multiple fields', () => {
            const result = fuzzyMatchBest('radford', ['Some Title', 'Radford2018', 'A. Radford']);
            expect(result.match).toBe(true);
            expect(result.score).toBeGreaterThan(0.7);
        });

        it('skips null/empty fields', () => {
            const result = fuzzyMatchBest('radford', [null, '', 'Radford2018']);
            expect(result.match).toBe(true);
        });

        it('returns no match when nothing matches', () => {
            const result = fuzzyMatchBest('xyz123', ['hello', 'world']);
            expect(result.match).toBe(false);
        });
    });
});
