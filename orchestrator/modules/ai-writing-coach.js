/**
 * AI Writing Coach
 * Provides writing suggestions, readability analysis, and style feedback
 * using the existing AI chat backend.
 *
 * @module ai-writing-coach
 */

(function () {
  'use strict';

  let lastAnalysis = null;

  /**
   * Compute basic readability stats without AI.
   */
  function computeStats(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);

    const avgSentenceLen = sentences.length > 0 ? words.length / sentences.length : 0;
    const avgSyllables = words.length > 0 ? syllableCount / words.length : 0;

    // Flesch-Kincaid reading ease
    const fkScore = 206.835 - (1.015 * avgSentenceLen) - (84.6 * avgSyllables);

    // Grade level
    const gradeLevel = (0.39 * avgSentenceLen) + (11.8 * avgSyllables) - 15.59;

    // Passive voice detection (simple heuristic)
    const passiveRe = /\b(is|are|was|were|been|being|be)\s+(\w+ed|written|done|made|given|taken|shown|known)\b/gi;
    const passiveMatches = text.match(passiveRe) || [];

    // Repeated words
    const wordFreq = {};
    words.forEach(w => {
      const lower = w.toLowerCase().replace(/[^a-z']/g, '');
      if (lower.length > 3) wordFreq[lower] = (wordFreq[lower] || 0) + 1;
    });
    const overused = Object.entries(wordFreq)
      .filter(([, count]) => count > 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Long sentences
    const longSentences = sentences
      .map((s, i) => ({ text: s.trim(), index: i, words: s.trim().split(/\s+/).length }))
      .filter(s => s.words > 30);

    return {
      wordCount: words.length,
      sentenceCount: sentences.length,
      avgSentenceLen: Math.round(avgSentenceLen * 10) / 10,
      readingEase: Math.round(fkScore * 10) / 10,
      gradeLevel: Math.max(0, Math.round(gradeLevel * 10) / 10),
      passiveCount: passiveMatches.length,
      overusedWords: overused,
      longSentences: longSentences.length,
      readingTime: Math.ceil(words.length / 200)
    };
  }

  function countSyllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 2) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  function readingEaseLabel(score) {
    if (score >= 90) return 'Very Easy';
    if (score >= 80) return 'Easy';
    if (score >= 70) return 'Fairly Easy';
    if (score >= 60) return 'Standard';
    if (score >= 50) return 'Fairly Difficult';
    if (score >= 30) return 'Difficult';
    return 'Very Difficult';
  }

  /**
   * Get AI-powered writing feedback using the existing AI chat system.
   */
  async function getAIFeedback(text) {
    if (!window.electronAPI) return null;

    const excerpt = text.length > 3000 ? text.slice(0, 3000) + '\n...[truncated]' : text;

    try {
      const result = await window.electronAPI.ai.aiChat({
        messages: [{
          role: 'user',
          content: `You are a writing coach. Analyze this text and provide brief, actionable feedback in these categories:
1. **Clarity**: Is the writing clear? Any confusing passages?
2. **Structure**: Is it well-organized?
3. **Style**: Any style issues (wordiness, passive voice, jargon)?
4. **Strength**: What works well?
5. **Suggestion**: One specific improvement.

Keep each point to 1-2 sentences. Be constructive.

Text:
${excerpt}`
        }]
      });

      if (result && result.content) {
        return result.content;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Show the writing coach panel.
   */
  function showCoachPanel() {
    if (!window.editor) return;

    const model = window.editor.getModel();
    if (!model) return;

    const text = model.getValue();
    if (!text.trim()) {
      if (window.showNotification) window.showNotification('No content to analyze', 'info');
      return;
    }

    const stats = computeStats(text);
    lastAnalysis = stats;

    const existing = document.getElementById('coach-dialog');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'coach-dialog';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:10000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg-color,#1e1e1e);color:var(--text-color,#d4d4d4);border-radius:8px;padding:16px;width:520px;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:system-ui,sans-serif;';

    const easeColor = stats.readingEase >= 60 ? '#4ade80' : stats.readingEase >= 40 ? '#facc15' : '#f48771';

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;font-size:15px;">Writing Coach</h3>
        <button id="coach-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;">&times;</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">
        <div style="background:var(--bg-secondary,#252526);border-radius:6px;padding:10px;text-align:center;">
          <div style="font-size:22px;font-weight:bold;">${stats.wordCount}</div>
          <div style="font-size:11px;color:#888;">Words</div>
        </div>
        <div style="background:var(--bg-secondary,#252526);border-radius:6px;padding:10px;text-align:center;">
          <div style="font-size:22px;font-weight:bold;color:${easeColor};">${stats.readingEase}</div>
          <div style="font-size:11px;color:#888;">${readingEaseLabel(stats.readingEase)}</div>
        </div>
        <div style="background:var(--bg-secondary,#252526);border-radius:6px;padding:10px;text-align:center;">
          <div style="font-size:22px;font-weight:bold;">${stats.readingTime}m</div>
          <div style="font-size:11px;color:#888;">Read Time</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
        <div style="font-size:12px;"><span style="color:#888;">Sentences:</span> ${stats.sentenceCount}</div>
        <div style="font-size:12px;"><span style="color:#888;">Avg sentence:</span> ${stats.avgSentenceLen} words</div>
        <div style="font-size:12px;"><span style="color:#888;">Grade level:</span> ${stats.gradeLevel}</div>
        <div style="font-size:12px;"><span style="color:#888;">Passive voice:</span> ${stats.passiveCount} instance${stats.passiveCount !== 1 ? 's' : ''}</div>
      </div>
    `;

    if (stats.longSentences > 0) {
      html += `<div style="background:rgba(250,204,21,0.1);border:1px solid rgba(250,204,21,0.3);border-radius:4px;padding:8px;margin-bottom:8px;font-size:12px;">
        ${stats.longSentences} sentence${stats.longSentences > 1 ? 's' : ''} over 30 words. Consider splitting for clarity.
      </div>`;
    }

    if (stats.overusedWords.length > 0) {
      html += `<div style="margin-bottom:12px;font-size:12px;">
        <span style="color:#888;">Overused words:</span>
        ${stats.overusedWords.map(([w, c]) => `<span style="background:var(--bg-secondary,#252526);padding:2px 6px;border-radius:3px;margin:0 2px;">${esc(w)} (${c}x)</span>`).join(' ')}
      </div>`;
    }

    html += `
      <div id="ai-feedback-section" style="margin-top:12px;">
        <button id="coach-ai-btn" style="background:#569cd6;color:#fff;border:none;border-radius:4px;padding:8px 16px;cursor:pointer;font-size:12px;width:100%;">Get AI Feedback</button>
      </div>
    `;

    dialog.innerHTML = html;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    document.getElementById('coach-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('coach-ai-btn').addEventListener('click', async () => {
      const btn = document.getElementById('coach-ai-btn');
      btn.textContent = 'Analyzing...';
      btn.disabled = true;
      btn.style.opacity = '0.6';

      const feedback = await getAIFeedback(text);
      const section = document.getElementById('ai-feedback-section');

      if (feedback) {
        section.innerHTML = `
          <div style="font-size:12px;font-weight:bold;margin-bottom:6px;">AI Feedback:</div>
          <div style="font-size:12px;line-height:1.6;background:var(--bg-secondary,#252526);border-radius:6px;padding:12px;white-space:pre-wrap;">${esc(feedback)}</div>
        `;
      } else {
        section.innerHTML = '<div style="font-size:12px;color:#888;">AI feedback unavailable. Check your AI settings.</div>';
      }
    });

    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
    });
  }

  function esc(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function init() {
    if (window.commandPaletteCommands) {
      window.commandPaletteCommands.push({ name: 'Writing Coach: Analyze Document', action: showCoachPanel });
    }
  }

  window.writingCoach = {
    analyze: showCoachPanel,
    computeStats,
    getLastAnalysis: () => lastAnalysis
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }
})();
