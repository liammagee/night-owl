// === Recognition Dashboard Panel ===
// Renders the full recognition engine state (all 5 phases) in NightOwl's right pane.
// Data flows from window.TutorBridge → recognition panel UI.

(function() {
    'use strict';

    let panelEl = null;
    let refreshTimer = null;
    let lastState = null;

    // ========================================================================
    // DOM Creation
    // ========================================================================

    function createPanel() {
        const rightPane = document.querySelector('#right-pane > div');
        if (!rightPane) {
            console.warn('[RecognitionPanel] #right-pane not found');
            return null;
        }

        panelEl = document.createElement('div');
        panelEl.id = 'recognition-pane';
        panelEl.className = 'content-pane';
        panelEl.style.cssText = 'display: none; height: 100%; flex-direction: column; overflow-y: auto; padding: 16px; gap: 16px;';
        panelEl.innerHTML = buildPanelHTML();
        rightPane.appendChild(panelEl);

        return panelEl;
    }

    function buildPanelHTML() {
        return `
            <div class="recognition-header" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 2px solid #E63946;">
                <h3 style="margin: 0; color: #E63946; font-size: 16px;">Recognition Journey</h3>
                <button id="recognition-refresh-btn" class="btn" style="padding: 4px 8px; font-size: 11px;" title="Refresh">Refresh</button>
            </div>

            <!-- Depth Gauge -->
            <div id="recognition-depth-section" class="recognition-section">
                <div class="recognition-section-header">Recognition Depth</div>
                <div id="recognition-depth-gauge" class="recognition-depth-gauge">
                    <div class="depth-bar-container">
                        <div id="depth-bar-fill" class="depth-bar-fill" style="width: 0%"></div>
                    </div>
                    <div class="depth-info">
                        <span id="depth-value">0.00</span>
                        <span id="depth-trend" class="depth-trend"></span>
                    </div>
                </div>
            </div>

            <!-- Memory Layers -->
            <div id="recognition-memory-section" class="recognition-section">
                <div class="recognition-section-header">Memory Layers</div>
                <div id="memory-layers" class="memory-layers">
                    <div class="memory-layer" data-layer="conscious">
                        <div class="layer-label">Conscious</div>
                        <div class="layer-desc">Ephemeral working thoughts</div>
                        <div class="layer-count" id="conscious-count">0</div>
                    </div>
                    <div class="memory-layer-arrow">&#x2193;</div>
                    <div class="memory-layer" data-layer="preconscious">
                        <div class="layer-label">Preconscious</div>
                        <div class="layer-desc">Emerging patterns</div>
                        <div class="layer-count" id="preconscious-count">0</div>
                    </div>
                    <div class="memory-layer-arrow">&#x2193;</div>
                    <div class="memory-layer" data-layer="unconscious">
                        <div class="layer-label">Unconscious</div>
                        <div class="layer-desc">Permanent traces</div>
                        <div class="layer-count" id="unconscious-count">0</div>
                    </div>
                </div>
            </div>

            <!-- Milestones -->
            <div id="recognition-milestones-section" class="recognition-section">
                <div class="recognition-section-header">Milestones <span id="milestones-achieved" class="milestones-count"></span></div>
                <div id="milestones-list" class="milestones-list"></div>
            </div>

            <!-- Learner Patterns -->
            <div id="recognition-patterns-section" class="recognition-section">
                <div class="recognition-section-header">Learner Patterns</div>
                <div id="patterns-content" class="patterns-content">
                    <div class="pattern-row">
                        <span class="pattern-label">Total Events</span>
                        <span id="pattern-total" class="pattern-value">0</span>
                    </div>
                    <div class="pattern-row">
                        <span class="pattern-label">Resistance</span>
                        <div class="pattern-bar-container">
                            <div id="pattern-resistance-bar" class="pattern-bar" style="width: 0%; background: #E63946;"></div>
                        </div>
                        <span id="pattern-resistance" class="pattern-value">0</span>
                    </div>
                    <div class="pattern-row">
                        <span class="pattern-label">Breakthrough</span>
                        <div class="pattern-bar-container">
                            <div id="pattern-breakthrough-bar" class="pattern-bar" style="width: 0%; background: #4ecdc4;"></div>
                        </div>
                        <span id="pattern-breakthrough" class="pattern-value">0</span>
                    </div>
                    <div class="pattern-row">
                        <span class="pattern-label">Demand</span>
                        <div class="pattern-bar-container">
                            <div id="pattern-demand-bar" class="pattern-bar" style="width: 0%; background: #f4a261;"></div>
                        </div>
                        <span id="pattern-demand" class="pattern-value">0</span>
                    </div>
                </div>
            </div>

            <!-- Archetype -->
            <div id="recognition-archetype-section" class="recognition-section">
                <div class="recognition-section-header">Learner Archetype</div>
                <div id="archetype-content" class="archetype-content">
                    <span class="archetype-badge" id="archetype-badge">Unknown</span>
                </div>
            </div>

            <!-- Dialectical History -->
            <div id="recognition-dialectical-section" class="recognition-section">
                <div class="recognition-section-header">Dialectical History</div>
                <div id="dialectical-list" class="dialectical-list">
                    <div class="empty-state">No dialectical moments recorded yet</div>
                </div>
            </div>

            <!-- Not initialized state -->
            <div id="recognition-not-initialized" style="display: none; text-align: center; padding: 40px 20px; color: #888;">
                <div style="font-size: 32px; margin-bottom: 12px;">&#x1F9E0;</div>
                <div style="font-size: 14px; margin-bottom: 8px;">Recognition Engine Not Initialized</div>
                <div style="font-size: 12px; color: #666;">Write some text and interact with the AI companion to begin building your recognition profile.</div>
            </div>
        `;
    }

    // ========================================================================
    // Data Rendering
    // ========================================================================

    async function refreshPanel() {
        if (!window.TutorBridge || !window.TutorBridge.isAvailable()) {
            showNotInitialized();
            return;
        }

        try {
            const [fullState, patterns, history] = await Promise.all([
                window.TutorBridge.getFullRecognitionState(),
                window.TutorBridge.getLearnerPatterns(),
                window.TutorBridge.getDialecticalHistory({ limit: 10 }),
            ]);

            if (!fullState || !fullState.initialized) {
                showNotInitialized();
                return;
            }

            lastState = fullState;
            showInitialized();
            renderDepth(fullState.recognitionProfile);
            renderMemoryLayers(fullState.writingPad);
            renderMilestones(fullState.recognitionProfile);
            renderPatterns(patterns);
            renderArchetype(fullState.writingPad);
            renderDialecticalHistory(history);
        } catch (err) {
            console.error('[RecognitionPanel] Refresh failed:', err.message);
        }
    }

    function showNotInitialized() {
        if (!panelEl) return;
        const sections = panelEl.querySelectorAll('.recognition-section');
        sections.forEach(s => s.style.display = 'none');
        const notInit = panelEl.querySelector('#recognition-not-initialized');
        if (notInit) notInit.style.display = '';
    }

    function showInitialized() {
        if (!panelEl) return;
        const sections = panelEl.querySelectorAll('.recognition-section');
        sections.forEach(s => s.style.display = '');
        const notInit = panelEl.querySelector('#recognition-not-initialized');
        if (notInit) notInit.style.display = 'none';
    }

    function renderDepth(profile) {
        if (!profile || !profile.depth) return;
        const depth = profile.depth.compositeDepth || 0;
        const trend = profile.depth.trend || 'stable';

        const fill = panelEl.querySelector('#depth-bar-fill');
        const valueEl = panelEl.querySelector('#depth-value');
        const trendEl = panelEl.querySelector('#depth-trend');

        if (fill) fill.style.width = `${Math.min(depth * 100, 100)}%`;
        if (valueEl) valueEl.textContent = depth.toFixed(2);
        if (trendEl) {
            const trendIcons = { rising: '\u2191 Rising', falling: '\u2193 Falling', stable: '\u2194 Stable' };
            trendEl.textContent = trendIcons[trend] || trend;
            trendEl.className = `depth-trend depth-trend-${trend}`;
        }
    }

    function renderMemoryLayers(writingPad) {
        if (!writingPad) return;
        const setCount = (id, value) => {
            const el = panelEl.querySelector(`#${id}`);
            if (el) el.textContent = value || 0;
        };

        setCount('conscious-count', writingPad.conscious?.workingThoughts || 0);
        setCount('preconscious-count', writingPad.preconscious?.patterns || 0);
        setCount('unconscious-count', writingPad.unconscious?.permanentTraces || 0);
    }

    function renderMilestones(profile) {
        if (!profile || !profile.milestones) return;
        const list = panelEl.querySelector('#milestones-list');
        const countEl = panelEl.querySelector('#milestones-achieved');
        if (!list) return;

        const milestones = profile.milestones;
        const achieved = milestones.filter(m => m.achieved).length;
        if (countEl) countEl.textContent = `(${achieved}/${milestones.length})`;

        list.innerHTML = milestones.map(m => `
            <div class="milestone-item ${m.achieved ? 'milestone-achieved' : 'milestone-pending'}">
                <span class="milestone-icon">${m.achieved ? '\u2713' : '\u25CB'}</span>
                <div class="milestone-info">
                    <div class="milestone-title">${escapeHtml(m.title || m.key)}</div>
                    ${m.description ? `<div class="milestone-desc">${escapeHtml(m.description)}</div>` : ''}
                </div>
            </div>
        `).join('');
    }

    function renderPatterns(patterns) {
        if (!patterns) return;
        const total = patterns.totalEvents || 0;
        const resistance = patterns.resistanceCount || 0;
        const breakthrough = patterns.breakthroughCount || 0;
        const demand = patterns.demandCount || 0;

        const setVal = (id, val) => {
            const el = panelEl.querySelector(`#${id}`);
            if (el) el.textContent = val;
        };
        const setBar = (id, val, total) => {
            const el = panelEl.querySelector(`#${id}`);
            if (el) el.style.width = total > 0 ? `${(val / total) * 100}%` : '0%';
        };

        setVal('pattern-total', total);
        setVal('pattern-resistance', resistance);
        setVal('pattern-breakthrough', breakthrough);
        setVal('pattern-demand', demand);
        setBar('pattern-resistance-bar', resistance, total);
        setBar('pattern-breakthrough-bar', breakthrough, total);
        setBar('pattern-demand-bar', demand, total);
    }

    function renderArchetype(writingPad) {
        const badge = panelEl.querySelector('#archetype-badge');
        if (!badge) return;

        const archetype = writingPad?.unconscious?.learnerArchetype;
        if (archetype) {
            badge.textContent = archetype.charAt(0).toUpperCase() + archetype.slice(1);
            badge.className = `archetype-badge archetype-${archetype}`;
        } else {
            badge.textContent = 'Not yet determined';
            badge.className = 'archetype-badge';
        }
    }

    function renderDialecticalHistory(history) {
        const list = panelEl.querySelector('#dialectical-list');
        if (!list) return;

        if (!history || history.length === 0) {
            list.innerHTML = '<div class="empty-state">No dialectical moments recorded yet</div>';
            return;
        }

        list.innerHTML = history.map(m => `
            <div class="dialectical-moment">
                <div class="moment-header">
                    <span class="moment-strategy">${escapeHtml(m.synthesis_strategy || m.strategy || 'unknown')}</span>
                    ${m.transformative ? '<span class="moment-transformative">Transformative</span>' : ''}
                </div>
                <div class="moment-meta">
                    <span class="moment-layer">${escapeHtml(m.persistence_layer || m.layer || '')}</span>
                    <span class="moment-time">${formatTime(m.created_at || m.createdAt)}</span>
                </div>
            </div>
        `).join('');
    }

    // ========================================================================
    // Pane Integration
    // ========================================================================

    function registerWithPaneSystem() {
        // Patch window.showPane to support 'recognition' type
        const originalShowPane = window.showPane;
        window.showPane = function(paneType) {
            if (paneType === 'recognition') {
                hideAllPanes();
                showRecognitionPane();
                return;
            }
            // Hide recognition pane when switching to other panes
            if (panelEl) {
                panelEl.style.display = 'none';
                panelEl.classList.add('pane-hidden');
            }
            if (originalShowPane) originalShowPane.call(this, paneType);
        };

        // Add recognition pane to the hide cycle (monkey-patch if available)
        const origHideAll = window._hideAllRightPanes;
        if (origHideAll) {
            window._hideAllRightPanes = function() {
                origHideAll();
                if (panelEl) {
                    panelEl.style.display = 'none';
                    panelEl.classList.add('pane-hidden');
                }
            };
        }
    }

    function hideAllPanes() {
        const rightPane = document.querySelector('#right-pane > div');
        if (!rightPane) return;
        const panes = rightPane.querySelectorAll('.content-pane');
        panes.forEach(p => {
            p.style.display = 'none';
            p.classList.add('pane-hidden');
        });
    }

    function showRecognitionPane() {
        if (!panelEl) return;
        panelEl.style.display = '';
        panelEl.style.display = 'flex';
        panelEl.classList.remove('pane-hidden');
        refreshPanel();
    }

    // ========================================================================
    // Toolbar Button
    // ========================================================================

    function addToolbarButton() {
        const toolbar = document.querySelector('.pane-visibility-btn')?.parentElement;
        if (!toolbar) return;

        const btn = document.createElement('button');
        btn.id = 'toggle-recognition-btn';
        btn.className = 'btn btn-sm pane-visibility-btn';
        btn.title = 'Toggle Recognition Dashboard';
        btn.style.cssText = 'padding: 4px 8px; font-size: 11px; color: #E63946;';
        btn.textContent = '\u{1F9E0}';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (panelEl && panelEl.style.display !== 'none') {
                // Currently showing - switch back to preview
                window.showPane('preview');
            } else {
                window.showPane('recognition');
            }
        });

        toolbar.appendChild(btn);
    }

    // ========================================================================
    // Styles
    // ========================================================================

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .recognition-section {
                background: #f8f9fa;
                border: 1px solid #e0e0e0;
                border-radius: 6px;
                padding: 12px;
            }
            .recognition-section-header {
                font-weight: 600;
                font-size: 13px;
                color: #333;
                margin-bottom: 8px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .depth-bar-container {
                height: 8px;
                background: #e0e0e0;
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 6px;
            }
            .depth-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, #E63946, #4ecdc4);
                border-radius: 4px;
                transition: width 0.5s ease;
            }
            .depth-info {
                display: flex;
                justify-content: space-between;
                font-size: 12px;
                color: #555;
            }
            .depth-trend-rising { color: #4ecdc4; }
            .depth-trend-falling { color: #E63946; }
            .depth-trend-stable { color: #888; }

            .memory-layers {
                display: flex;
                flex-direction: column;
                gap: 4px;
                align-items: center;
            }
            .memory-layer {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 10px;
                border-radius: 4px;
                width: 100%;
                justify-content: space-between;
            }
            .memory-layer[data-layer="conscious"] { background: #fff3cd; }
            .memory-layer[data-layer="preconscious"] { background: #d1ecf1; }
            .memory-layer[data-layer="unconscious"] { background: #d4edda; }
            .layer-label { font-weight: 600; font-size: 12px; min-width: 90px; }
            .layer-desc { font-size: 11px; color: #666; flex: 1; }
            .layer-count { font-weight: 700; font-size: 14px; color: #333; }
            .memory-layer-arrow { text-align: center; color: #999; font-size: 14px; line-height: 1; }

            .milestones-list {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .milestones-count { font-weight: 400; font-size: 11px; color: #888; }
            .milestone-item {
                display: flex;
                align-items: flex-start;
                gap: 8px;
                padding: 4px 6px;
                border-radius: 4px;
                font-size: 12px;
            }
            .milestone-achieved { background: #d4edda; }
            .milestone-pending { background: #f8f9fa; color: #999; }
            .milestone-icon { font-size: 14px; min-width: 18px; text-align: center; }
            .milestone-achieved .milestone-icon { color: #28a745; }
            .milestone-title { font-weight: 500; }
            .milestone-desc { font-size: 11px; color: #666; }

            .pattern-row {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 4px 0;
                font-size: 12px;
            }
            .pattern-label { min-width: 80px; color: #555; }
            .pattern-bar-container {
                flex: 1;
                height: 6px;
                background: #e0e0e0;
                border-radius: 3px;
                overflow: hidden;
            }
            .pattern-bar {
                height: 100%;
                border-radius: 3px;
                transition: width 0.3s ease;
            }
            .pattern-value { min-width: 24px; text-align: right; font-weight: 600; }

            .archetype-badge {
                display: inline-block;
                padding: 4px 12px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: 600;
                background: #e0e0e0;
                color: #555;
            }
            .archetype-autonomous { background: #d4edda; color: #155724; }
            .archetype-guided { background: #d1ecf1; color: #0c5460; }
            .archetype-accelerated { background: #fff3cd; color: #856404; }

            .dialectical-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
                max-height: 200px;
                overflow-y: auto;
            }
            .dialectical-moment {
                padding: 6px 8px;
                background: #fff;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                font-size: 12px;
            }
            .moment-header { display: flex; gap: 8px; align-items: center; margin-bottom: 2px; }
            .moment-strategy { font-weight: 600; color: #333; }
            .moment-transformative {
                font-size: 10px;
                padding: 1px 6px;
                background: #E63946;
                color: white;
                border-radius: 8px;
            }
            .moment-meta { display: flex; justify-content: space-between; font-size: 11px; color: #888; }
            .empty-state { text-align: center; color: #999; padding: 12px; font-size: 12px; }
        `;
        document.head.appendChild(style);
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatTime(isoStr) {
        if (!isoStr) return '';
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
    }

    // ========================================================================
    // Init
    // ========================================================================

    function init() {
        if (!document.getElementById('right-pane')) {
            // Retry after DOM ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', init);
            } else {
                setTimeout(init, 500);
            }
            return;
        }

        injectStyles();
        createPanel();
        registerWithPaneSystem();
        addToolbarButton();

        // Bind refresh button
        const refreshBtn = document.getElementById('recognition-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                refreshPanel();
            });
        }

        console.log('[RecognitionPanel] Initialized');
    }

    // Expose for external access
    if (typeof window !== 'undefined') {
        window.RecognitionPanel = {
            refresh: refreshPanel,
            show: () => window.showPane && window.showPane('recognition'),
        };
    }

    // Auto-init
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }
})();
