/**
 * Techne AI Tutor Plugin
 *
 * An AI-powered guided tour system that provides interactive tutorials
 * for Techne-based applications. Supports pause/resume, AI explanations,
 * branching logic (quick vs detailed), and app-specific adaptations.
 *
 * @module techne-ai-tutor
 */

(function() {
    'use strict';

    const PLUGIN_ID = 'techne-ai-tutor';

    // ========================================================================
    // TUTOR CORE - Shared across all applications
    // ========================================================================

    /**
     * Tour step definition with optional substeps for detailed mode
     * @typedef {Object} TourStep
     * @property {string} id - Unique step identifier
     * @property {string} target - CSS selector or special target identifier
     * @property {string} title - Step title
     * @property {string} content - Step description/instruction
     * @property {string} position - Tooltip position: top|bottom|left|right
     * @property {boolean} [spotlight] - Whether to spotlight the target
     * @property {string[]} [aiPrompts] - Suggested AI questions for this step
     * @property {TourStep[]} [substeps] - Optional detailed substeps (branching)
     * @property {Function} [onEnter] - Callback when entering step
     * @property {Function} [onExit] - Callback when leaving step
     */

    const TutorCore = {
        // State
        isActive: false,
        isPaused: false,
        currentStepIndex: 0,
        currentSubstepIndex: -1, // -1 means main step, 0+ means substep
        tourSteps: [],
        tourMode: 'quick', // 'quick' or 'detailed'
        config: null,
        adapter: null,
        ui: null,
        eventHandlers: new Map(),

        /**
         * Initialize the tutor with configuration
         */
        init(config) {
            this.config = config;
            this.adapter = config.adapter;
            this.tourSteps = config.tourSteps || [];
            this.loadProgress();
            console.log(`[AI Tutor] Initialized for ${config.appName}`);
        },

        /**
         * Start the guided tour
         * @param {Object} options - Start options
         * @param {number} [options.startStep=0] - Step index to start from
         * @param {string} [options.mode='quick'] - Tour mode: 'quick' or 'detailed'
         */
        async startTour(options = {}) {
            if (this.isActive) return;

            const { startStep = 0, mode = 'quick' } = options;

            this.isActive = true;
            this.isPaused = false;
            this.currentStepIndex = startStep;
            this.currentSubstepIndex = -1;
            this.tourMode = mode;

            // Create UI
            this.ui = new TutorUI(this.config, this);
            this.ui.render();

            // Show first step
            await this.showCurrentStep();

            this.emit('tour:started', { step: this.currentStepIndex, mode: this.tourMode });
        },

        /**
         * Stop the tour completely
         */
        stopTour() {
            if (!this.isActive) return;

            this.isActive = false;
            this.isPaused = false;

            if (this.ui) {
                this.ui.destroy();
                this.ui = null;
            }

            this.emit('tour:stopped', { step: this.currentStepIndex });
        },

        /**
         * Pause the tour to allow user experimentation
         */
        pauseTour() {
            if (!this.isActive || this.isPaused) return;

            this.isPaused = true;
            this.saveProgress();

            if (this.ui) {
                this.ui.showPausedState();
            }

            this.emit('tour:paused', { step: this.currentStepIndex });
        },

        /**
         * Resume a paused tour
         */
        resumeTour() {
            if (!this.isActive || !this.isPaused) return;

            this.isPaused = false;

            if (this.ui) {
                this.ui.hidePausedState();
            }

            this.showCurrentStep();
            this.emit('tour:resumed', { step: this.currentStepIndex });
        },

        /**
         * Get the current step object (main step or substep)
         */
        getCurrentStep() {
            const mainStep = this.tourSteps[this.currentStepIndex];
            if (!mainStep) return null;

            if (this.currentSubstepIndex >= 0 && mainStep.substeps && mainStep.substeps[this.currentSubstepIndex]) {
                return mainStep.substeps[this.currentSubstepIndex];
            }
            return mainStep;
        },

        /**
         * Get total step count including substeps in detailed mode
         */
        getTotalSteps() {
            if (this.tourMode === 'quick') {
                return this.tourSteps.length;
            }
            // Detailed mode: count all substeps
            return this.tourSteps.reduce((count, step) => {
                return count + 1 + (step.substeps?.length || 0);
            }, 0);
        },

        /**
         * Get current position as a display string
         */
        getStepPosition() {
            if (this.tourMode === 'quick') {
                return { current: this.currentStepIndex + 1, total: this.tourSteps.length };
            }

            // Detailed mode: calculate position including substeps
            let position = 0;
            for (let i = 0; i < this.currentStepIndex; i++) {
                position += 1 + (this.tourSteps[i].substeps?.length || 0);
            }
            position += 1; // Current main step
            if (this.currentSubstepIndex >= 0) {
                position += this.currentSubstepIndex + 1;
            }

            return { current: position, total: this.getTotalSteps() };
        },

        /**
         * Check if current step has substeps available
         */
        hasSubsteps() {
            const step = this.tourSteps[this.currentStepIndex];
            return step?.substeps && step.substeps.length > 0;
        },

        /**
         * Enter detailed substeps for current step
         */
        async enterSubsteps() {
            if (!this.hasSubsteps()) return;

            this.currentSubstepIndex = 0;
            await this.showCurrentStep();
            this.emit('substeps:entered', { step: this.currentStepIndex });
        },

        /**
         * Exit substeps back to main step
         */
        async exitSubsteps() {
            if (this.currentSubstepIndex < 0) return;

            this.currentSubstepIndex = -1;
            await this.showCurrentStep();
            this.emit('substeps:exited', { step: this.currentStepIndex });
        },

        /**
         * Go to next step or substep
         */
        async nextStep() {
            if (this.isPaused) return;

            const mainStep = this.tourSteps[this.currentStepIndex];

            // In detailed mode with substeps
            if (this.tourMode === 'detailed' && this.currentSubstepIndex >= 0) {
                if (mainStep.substeps && this.currentSubstepIndex < mainStep.substeps.length - 1) {
                    // Next substep
                    this.currentSubstepIndex++;
                    await this.showCurrentStep();
                    this.saveProgress();
                    return;
                } else {
                    // End of substeps, go to next main step
                    this.currentSubstepIndex = -1;
                }
            }

            // Next main step
            if (this.currentStepIndex >= this.tourSteps.length - 1) {
                this.completeTour();
                return;
            }

            if (mainStep?.onExit) {
                await mainStep.onExit();
            }

            this.currentStepIndex++;
            this.currentSubstepIndex = -1;
            await this.showCurrentStep();
            this.saveProgress();
        },

        /**
         * Go to previous step or substep
         */
        async prevStep() {
            if (this.isPaused) return;

            // In substeps
            if (this.currentSubstepIndex > 0) {
                this.currentSubstepIndex--;
                await this.showCurrentStep();
                this.saveProgress();
                return;
            } else if (this.currentSubstepIndex === 0) {
                // Back to main step
                this.currentSubstepIndex = -1;
                await this.showCurrentStep();
                this.saveProgress();
                return;
            }

            // Previous main step
            if (this.currentStepIndex <= 0) return;

            const currentStep = this.tourSteps[this.currentStepIndex];
            if (currentStep?.onExit) {
                await currentStep.onExit();
            }

            this.currentStepIndex--;

            // In detailed mode, go to last substep of previous step
            if (this.tourMode === 'detailed') {
                const prevStep = this.tourSteps[this.currentStepIndex];
                if (prevStep.substeps?.length > 0) {
                    this.currentSubstepIndex = prevStep.substeps.length - 1;
                }
            }

            await this.showCurrentStep();
            this.saveProgress();
        },

        /**
         * Display the current step
         */
        async showCurrentStep() {
            const step = this.getCurrentStep();
            if (!step) return;

            // Call onEnter if defined
            if (step.onEnter) {
                await step.onEnter();
            }

            // Let adapter prepare the target
            if (this.adapter?.prepareTarget) {
                await this.adapter.prepareTarget(step);
            }

            // Update UI
            if (this.ui) {
                const mainStep = this.tourSteps[this.currentStepIndex];
                this.ui.showStep(step, this.getStepPosition(), {
                    hasSubsteps: this.hasSubsteps(),
                    inSubsteps: this.currentSubstepIndex >= 0,
                    tourMode: this.tourMode,
                    mainStepTitle: mainStep?.title
                });
            }

            this.emit('step:shown', { step, index: this.currentStepIndex, substepIndex: this.currentSubstepIndex });
        },

        /**
         * Complete the tour
         */
        completeTour() {
            this.saveProgress({ completed: true });
            this.stopTour();
            this.emit('tour:completed', { totalSteps: this.getTotalSteps() });
        },

        /**
         * Switch tour mode
         */
        setTourMode(mode) {
            if (mode === this.tourMode) return;
            this.tourMode = mode;
            this.currentSubstepIndex = -1;
            this.showCurrentStep();
            this.emit('mode:changed', { mode });
        },

        /**
         * Ask the AI tutor a question
         */
        async askAI(question) {
            if (!this.adapter?.sendAIMessage) {
                return 'AI assistance is not available for this application.';
            }

            const step = this.getCurrentStep();
            const context = {
                appName: this.config.appName,
                currentStep: step,
                stepIndex: this.currentStepIndex,
                substepIndex: this.currentSubstepIndex,
                totalSteps: this.getTotalSteps(),
                tourMode: this.tourMode,
                isPaused: this.isPaused
            };

            try {
                const response = await this.adapter.sendAIMessage(question, context);
                this.emit('ai:response', { question, response });
                return response;
            } catch (error) {
                console.error('[AI Tutor] AI error:', error);
                return 'I encountered an error processing your question. Please try again.';
            }
        },

        /**
         * Save progress to storage
         */
        saveProgress(extra = {}) {
            const data = {
                currentStepIndex: this.currentStepIndex,
                currentSubstepIndex: this.currentSubstepIndex,
                tourMode: this.tourMode,
                isPaused: this.isPaused,
                timestamp: Date.now(),
                ...extra
            };

            try {
                localStorage.setItem(`${PLUGIN_ID}-progress`, JSON.stringify(data));
            } catch (e) {
                console.warn('[AI Tutor] Could not save progress:', e);
            }
        },

        /**
         * Load progress from storage
         */
        loadProgress() {
            try {
                const data = localStorage.getItem(`${PLUGIN_ID}-progress`);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (!parsed.completed && Date.now() - parsed.timestamp < 86400000) {
                        this.currentStepIndex = parsed.currentStepIndex || 0;
                        this.currentSubstepIndex = parsed.currentSubstepIndex || -1;
                        this.tourMode = parsed.tourMode || 'quick';
                        return parsed;
                    }
                }
            } catch (e) {
                console.warn('[AI Tutor] Could not load progress:', e);
            }
            return null;
        },

        clearProgress() {
            try {
                localStorage.removeItem(`${PLUGIN_ID}-progress`);
            } catch (e) {
                console.warn('[AI Tutor] Could not clear progress:', e);
            }
        },

        hasProgress() {
            const progress = this.loadProgress();
            return progress && !progress.completed;
        },

        // Event system
        on(event, handler) {
            if (!this.eventHandlers.has(event)) {
                this.eventHandlers.set(event, []);
            }
            this.eventHandlers.get(event).push(handler);
        },

        off(event, handler) {
            const handlers = this.eventHandlers.get(event);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index > -1) handlers.splice(index, 1);
            }
        },

        emit(event, data) {
            const handlers = this.eventHandlers.get(event);
            if (handlers) {
                handlers.forEach(h => h(data));
            }
        }
    };

    // ========================================================================
    // TUTOR UI - Overlay, tooltip, chat, and highlight components
    // ========================================================================

    class TutorUI {
        constructor(config, core) {
            this.config = config;
            this.core = core;
            this.container = null;
            this.overlay = null;
            this.tooltip = null;
            this.chatPanel = null;
            this.controlBar = null;
            this.highlightBox = null;
            this.targetRect = null;
            this.isWaitingForAI = false;
        }

        render() {
            this.container = document.createElement('div');
            this.container.id = 'techne-ai-tutor-container';
            this.container.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="tutor-overlay"></div>
                <div class="tutor-highlight-box"></div>
                <div class="tutor-tooltip">
                    <div class="tutor-tooltip-header">
                        <div class="tutor-header-top">
                            <div class="tutor-step-indicator">
                                Step <span class="tutor-step-current">1</span> of <span class="tutor-step-total">1</span>
                            </div>
                            <div class="tutor-mode-toggle">
                                <button class="tutor-mode-btn tutor-mode-quick active" data-mode="quick" title="Quick overview">⚡ Quick</button>
                                <button class="tutor-mode-btn tutor-mode-detailed" data-mode="detailed" title="Detailed exploration">📚 Detailed</button>
                            </div>
                        </div>
                        <div class="tutor-tooltip-title"></div>
                        <div class="tutor-substep-indicator" style="display: none;"></div>
                    </div>
                    <div class="tutor-tooltip-content"></div>
                    <div class="tutor-tooltip-prompts"></div>
                    <div class="tutor-substep-offer" style="display: none;">
                        <button class="tutor-btn tutor-btn-substep">🔍 Learn More About This</button>
                    </div>
                    <div class="tutor-tooltip-actions">
                        <button class="tutor-btn tutor-btn-secondary tutor-btn-back" disabled>← Back</button>
                        <button class="tutor-btn tutor-btn-secondary tutor-btn-pause">⏸ Pause</button>
                        <button class="tutor-btn tutor-btn-secondary tutor-btn-skip">Skip</button>
                        <button class="tutor-btn tutor-btn-primary tutor-btn-next">Next →</button>
                    </div>
                    <div class="tutor-tooltip-hint">← → navigate • ESC exit • P pause • Q/D toggle mode</div>
                </div>
                <div class="tutor-chat-panel tutor-chat-minimized">
                    <div class="tutor-chat-header">
                        <span>💡 Ask AI Tutor</span>
                        <button class="tutor-chat-toggle">+</button>
                    </div>
                    <div class="tutor-chat-messages"></div>
                    <div class="tutor-chat-input-area">
                        <input type="text" class="tutor-chat-input" placeholder="Ask a question..." />
                        <button class="tutor-btn tutor-btn-primary tutor-chat-send">Ask</button>
                    </div>
                </div>
                <div class="tutor-control-bar" style="display: none;">
                    <span class="tutor-paused-text">⏸ Tour paused - Experiment freely!</span>
                    <button class="tutor-btn tutor-btn-primary tutor-btn-resume">▶ Resume Tour</button>
                </div>
            `;
            document.body.appendChild(this.container);

            this.overlay = this.container.querySelector('.tutor-overlay');
            this.tooltip = this.container.querySelector('.tutor-tooltip');
            this.chatPanel = this.container.querySelector('.tutor-chat-panel');
            this.controlBar = this.container.querySelector('.tutor-control-bar');
            this.highlightBox = this.container.querySelector('.tutor-highlight-box');

            this.bindEvents();
        }

        bindEvents() {
            // Navigation
            this.container.querySelector('.tutor-btn-back').addEventListener('click', () => this.core.prevStep());
            this.container.querySelector('.tutor-btn-next').addEventListener('click', () => this.core.nextStep());
            this.container.querySelector('.tutor-btn-skip').addEventListener('click', () => this.core.stopTour());
            this.container.querySelector('.tutor-btn-pause').addEventListener('click', () => this.core.pauseTour());
            this.container.querySelector('.tutor-btn-resume').addEventListener('click', () => this.core.resumeTour());

            // Mode toggle
            this.container.querySelectorAll('.tutor-mode-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const mode = btn.dataset.mode;
                    this.core.setTourMode(mode);
                    this.updateModeButtons(mode);
                });
            });

            // Substep button
            const substepBtn = this.container.querySelector('.tutor-btn-substep');
            if (substepBtn) {
                substepBtn.addEventListener('click', () => this.core.enterSubsteps());
            }

            // Chat
            const chatInput = this.container.querySelector('.tutor-chat-input');
            const chatSend = this.container.querySelector('.tutor-chat-send');

            chatSend.addEventListener('click', () => this.handleChatSend());
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleChatSend();
            });

            // Chat toggle
            this.container.querySelector('.tutor-chat-toggle').addEventListener('click', () => {
                this.chatPanel.classList.toggle('tutor-chat-minimized');
                const btn = this.container.querySelector('.tutor-chat-toggle');
                btn.textContent = this.chatPanel.classList.contains('tutor-chat-minimized') ? '+' : '−';
            });

            // Keyboard shortcuts
            this.keyHandler = (e) => {
                if (!this.core.isActive) return;
                // Ignore if typing in input
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

                if (e.key === 'Escape') {
                    this.core.stopTour();
                } else if (e.key === 'ArrowRight' && !this.core.isPaused) {
                    this.core.nextStep();
                } else if (e.key === 'ArrowLeft' && !this.core.isPaused) {
                    this.core.prevStep();
                } else if (e.key.toLowerCase() === 'p') {
                    if (this.core.isPaused) {
                        this.core.resumeTour();
                    } else {
                        this.core.pauseTour();
                    }
                } else if (e.key.toLowerCase() === 'q') {
                    this.core.setTourMode('quick');
                    this.updateModeButtons('quick');
                } else if (e.key.toLowerCase() === 'd') {
                    this.core.setTourMode('detailed');
                    this.updateModeButtons('detailed');
                }
            };
            document.addEventListener('keydown', this.keyHandler);

            // Window resize/scroll
            this.resizeHandler = () => this.updateTargetPosition();
            window.addEventListener('resize', this.resizeHandler);
            window.addEventListener('scroll', this.resizeHandler, true);
        }

        updateModeButtons(mode) {
            this.container.querySelectorAll('.tutor-mode-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === mode);
            });
        }

        async handleChatSend() {
            const input = this.container.querySelector('.tutor-chat-input');
            const question = input.value.trim();
            if (!question || this.isWaitingForAI) return;

            input.value = '';
            this.addChatMessage('user', question);
            this.isWaitingForAI = true;
            this.addChatMessage('assistant', '...', true);

            const response = await this.core.askAI(question);

            const messages = this.container.querySelector('.tutor-chat-messages');
            const loadingMsg = messages.querySelector('.tutor-chat-loading');
            if (loadingMsg) loadingMsg.remove();

            this.addChatMessage('assistant', response);
            this.isWaitingForAI = false;
        }

        addChatMessage(role, content, isLoading = false) {
            const messages = this.container.querySelector('.tutor-chat-messages');
            const msgDiv = document.createElement('div');
            msgDiv.className = `tutor-chat-message tutor-chat-${role}${isLoading ? ' tutor-chat-loading' : ''}`;
            msgDiv.textContent = content;
            messages.appendChild(msgDiv);
            messages.scrollTop = messages.scrollHeight;
        }

        showStep(step, position, options = {}) {
            const { hasSubsteps, inSubsteps, tourMode, mainStepTitle } = options;

            // Update step indicator
            this.container.querySelector('.tutor-step-current').textContent = position.current;
            this.container.querySelector('.tutor-step-total').textContent = position.total;

            // Update mode buttons
            this.updateModeButtons(tourMode);

            // Update substep indicator
            const substepIndicator = this.container.querySelector('.tutor-substep-indicator');
            if (inSubsteps && mainStepTitle) {
                substepIndicator.style.display = 'block';
                substepIndicator.textContent = `↳ Part of: ${mainStepTitle}`;
            } else {
                substepIndicator.style.display = 'none';
            }

            // Update content
            this.container.querySelector('.tutor-tooltip-title').textContent = step.title;
            this.container.querySelector('.tutor-tooltip-content').textContent = step.content;

            // Update prompts
            const promptsContainer = this.container.querySelector('.tutor-tooltip-prompts');
            promptsContainer.innerHTML = '';
            if (step.aiPrompts && step.aiPrompts.length > 0) {
                step.aiPrompts.forEach(prompt => {
                    const btn = document.createElement('button');
                    btn.className = 'tutor-prompt-btn';
                    btn.textContent = prompt;
                    btn.addEventListener('click', () => {
                        // Open chat panel and send question
                        this.chatPanel.classList.remove('tutor-chat-minimized');
                        this.container.querySelector('.tutor-chat-toggle').textContent = '−';
                        this.container.querySelector('.tutor-chat-input').value = prompt;
                        this.handleChatSend();
                    });
                    promptsContainer.appendChild(btn);
                });
            }

            // Show/hide substep offer
            const substepOffer = this.container.querySelector('.tutor-substep-offer');
            if (hasSubsteps && !inSubsteps && tourMode === 'quick') {
                substepOffer.style.display = 'block';
            } else {
                substepOffer.style.display = 'none';
            }

            // Update navigation
            this.container.querySelector('.tutor-btn-back').disabled = position.current === 1;
            this.container.querySelector('.tutor-btn-next').textContent =
                position.current === position.total ? 'Finish ✓' : 'Next →';

            // Position tooltip and highlight
            this.positionTooltip(step);
            this.updateHighlight(step);
            this.updateOverlay(step);
        }

        positionTooltip(step) {
            // Try multiple selectors if target not found
            let target = document.querySelector(step.target);

            // Fallback selectors for common targets
            if (!target && step.target) {
                const fallbacks = {
                    '#editor': '.editor-area, .monaco-editor, [data-mode-id]',
                    '.sidebar': '#file-tree, .file-tree, .sidebar-container',
                    '.toolbar': '.editor-toolbar, .format-toolbar, #toolbar',
                    '.mode-tabs': '.mode-switcher, .tab-bar, .navigation-tabs',
                    '#chat-pane': '.chat-container, #chat, .chat-pane',
                    '#preview-pane': '.preview-container, #preview, .preview-pane'
                };
                if (fallbacks[step.target]) {
                    target = document.querySelector(fallbacks[step.target]);
                }
            }

            if (!target) {
                this.tooltip.style.top = '50%';
                this.tooltip.style.left = '50%';
                this.tooltip.style.transform = 'translate(-50%, -50%)';
                this.targetRect = null;
                return;
            }

            const rect = target.getBoundingClientRect();
            this.targetRect = rect;

            // Scroll into view if needed
            if (rect.top < 0 || rect.bottom > window.innerHeight) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => this.positionTooltip(step), 300);
                return;
            }

            const padding = 20;
            const tooltipRect = this.tooltip.getBoundingClientRect();
            let top, left;

            switch (step.position) {
                case 'top':
                    top = rect.top - tooltipRect.height - padding;
                    left = rect.left + (rect.width - tooltipRect.width) / 2;
                    break;
                case 'bottom':
                    top = rect.bottom + padding;
                    left = rect.left + (rect.width - tooltipRect.width) / 2;
                    break;
                case 'left':
                    top = rect.top + (rect.height - tooltipRect.height) / 2;
                    left = rect.left - tooltipRect.width - padding;
                    break;
                case 'right':
                default:
                    top = rect.top + (rect.height - tooltipRect.height) / 2;
                    left = rect.right + padding;
                    break;
            }

            // Keep within viewport
            const maxLeft = window.innerWidth - tooltipRect.width - 16;
            const maxTop = window.innerHeight - tooltipRect.height - 16;
            left = Math.max(16, Math.min(left, maxLeft));
            top = Math.max(16, Math.min(top, maxTop));

            this.tooltip.style.top = `${top}px`;
            this.tooltip.style.left = `${left}px`;
            this.tooltip.style.transform = 'none';
        }

        updateHighlight(step) {
            if (!this.targetRect) {
                this.highlightBox.style.display = 'none';
                return;
            }

            const padding = 6;
            const rect = this.targetRect;

            this.highlightBox.style.display = 'block';
            this.highlightBox.style.top = `${rect.top - padding}px`;
            this.highlightBox.style.left = `${rect.left - padding}px`;
            this.highlightBox.style.width = `${rect.width + padding * 2}px`;
            this.highlightBox.style.height = `${rect.height + padding * 2}px`;
        }

        updateOverlay(step) {
            if (!step.spotlight || !this.targetRect) {
                this.overlay.style.clipPath = '';
                return;
            }

            const rect = this.targetRect;
            const padding = 8;

            const x = rect.left - padding;
            const y = rect.top - padding;
            const w = rect.width + padding * 2;
            const h = rect.height + padding * 2;

            this.overlay.style.clipPath = `polygon(
                0% 0%,
                0% 100%,
                ${x}px 100%,
                ${x}px ${y}px,
                ${x + w}px ${y}px,
                ${x + w}px ${y + h}px,
                ${x}px ${y + h}px,
                ${x}px 100%,
                100% 100%,
                100% 0%
            )`;
        }

        updateTargetPosition() {
            const step = this.core.getCurrentStep();
            if (step) {
                this.positionTooltip(step);
                this.updateHighlight(step);
                this.updateOverlay(step);
            }
        }

        showPausedState() {
            this.tooltip.style.display = 'none';
            this.overlay.style.display = 'none';
            this.highlightBox.style.display = 'none';
            this.controlBar.style.display = 'flex';
        }

        hidePausedState() {
            this.tooltip.style.display = 'block';
            this.overlay.style.display = 'block';
            this.controlBar.style.display = 'none';
        }

        destroy() {
            document.removeEventListener('keydown', this.keyHandler);
            window.removeEventListener('resize', this.resizeHandler);
            window.removeEventListener('scroll', this.resizeHandler, true);

            if (this.container && this.container.parentNode) {
                this.container.parentNode.removeChild(this.container);
            }

            this.container = null;
        }

        getStyles() {
            return `
                #techne-ai-tutor-container * {
                    box-sizing: border-box;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }

                .tutor-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.65);
                    z-index: 99990;
                    pointer-events: none;
                    transition: clip-path 0.3s ease;
                }

                /* Highlight box around target element */
                .tutor-highlight-box {
                    position: fixed;
                    border: 3px solid #E63946;
                    border-radius: 4px;
                    box-shadow: 0 0 0 4px rgba(230, 57, 70, 0.3), 0 0 20px rgba(230, 57, 70, 0.4);
                    pointer-events: none;
                    z-index: 99991;
                    transition: all 0.3s ease;
                    animation: tutor-highlight-pulse 2s infinite;
                }

                @keyframes tutor-highlight-pulse {
                    0%, 100% { box-shadow: 0 0 0 4px rgba(230, 57, 70, 0.3), 0 0 20px rgba(230, 57, 70, 0.4); }
                    50% { box-shadow: 0 0 0 6px rgba(230, 57, 70, 0.4), 0 0 30px rgba(230, 57, 70, 0.5); }
                }

                .tutor-tooltip {
                    position: fixed;
                    width: 400px;
                    max-width: calc(100vw - 32px);
                    background: #fff;
                    border: 2px solid #1a1a1a;
                    border-radius: 4px;
                    box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.15);
                    z-index: 99992;
                    transition: top 0.3s ease, left 0.3s ease;
                }

                .tutor-tooltip-header {
                    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
                    color: #fff;
                    padding: 14px 18px;
                    border-radius: 2px 2px 0 0;
                }

                .tutor-header-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }

                .tutor-step-indicator {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.15em;
                    opacity: 0.7;
                }

                .tutor-mode-toggle {
                    display: flex;
                    gap: 4px;
                }

                .tutor-mode-btn {
                    padding: 4px 10px;
                    font-size: 11px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 3px;
                    color: rgba(255, 255, 255, 0.7);
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .tutor-mode-btn:hover {
                    background: rgba(255, 255, 255, 0.2);
                    color: #fff;
                }

                .tutor-mode-btn.active {
                    background: #E63946;
                    border-color: #E63946;
                    color: #fff;
                }

                .tutor-tooltip-title {
                    font-size: 17px;
                    font-weight: 600;
                    line-height: 1.3;
                }

                .tutor-substep-indicator {
                    margin-top: 6px;
                    font-size: 11px;
                    opacity: 0.6;
                    font-style: italic;
                }

                .tutor-tooltip-content {
                    padding: 16px 18px;
                    font-size: 14px;
                    line-height: 1.6;
                    color: #333;
                }

                .tutor-tooltip-prompts {
                    padding: 0 18px 14px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }

                .tutor-prompt-btn {
                    padding: 6px 12px;
                    font-size: 12px;
                    background: #f5f5f5;
                    border: 1px solid #ddd;
                    border-radius: 3px;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: #555;
                }

                .tutor-prompt-btn:hover {
                    background: #E63946;
                    color: #fff;
                    border-color: #E63946;
                }

                .tutor-substep-offer {
                    padding: 0 18px 14px;
                }

                .tutor-btn-substep {
                    width: 100%;
                    padding: 10px;
                    font-size: 13px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border: none;
                    border-radius: 4px;
                    color: #fff;
                    cursor: pointer;
                    transition: transform 0.2s, box-shadow 0.2s;
                }

                .tutor-btn-substep:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }

                .tutor-tooltip-actions {
                    display: flex;
                    gap: 8px;
                    padding: 14px 18px;
                    border-top: 1px solid #eee;
                    background: #fafafa;
                }

                .tutor-btn {
                    padding: 8px 14px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                }

                .tutor-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                .tutor-btn-primary {
                    background: #E63946;
                    color: #fff;
                    border-color: #E63946;
                    margin-left: auto;
                }

                .tutor-btn-primary:hover:not(:disabled) {
                    background: #c62f3b;
                    transform: translateY(-1px);
                }

                .tutor-btn-secondary {
                    background: #fff;
                    color: #555;
                }

                .tutor-btn-secondary:hover:not(:disabled) {
                    background: #f5f5f5;
                    border-color: #ccc;
                }

                .tutor-tooltip-hint {
                    text-align: center;
                    padding: 8px 18px 12px;
                    font-size: 10px;
                    color: #999;
                    letter-spacing: 0.05em;
                }

                /* Chat Panel */
                .tutor-chat-panel {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    width: 340px;
                    background: #fff;
                    border: 2px solid #1a1a1a;
                    border-radius: 4px;
                    box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.15);
                    z-index: 99991;
                    display: flex;
                    flex-direction: column;
                    max-height: 420px;
                    transition: max-height 0.3s ease;
                }

                .tutor-chat-panel.tutor-chat-minimized {
                    max-height: 44px;
                    overflow: hidden;
                }

                .tutor-chat-header {
                    background: #1a1a1a;
                    color: #fff;
                    padding: 12px 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .tutor-chat-toggle {
                    background: transparent;
                    border: none;
                    color: #fff;
                    font-size: 20px;
                    cursor: pointer;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                }

                .tutor-chat-toggle:hover {
                    opacity: 1;
                }

                .tutor-chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 14px;
                    min-height: 180px;
                    max-height: 280px;
                    background: #fafafa;
                }

                .tutor-chat-message {
                    padding: 10px 14px;
                    margin-bottom: 10px;
                    font-size: 13px;
                    line-height: 1.5;
                    border-radius: 4px;
                }

                .tutor-chat-user {
                    background: #E63946;
                    color: #fff;
                    margin-left: 30px;
                    border-radius: 12px 12px 4px 12px;
                }

                .tutor-chat-assistant {
                    background: #fff;
                    border: 1px solid #e0e0e0;
                    margin-right: 30px;
                    border-radius: 12px 12px 12px 4px;
                }

                .tutor-chat-loading {
                    opacity: 0.6;
                    animation: tutor-pulse 1s infinite;
                }

                @keyframes tutor-pulse {
                    0%, 100% { opacity: 0.6; }
                    50% { opacity: 0.3; }
                }

                .tutor-chat-input-area {
                    display: flex;
                    gap: 8px;
                    padding: 12px;
                    border-top: 1px solid #eee;
                    background: #fff;
                }

                .tutor-chat-input {
                    flex: 1;
                    padding: 10px 14px;
                    font-size: 13px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    outline: none;
                    transition: border-color 0.2s;
                }

                .tutor-chat-input:focus {
                    border-color: #E63946;
                }

                .tutor-chat-send {
                    padding: 10px 16px;
                }

                /* Control Bar (paused state) */
                .tutor-control-bar {
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #fff;
                    border: 2px solid #1a1a1a;
                    border-radius: 4px;
                    box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.15);
                    padding: 14px 24px;
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    z-index: 99992;
                }

                .tutor-paused-text {
                    font-size: 14px;
                    font-weight: 600;
                    color: #555;
                }

                /* Dark mode */
                @media (prefers-color-scheme: dark) {
                    .tutor-tooltip,
                    .tutor-chat-panel,
                    .tutor-control-bar {
                        background: #1e1e1e;
                        border-color: #444;
                        color: #e0e0e0;
                    }

                    .tutor-tooltip-content {
                        color: #ccc;
                    }

                    .tutor-tooltip-actions,
                    .tutor-chat-input-area {
                        background: #252525;
                        border-color: #333;
                    }

                    .tutor-btn-secondary {
                        background: #2a2a2a;
                        border-color: #444;
                        color: #ccc;
                    }

                    .tutor-btn-secondary:hover:not(:disabled) {
                        background: #333;
                    }

                    .tutor-prompt-btn {
                        background: #2a2a2a;
                        border-color: #444;
                        color: #bbb;
                    }

                    .tutor-chat-messages {
                        background: #1a1a1a;
                    }

                    .tutor-chat-assistant {
                        background: #2a2a2a;
                        border-color: #444;
                    }

                    .tutor-chat-input {
                        background: #2a2a2a;
                        border-color: #444;
                        color: #e0e0e0;
                    }

                    .tutor-paused-text {
                        color: #ccc;
                    }
                }
            `;
        }
    }

    // ========================================================================
    // PLUGIN REGISTRATION
    // ========================================================================

    const plugin = {
        id: PLUGIN_ID,

        init(host) {
            console.log('[AI Tutor] Plugin initializing...');

            const isElectron = Boolean(window.electronAPI?.isElectron);

            this.host = host;
            this.core = TutorCore;

            // Expose global API
            window.TechneAITutor = {
                start: (options) => TutorCore.startTour(options),
                stop: () => TutorCore.stopTour(),
                pause: () => TutorCore.pauseTour(),
                resume: () => TutorCore.resumeTour(),
                next: () => TutorCore.nextStep(),
                prev: () => TutorCore.prevStep(),
                ask: (question) => TutorCore.askAI(question),
                setMode: (mode) => TutorCore.setTourMode(mode),
                hasProgress: () => TutorCore.hasProgress(),
                clearProgress: () => TutorCore.clearProgress(),
                isActive: () => TutorCore.isActive,
                isPaused: () => TutorCore.isPaused,
                on: (event, handler) => TutorCore.on(event, handler),
                off: (event, handler) => TutorCore.off(event, handler)
            };

            if (isElectron) {
                this.initElectronTutor(host);
            } else {
                this.initWebTutor(host);
            }

            this.addTriggerButton(isElectron);

            host.log('AI Tutor plugin initialized');
            host.emit('ai-tutor:ready', { isElectron });
        },

        initElectronTutor(host) {
            const adapter = {
                async sendAIMessage(question, context) {
                    const systemPrompt = `You are an AI tutor helping a user learn the NightOwl markdown editor.
Context: Step ${context.stepIndex + 1}/${context.totalSteps} - "${context.currentStep?.title}"
Mode: ${context.tourMode} tour, ${context.isPaused ? 'paused for experimentation' : 'active'}

Be concise, friendly, and practical. Focus on the current feature. Use markdown formatting.`;

                    try {
                        const response = await window.electronAPI.invoke('send-chat-message-with-options', {
                            message: question,
                            systemMessage: systemPrompt,
                            options: { temperature: 0.7, maxTokens: 400 }
                        });
                        return response?.content || response || 'I could not generate a response.';
                    } catch (error) {
                        console.error('[AI Tutor] Electron AI error:', error);
                        throw error;
                    }
                },

                async prepareTarget(step) {
                    if (step.target === '#chat-pane' && window.showPane) {
                        window.showPane('chat');
                    } else if (step.target === '#preview-pane' && window.showPane) {
                        window.showPane('preview');
                    }
                    await new Promise(r => setTimeout(r, 150));
                }
            };

            TutorCore.init({
                appName: 'NightOwl',
                appType: 'electron',
                adapter,
                tourSteps: this.getNightOwlTourSteps()
            });
        },

        initWebTutor(host) {
            const adapter = {
                async sendAIMessage(question, context) {
                    const systemPrompt = `You are an AI tutor helping a user learn Machine Spirits.
Context: Step ${context.stepIndex + 1}/${context.totalSteps} - "${context.currentStep?.title}"
Mode: ${context.tourMode} tour, ${context.isPaused ? 'paused' : 'active'}

Be concise and supportive. Guide toward deeper learning.`;

                    try {
                        const response = await fetch('/api/chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ message: question, systemPrompt, provider: 'gemini' })
                        });

                        if (response.ok) {
                            const data = await response.json();
                            return data.reply || data.response || data.message || 'No response generated.';
                        }
                        throw new Error('API request failed');
                    } catch (error) {
                        console.error('[AI Tutor] Web AI error:', error);
                        throw error;
                    }
                },

                async prepareTarget(step) {
                    if (step.target.startsWith('#') && !step.target.includes(' ')) {
                        const section = document.querySelector(step.target);
                        if (section) {
                            section.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }
                    await new Promise(r => setTimeout(r, 200));
                }
            };

            TutorCore.init({
                appName: 'Machine Spirits',
                appType: 'web',
                adapter,
                tourSteps: this.getMachineSpiritsTourSteps()
            });
        },

        addTriggerButton(isElectron) {
            const button = document.createElement('button');
            button.id = 'tutor-trigger-btn';
            button.innerHTML = '?';
            button.title = 'Start AI-Guided Tour';

            // Style to match app UI better
            if (isElectron) {
                // NightOwl: match the pane toggle buttons style
                button.style.cssText = `
                    position: fixed;
                    z-index: 9999;
                    top: 6px;
                    right: 160px;
                    width: 28px;
                    height: 28px;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 4px;
                    background: rgba(255, 255, 255, 0.1);
                    color: rgba(255, 255, 255, 0.8);
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                `;
            } else {
                // Machine Spirits: match the top-right icon style
                button.style.cssText = `
                    position: fixed;
                    z-index: 9999;
                    top: 16px;
                    right: 64px;
                    width: 40px;
                    height: 40px;
                    border: 2px solid var(--black, #0a0a0a);
                    background: var(--white, #fff);
                    color: var(--black, #0a0a0a);
                    cursor: pointer;
                    font-size: 18px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 3px 3px 0 var(--black, rgba(0,0,0,0.8));
                    transition: all 0.2s;
                    font-family: 'Space Mono', monospace;
                `;
            }

            button.addEventListener('mouseenter', () => {
                if (isElectron) {
                    button.style.background = 'rgba(255, 255, 255, 0.2)';
                    button.style.color = '#fff';
                } else {
                    button.style.transform = 'translate(-2px, -2px)';
                    button.style.boxShadow = '5px 5px 0 var(--black, rgba(0,0,0,0.8))';
                }
            });

            button.addEventListener('mouseleave', () => {
                if (isElectron) {
                    button.style.background = 'rgba(255, 255, 255, 0.1)';
                    button.style.color = 'rgba(255, 255, 255, 0.8)';
                } else {
                    button.style.transform = 'none';
                    button.style.boxShadow = '3px 3px 0 var(--black, rgba(0,0,0,0.8))';
                }
            });

            button.addEventListener('click', () => {
                if (TutorCore.isActive) {
                    TutorCore.stopTour();
                } else {
                    this.showStartDialog();
                }
            });

            document.body.appendChild(button);
        },

        showStartDialog() {
            const hasProgress = TutorCore.hasProgress();

            const dialog = document.createElement('div');
            dialog.id = 'tutor-start-dialog';
            dialog.innerHTML = `
                <style>
                    #tutor-start-dialog {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0, 0, 0, 0.5);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 100000;
                        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    }
                    .tutor-dialog-box {
                        background: #fff;
                        border: 2px solid #1a1a1a;
                        border-radius: 8px;
                        padding: 24px;
                        max-width: 400px;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    }
                    .tutor-dialog-title {
                        font-size: 20px;
                        font-weight: 600;
                        margin-bottom: 12px;
                    }
                    .tutor-dialog-text {
                        color: #666;
                        margin-bottom: 20px;
                        line-height: 1.5;
                    }
                    .tutor-dialog-options {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }
                    .tutor-dialog-btn {
                        padding: 14px 20px;
                        border: 2px solid #1a1a1a;
                        border-radius: 6px;
                        font-size: 14px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                        text-align: left;
                    }
                    .tutor-dialog-btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    }
                    .tutor-dialog-btn.primary {
                        background: #E63946;
                        color: #fff;
                        border-color: #E63946;
                    }
                    .tutor-dialog-btn.secondary {
                        background: #fff;
                        color: #333;
                    }
                    .tutor-dialog-btn small {
                        display: block;
                        margin-top: 4px;
                        opacity: 0.7;
                        font-weight: normal;
                    }
                    .tutor-dialog-cancel {
                        margin-top: 16px;
                        text-align: center;
                    }
                    .tutor-dialog-cancel button {
                        background: none;
                        border: none;
                        color: #999;
                        cursor: pointer;
                        font-size: 13px;
                    }
                    .tutor-dialog-cancel button:hover {
                        color: #666;
                    }
                    @media (prefers-color-scheme: dark) {
                        .tutor-dialog-box { background: #1e1e1e; color: #e0e0e0; }
                        .tutor-dialog-text { color: #aaa; }
                        .tutor-dialog-btn.secondary { background: #2a2a2a; color: #ddd; border-color: #444; }
                    }
                </style>
                <div class="tutor-dialog-box">
                    <div class="tutor-dialog-title">🎓 Start Guided Tour</div>
                    <div class="tutor-dialog-text">
                        Learn how to use ${TutorCore.config?.appName || 'this application'} with an AI-powered guided tour.
                    </div>
                    <div class="tutor-dialog-options">
                        ${hasProgress ? `
                            <button class="tutor-dialog-btn primary" data-action="resume">
                                ▶ Continue Where You Left Off
                            </button>
                        ` : ''}
                        <button class="tutor-dialog-btn ${hasProgress ? 'secondary' : 'primary'}" data-action="quick">
                            ⚡ Quick Tour
                            <small>~3 minutes • High-level overview</small>
                        </button>
                        <button class="tutor-dialog-btn secondary" data-action="detailed">
                            📚 Detailed Tour
                            <small>~10 minutes • In-depth exploration</small>
                        </button>
                    </div>
                    <div class="tutor-dialog-cancel">
                        <button data-action="cancel">Cancel</button>
                    </div>
                </div>
            `;

            dialog.addEventListener('click', (e) => {
                const action = e.target.closest('[data-action]')?.dataset.action;
                if (action === 'cancel' || e.target === dialog) {
                    dialog.remove();
                } else if (action === 'resume') {
                    dialog.remove();
                    const progress = TutorCore.loadProgress();
                    TutorCore.startTour({
                        startStep: progress?.currentStepIndex || 0,
                        mode: progress?.tourMode || 'quick'
                    });
                } else if (action === 'quick') {
                    dialog.remove();
                    TutorCore.clearProgress();
                    TutorCore.startTour({ mode: 'quick' });
                } else if (action === 'detailed') {
                    dialog.remove();
                    TutorCore.clearProgress();
                    TutorCore.startTour({ mode: 'detailed' });
                }
            });

            document.body.appendChild(dialog);
        },

        // ====================================================================
        // NIGHTOWL TOUR STEPS
        // ====================================================================
        getNightOwlTourSteps() {
            return [
                {
                    id: 'welcome',
                    target: '.editor-container',
                    title: 'Welcome to NightOwl',
                    content: 'NightOwl is a powerful markdown editor for academic writing, presentations, and knowledge management.',
                    position: 'right',
                    spotlight: false,
                    aiPrompts: ['What can I do with NightOwl?', 'What makes it different from other editors?']
                },
                {
                    id: 'editor',
                    target: '#editor',
                    title: 'The Monaco Editor',
                    content: 'Write in a world-class editor with syntax highlighting, auto-completion, and visual markdown rendering.',
                    position: 'right',
                    spotlight: true,
                    aiPrompts: ['What keyboard shortcuts work here?', 'How do I format text?'],
                    substeps: [
                        {
                            id: 'editor-formatting',
                            target: '#editor',
                            title: 'Text Formatting',
                            content: 'Use **bold**, *italic*, `code`, and other markdown syntax. The visual mode shows formatting inline.',
                            position: 'right',
                            spotlight: true,
                            aiPrompts: ['Show me all formatting options', 'How do I create headers?']
                        },
                        {
                            id: 'editor-images',
                            target: '#editor',
                            title: 'Images & Media',
                            content: 'Drag images directly into the editor. They render inline so you see your content as you write.',
                            position: 'right',
                            spotlight: true,
                            aiPrompts: ['How do I resize images?', 'What image formats work?']
                        },
                        {
                            id: 'editor-links',
                            target: '#editor',
                            title: 'Links & Wiki Links',
                            content: 'Create [[wiki-style links]] to connect documents. Ctrl+Click to navigate between files.',
                            position: 'right',
                            spotlight: true,
                            aiPrompts: ['How do wiki links work?', 'Can I link to headings?']
                        }
                    ]
                },
                {
                    id: 'file-tree',
                    target: '.sidebar',
                    title: 'File Navigation',
                    content: 'Your workspace files appear here. Add folders, organize documents, and navigate your projects.',
                    position: 'right',
                    spotlight: true,
                    aiPrompts: ['How do I add folders?', 'Can I search for files?'],
                    substeps: [
                        {
                            id: 'files-add',
                            target: '.sidebar',
                            title: 'Adding Folders',
                            content: 'Click the folder icon or use File menu to add workspace folders. Multiple projects can be open at once.',
                            position: 'right',
                            spotlight: true,
                            aiPrompts: ['Can I have multiple workspaces?']
                        },
                        {
                            id: 'files-structure',
                            target: '.sidebar',
                            title: 'Structure View',
                            content: 'The Structure tab shows your document outline - headings, links, and references.',
                            position: 'right',
                            spotlight: true,
                            aiPrompts: ['How do I navigate large documents?']
                        }
                    ]
                },
                {
                    id: 'preview',
                    target: '#preview-pane',
                    title: 'Preview Pane',
                    content: 'See your rendered markdown. Toggle with 👁 button or Cmd+P. Syncs with your cursor position.',
                    position: 'left',
                    spotlight: true,
                    aiPrompts: ['Can I export to PDF?', 'How do I customize preview?']
                },
                {
                    id: 'chat',
                    target: '#chat-pane',
                    title: 'AI Chat Assistant',
                    content: 'Meet Dr. Chen! Get writing feedback, ask questions, or use commands like /analyze and /improve.',
                    position: 'left',
                    spotlight: true,
                    aiPrompts: ['What slash commands are available?', 'How do I get feedback?'],
                    substeps: [
                        {
                            id: 'chat-commands',
                            target: '#chat-pane',
                            title: 'Slash Commands',
                            content: '/analyze - Document analysis, /summarize - Quick summary, /improve - Writing enhancement, /explain - Clarify concepts',
                            position: 'left',
                            spotlight: true,
                            aiPrompts: ['What else can Dr. Chen do?']
                        },
                        {
                            id: 'chat-ash',
                            target: '.toolbar',
                            title: 'Quick Assistant: Ash',
                            content: 'The 🅰 button invokes Ash for quick inline help. Cmd+Shift+\' is the shortcut.',
                            position: 'bottom',
                            spotlight: true,
                            aiPrompts: ['How is Ash different from Dr. Chen?']
                        }
                    ]
                },
                {
                    id: 'modes',
                    target: '.mode-tabs',
                    title: 'Application Modes',
                    content: 'Switch between Editor, Presentation, Network Graph, Maze, and Circle modes.',
                    position: 'bottom',
                    spotlight: true,
                    aiPrompts: ['What is Presentation mode?', 'How does Network Graph work?'],
                    substeps: [
                        {
                            id: 'mode-presentation',
                            target: '.mode-tabs',
                            title: 'Presentation Mode',
                            content: 'Turn your markdown into slideshows! Use --- to separate slides. Themes and speaker notes supported.',
                            position: 'bottom',
                            spotlight: true,
                            aiPrompts: ['How do I create slides?', 'What themes are available?']
                        },
                        {
                            id: 'mode-network',
                            target: '.mode-tabs',
                            title: 'Network Graph',
                            content: 'Visualize connections between files, headings, and tags. Click nodes to navigate.',
                            position: 'bottom',
                            spotlight: true,
                            aiPrompts: ['How do I use the graph?', 'Can I filter the graph?']
                        }
                    ]
                },
                {
                    id: 'complete',
                    target: '.editor-container',
                    title: 'Ready to Write!',
                    content: 'You\'ve got the basics! Press ? anytime for keyboard shortcuts. The AI Tutor is always here to help.',
                    position: 'right',
                    spotlight: false,
                    aiPrompts: ['What should I try first?', 'Any writing tips?']
                }
            ];
        },

        // ====================================================================
        // MACHINE SPIRITS TOUR STEPS
        // ====================================================================
        getMachineSpiritsTourSteps() {
            return [
                {
                    id: 'welcome',
                    target: '#hero-card',
                    title: 'Welcome to Machine Spirits',
                    content: 'Explore philosophy and AI through interactive courses, articles, and simulations.',
                    position: 'bottom',
                    spotlight: true,
                    aiPrompts: ['What is this platform about?', 'Where should I start?']
                },
                {
                    id: 'courses',
                    target: '#courses',
                    title: 'Study: Courses',
                    content: 'Structured courses on phenomenology, dialectics, and AI. Each has lectures with activities.',
                    position: 'top',
                    spotlight: true,
                    aiPrompts: ['What courses are available?', 'How do I enroll?'],
                    substeps: [
                        {
                            id: 'courses-enroll',
                            target: '#courses',
                            title: 'Enrollment',
                            content: 'Click a course card to see details. Sign in to enroll and track your progress.',
                            position: 'top',
                            spotlight: true,
                            aiPrompts: ['Is enrollment free?']
                        },
                        {
                            id: 'courses-activities',
                            target: '#courses',
                            title: 'Course Activities',
                            content: 'Each lecture contains interactive activities - timelines, networks, discussions.',
                            position: 'top',
                            spotlight: true,
                            aiPrompts: ['What types of activities are there?']
                        }
                    ]
                },
                {
                    id: 'articles',
                    target: '#articles',
                    title: 'Read: Articles',
                    content: 'In-depth articles with embedded activities. Complete them to test understanding.',
                    position: 'top',
                    spotlight: true,
                    aiPrompts: ['How do activities work?', 'Is my progress saved?']
                },
                {
                    id: 'simulations',
                    target: '#lab',
                    title: 'Simulate: Experiments',
                    content: 'Interactive JavaScript simulations. See philosophical concepts come to life!',
                    position: 'top',
                    spotlight: true,
                    aiPrompts: ['What simulations can I run?', 'How do I modify them?'],
                    substeps: [
                        {
                            id: 'sim-js',
                            target: '#lab',
                            title: 'JavaScript Sandbox',
                            content: 'Edit and run JavaScript directly. Use AI Assist to understand or modify code.',
                            position: 'top',
                            spotlight: true,
                            aiPrompts: ['How does AI Assist work?']
                        },
                        {
                            id: 'sim-canvas',
                            target: '#lab',
                            title: 'Canvas Visualizations',
                            content: 'Visual experiments using HTML Canvas. Watch emergent behaviors unfold.',
                            position: 'top',
                            spotlight: true,
                            aiPrompts: ['What can Canvas simulations show?']
                        }
                    ]
                },
                {
                    id: 'chat',
                    target: '#chat',
                    title: 'Converse: AI Discussion',
                    content: 'Philosophical dialogue with AI. Multiple models available for different perspectives.',
                    position: 'top',
                    spotlight: true,
                    aiPrompts: ['What topics can I discuss?', 'Which AI model is best?']
                },
                {
                    id: 'user-menu',
                    target: '.fixed.top-4.right-4',
                    title: 'Your Account',
                    content: 'Dashboard, enrollments, progress, and AI settings are all accessible here.',
                    position: 'left',
                    spotlight: true,
                    aiPrompts: ['How do I track progress?', 'What\'s in the dashboard?']
                },
                {
                    id: 'complete',
                    target: '#hero-card',
                    title: 'Start Learning!',
                    content: 'You\'re ready! Press ? for shortcuts. Try a course or explore articles.',
                    position: 'bottom',
                    spotlight: false,
                    aiPrompts: ['What\'s the best course for beginners?', 'How do I earn progress?']
                }
            ];
        },

        destroy() {
            TutorCore.stopTour();

            const trigger = document.getElementById('tutor-trigger-btn');
            if (trigger) trigger.remove();

            const dialog = document.getElementById('tutor-start-dialog');
            if (dialog) dialog.remove();

            delete window.TechneAITutor;

            this.host?.log('AI Tutor plugin destroyed');
        }
    };

    // Register the plugin
    if (window.TechnePlugins) {
        window.TechnePlugins.register(plugin);
    } else {
        window.TECHNE_PLUGIN_QUEUE = window.TECHNE_PLUGIN_QUEUE || [];
        window.TECHNE_PLUGIN_QUEUE.push(plugin);
    }

})();
