/**
 * Techne AI Tutor Plugin
 *
 * An AI-powered guided tour system that provides interactive tutorials
 * for Techne-based applications. Supports pause/resume, AI explanations,
 * and app-specific adaptations.
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
     * Tour step definition
     * @typedef {Object} TourStep
     * @property {string} id - Unique step identifier
     * @property {string} target - CSS selector or special target identifier
     * @property {string} title - Step title
     * @property {string} content - Step description/instruction
     * @property {string} position - Tooltip position: top|bottom|left|right
     * @property {boolean} [spotlight] - Whether to spotlight the target
     * @property {string} [action] - Action to demonstrate: click|type|hover|scroll
     * @property {string} [actionTarget] - Target for the action
     * @property {string[]} [aiPrompts] - Suggested AI questions for this step
     * @property {boolean} [allowInteraction] - Allow user to interact with target
     * @property {Function} [onEnter] - Callback when entering step
     * @property {Function} [onExit] - Callback when leaving step
     */

    /**
     * Tutor configuration
     * @typedef {Object} TutorConfig
     * @property {string} appName - Application name for AI context
     * @property {string} appType - 'electron' or 'web'
     * @property {TourStep[]} tourSteps - Steps for the guided tour
     * @property {Object} adapter - App-specific adapter with AI/UI methods
     */

    const TutorCore = {
        // State
        isActive: false,
        isPaused: false,
        currentStepIndex: 0,
        tourSteps: [],
        config: null,
        adapter: null,
        ui: null,

        // Event handlers
        eventHandlers: new Map(),

        /**
         * Initialize the tutor with configuration
         * @param {TutorConfig} config
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
         * @param {number} [startStep=0] - Step index to start from
         */
        async startTour(startStep = 0) {
            if (this.isActive) return;

            this.isActive = true;
            this.isPaused = false;
            this.currentStepIndex = startStep;

            // Create UI
            this.ui = new TutorUI(this.config, this);
            this.ui.render();

            // Show first step
            await this.showStep(this.currentStepIndex);

            this.emit('tour:started', { step: this.currentStepIndex });
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

            this.showStep(this.currentStepIndex);
            this.emit('tour:resumed', { step: this.currentStepIndex });
        },

        /**
         * Go to next step
         */
        async nextStep() {
            if (this.isPaused) return;
            if (this.currentStepIndex >= this.tourSteps.length - 1) {
                this.completeTour();
                return;
            }

            const currentStep = this.tourSteps[this.currentStepIndex];
            if (currentStep?.onExit) {
                await currentStep.onExit();
            }

            this.currentStepIndex++;
            await this.showStep(this.currentStepIndex);
            this.saveProgress();
        },

        /**
         * Go to previous step
         */
        async prevStep() {
            if (this.isPaused) return;
            if (this.currentStepIndex <= 0) return;

            const currentStep = this.tourSteps[this.currentStepIndex];
            if (currentStep?.onExit) {
                await currentStep.onExit();
            }

            this.currentStepIndex--;
            await this.showStep(this.currentStepIndex);
            this.saveProgress();
        },

        /**
         * Jump to a specific step
         * @param {number} index
         */
        async goToStep(index) {
            if (index < 0 || index >= this.tourSteps.length) return;

            const currentStep = this.tourSteps[this.currentStepIndex];
            if (currentStep?.onExit) {
                await currentStep.onExit();
            }

            this.currentStepIndex = index;
            await this.showStep(index);
            this.saveProgress();
        },

        /**
         * Display a specific step
         * @param {number} index
         */
        async showStep(index) {
            const step = this.tourSteps[index];
            if (!step) return;

            // Call onEnter if defined
            if (step.onEnter) {
                await step.onEnter();
            }

            // Let adapter prepare the target (e.g., navigate, open panel)
            if (this.adapter?.prepareTarget) {
                await this.adapter.prepareTarget(step);
            }

            // Update UI
            if (this.ui) {
                this.ui.showStep(step, index, this.tourSteps.length);
            }

            this.emit('step:shown', { step, index });
        },

        /**
         * Complete the tour
         */
        completeTour() {
            this.saveProgress({ completed: true });
            this.stopTour();
            this.emit('tour:completed', { totalSteps: this.tourSteps.length });
        },

        /**
         * Ask the AI tutor a question
         * @param {string} question
         * @returns {Promise<string>}
         */
        async askAI(question) {
            if (!this.adapter?.sendAIMessage) {
                return 'AI assistance is not available for this application.';
            }

            const step = this.tourSteps[this.currentStepIndex];
            const context = {
                appName: this.config.appName,
                currentStep: step,
                stepIndex: this.currentStepIndex,
                totalSteps: this.tourSteps.length,
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
                    // Only restore if not completed and recent (within 24 hours)
                    if (!parsed.completed && Date.now() - parsed.timestamp < 86400000) {
                        this.currentStepIndex = parsed.currentStepIndex || 0;
                        return parsed;
                    }
                }
            } catch (e) {
                console.warn('[AI Tutor] Could not load progress:', e);
            }
            return null;
        },

        /**
         * Clear saved progress
         */
        clearProgress() {
            try {
                localStorage.removeItem(`${PLUGIN_ID}-progress`);
            } catch (e) {
                console.warn('[AI Tutor] Could not clear progress:', e);
            }
        },

        /**
         * Check if there's a tour in progress
         */
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
    // TUTOR UI - Overlay, tooltip, and chat components
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
            this.targetRect = null;
            this.chatMessages = [];
            this.isWaitingForAI = false;
        }

        render() {
            // Create container
            this.container = document.createElement('div');
            this.container.id = 'techne-ai-tutor-container';
            this.container.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="tutor-overlay"></div>
                <div class="tutor-tooltip">
                    <div class="tutor-tooltip-header">
                        <div class="tutor-step-indicator">Step <span class="tutor-step-current">1</span> of <span class="tutor-step-total">1</span></div>
                        <div class="tutor-tooltip-title"></div>
                    </div>
                    <div class="tutor-tooltip-content"></div>
                    <div class="tutor-tooltip-prompts"></div>
                    <div class="tutor-tooltip-actions">
                        <button class="tutor-btn tutor-btn-secondary tutor-btn-back" disabled>← Back</button>
                        <button class="tutor-btn tutor-btn-secondary tutor-btn-pause">⏸ Pause</button>
                        <button class="tutor-btn tutor-btn-secondary tutor-btn-skip">Skip</button>
                        <button class="tutor-btn tutor-btn-primary tutor-btn-next">Next →</button>
                    </div>
                    <div class="tutor-tooltip-hint">← → to navigate • ESC to exit • P to pause</div>
                </div>
                <div class="tutor-chat-panel">
                    <div class="tutor-chat-header">
                        <span>💡 AI Tutor</span>
                        <button class="tutor-chat-toggle">−</button>
                    </div>
                    <div class="tutor-chat-messages"></div>
                    <div class="tutor-chat-input-area">
                        <input type="text" class="tutor-chat-input" placeholder="Ask a question..." />
                        <button class="tutor-btn tutor-btn-primary tutor-chat-send">Ask</button>
                    </div>
                </div>
                <div class="tutor-control-bar tutor-paused-bar" style="display: none;">
                    <span class="tutor-paused-text">⏸ Tour paused - Experiment freely!</span>
                    <button class="tutor-btn tutor-btn-primary tutor-btn-resume">▶ Resume Tour</button>
                </div>
            `;
            document.body.appendChild(this.container);

            // Get references
            this.overlay = this.container.querySelector('.tutor-overlay');
            this.tooltip = this.container.querySelector('.tutor-tooltip');
            this.chatPanel = this.container.querySelector('.tutor-chat-panel');
            this.controlBar = this.container.querySelector('.tutor-control-bar');

            // Bind events
            this.bindEvents();
        }

        bindEvents() {
            // Navigation buttons
            this.container.querySelector('.tutor-btn-back').addEventListener('click', () => this.core.prevStep());
            this.container.querySelector('.tutor-btn-next').addEventListener('click', () => this.core.nextStep());
            this.container.querySelector('.tutor-btn-skip').addEventListener('click', () => this.core.stopTour());
            this.container.querySelector('.tutor-btn-pause').addEventListener('click', () => this.core.pauseTour());
            this.container.querySelector('.tutor-btn-resume').addEventListener('click', () => this.core.resumeTour());

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
                }
            };
            document.addEventListener('keydown', this.keyHandler);

            // Window resize
            this.resizeHandler = () => this.updateTargetPosition();
            window.addEventListener('resize', this.resizeHandler);
            window.addEventListener('scroll', this.resizeHandler, true);
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

            // Remove loading message
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

        showStep(step, index, total) {
            // Update step indicator
            this.container.querySelector('.tutor-step-current').textContent = index + 1;
            this.container.querySelector('.tutor-step-total').textContent = total;

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
                        this.container.querySelector('.tutor-chat-input').value = prompt;
                        this.handleChatSend();
                    });
                    promptsContainer.appendChild(btn);
                });
            }

            // Update navigation buttons
            this.container.querySelector('.tutor-btn-back').disabled = index === 0;
            this.container.querySelector('.tutor-btn-next').textContent = index === total - 1 ? 'Finish ✓' : 'Next →';

            // Position tooltip near target
            this.positionTooltip(step);

            // Update overlay spotlight
            this.updateOverlay(step);
        }

        positionTooltip(step) {
            const target = document.querySelector(step.target);
            if (!target) {
                // No target, center the tooltip
                this.tooltip.style.top = '50%';
                this.tooltip.style.left = '50%';
                this.tooltip.style.transform = 'translate(-50%, -50%)';
                this.targetRect = null;
                return;
            }

            const rect = target.getBoundingClientRect();
            this.targetRect = rect;

            // Scroll target into view if needed
            if (rect.top < 0 || rect.bottom > window.innerHeight) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Recalculate after scroll
                setTimeout(() => this.positionTooltip(step), 300);
                return;
            }

            const padding = 16;
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

        updateOverlay(step) {
            if (!step.spotlight || !this.targetRect) {
                this.overlay.style.background = 'rgba(0, 0, 0, 0.7)';
                this.overlay.style.clipPath = '';
                return;
            }

            const rect = this.targetRect;
            const padding = 8;

            // Create spotlight cutout using clip-path
            const x = rect.left - padding;
            const y = rect.top - padding;
            const w = rect.width + padding * 2;
            const h = rect.height + padding * 2;

            this.overlay.style.background = 'rgba(0, 0, 0, 0.7)';
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
            const step = this.core.tourSteps[this.core.currentStepIndex];
            if (step) {
                this.positionTooltip(step);
                this.updateOverlay(step);
            }
        }

        showPausedState() {
            this.tooltip.style.display = 'none';
            this.overlay.style.display = 'none';
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
            this.overlay = null;
            this.tooltip = null;
            this.chatPanel = null;
        }

        getStyles() {
            return `
                #techne-ai-tutor-container * {
                    box-sizing: border-box;
                    font-family: 'Space Mono', 'Monaco', 'Consolas', monospace;
                }

                .tutor-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    z-index: 99990;
                    pointer-events: none;
                    transition: clip-path 0.3s ease;
                }

                .tutor-tooltip {
                    position: fixed;
                    width: 380px;
                    background: #fff;
                    border: 2px solid #0a0a0a;
                    box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.9);
                    z-index: 99992;
                    transition: top 0.3s ease, left 0.3s ease;
                }

                .tutor-tooltip-header {
                    background: #0a0a0a;
                    color: #fff;
                    padding: 12px 16px;
                    position: relative;
                }

                .tutor-tooltip-header::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    right: 0;
                    width: 60px;
                    height: 100%;
                    background: #E63946;
                    clip-path: polygon(100% 0, 0 0, 100% 100%);
                }

                .tutor-step-indicator {
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.2em;
                    opacity: 0.6;
                    margin-bottom: 4px;
                }

                .tutor-tooltip-title {
                    font-size: 16px;
                    font-weight: bold;
                }

                .tutor-tooltip-content {
                    padding: 16px;
                    font-size: 14px;
                    line-height: 1.6;
                    color: #333;
                }

                .tutor-tooltip-prompts {
                    padding: 0 16px 12px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }

                .tutor-prompt-btn {
                    padding: 6px 12px;
                    font-size: 11px;
                    background: rgba(0, 0, 0, 0.05);
                    border: 1px solid rgba(0, 0, 0, 0.2);
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .tutor-prompt-btn:hover {
                    background: #E63946;
                    color: #fff;
                    border-color: #E63946;
                }

                .tutor-tooltip-actions {
                    display: flex;
                    gap: 8px;
                    padding: 12px 16px;
                    border-top: 2px solid #0a0a0a;
                }

                .tutor-btn {
                    padding: 8px 16px;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: 2px solid #0a0a0a;
                }

                .tutor-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                .tutor-btn-primary {
                    background: #E63946;
                    color: #fff;
                    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.8);
                    margin-left: auto;
                }

                .tutor-btn-primary:hover:not(:disabled) {
                    background: #0a0a0a;
                    transform: translate(-1px, -1px);
                    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.8);
                }

                .tutor-btn-secondary {
                    background: transparent;
                    color: #0a0a0a;
                }

                .tutor-btn-secondary:hover:not(:disabled) {
                    background: rgba(0, 0, 0, 0.05);
                }

                .tutor-tooltip-hint {
                    text-align: center;
                    padding: 8px;
                    font-size: 10px;
                    color: rgba(0, 0, 0, 0.5);
                    letter-spacing: 0.1em;
                }

                /* Chat Panel */
                .tutor-chat-panel {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    width: 320px;
                    background: #fff;
                    border: 2px solid #0a0a0a;
                    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.9);
                    z-index: 99991;
                    display: flex;
                    flex-direction: column;
                    max-height: 400px;
                    transition: all 0.3s ease;
                }

                .tutor-chat-panel.tutor-chat-minimized {
                    max-height: 40px;
                    overflow: hidden;
                }

                .tutor-chat-header {
                    background: #0a0a0a;
                    color: #fff;
                    padding: 10px 14px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 12px;
                    font-weight: bold;
                }

                .tutor-chat-toggle {
                    background: transparent;
                    border: none;
                    color: #fff;
                    font-size: 18px;
                    cursor: pointer;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .tutor-chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 12px;
                    min-height: 200px;
                    max-height: 280px;
                }

                .tutor-chat-message {
                    padding: 8px 12px;
                    margin-bottom: 8px;
                    font-size: 13px;
                    line-height: 1.4;
                    border: 2px solid #0a0a0a;
                }

                .tutor-chat-user {
                    background: #E63946;
                    color: #fff;
                    margin-left: 20px;
                }

                .tutor-chat-assistant {
                    background: rgba(0, 0, 0, 0.05);
                    margin-right: 20px;
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
                    border-top: 2px solid #0a0a0a;
                }

                .tutor-chat-input {
                    flex: 1;
                    padding: 8px 12px;
                    font-size: 12px;
                    border: 2px solid #0a0a0a;
                    outline: none;
                    font-family: inherit;
                }

                .tutor-chat-send {
                    padding: 8px 14px;
                }

                /* Control Bar (for paused state) */
                .tutor-control-bar {
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #fff;
                    border: 2px solid #0a0a0a;
                    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.9);
                    padding: 12px 20px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    z-index: 99992;
                }

                .tutor-paused-text {
                    font-size: 14px;
                    font-weight: bold;
                }

                /* Dark mode support */
                @media (prefers-color-scheme: dark) {
                    .tutor-tooltip,
                    .tutor-chat-panel,
                    .tutor-control-bar {
                        background: #1a1a1a;
                        color: #f0f0f0;
                    }

                    .tutor-tooltip-content,
                    .tutor-chat-assistant {
                        color: #e0e0e0;
                        background: rgba(255, 255, 255, 0.05);
                    }

                    .tutor-btn-secondary {
                        color: #f0f0f0;
                    }

                    .tutor-btn-secondary:hover:not(:disabled) {
                        background: rgba(255, 255, 255, 0.1);
                    }

                    .tutor-prompt-btn {
                        background: rgba(255, 255, 255, 0.1);
                        border-color: rgba(255, 255, 255, 0.2);
                        color: #e0e0e0;
                    }

                    .tutor-chat-input {
                        background: #2a2a2a;
                        color: #f0f0f0;
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

            // Detect application type and load appropriate adapter
            const isElectron = Boolean(window.electronAPI?.isElectron);

            // Store host reference
            this.host = host;
            this.core = TutorCore;

            // Expose global API
            window.TechneAITutor = {
                start: (startStep) => TutorCore.startTour(startStep),
                stop: () => TutorCore.stopTour(),
                pause: () => TutorCore.pauseTour(),
                resume: () => TutorCore.resumeTour(),
                next: () => TutorCore.nextStep(),
                prev: () => TutorCore.prevStep(),
                goTo: (index) => TutorCore.goToStep(index),
                ask: (question) => TutorCore.askAI(question),
                hasProgress: () => TutorCore.hasProgress(),
                clearProgress: () => TutorCore.clearProgress(),
                isActive: () => TutorCore.isActive,
                isPaused: () => TutorCore.isPaused,
                on: (event, handler) => TutorCore.on(event, handler),
                off: (event, handler) => TutorCore.off(event, handler)
            };

            // Initialize with app-specific configuration
            if (isElectron) {
                this.initElectronTutor(host);
            } else {
                this.initWebTutor(host);
            }

            // Add UI trigger button near settings/help
            this.addTriggerButton(isElectron);

            host.log('AI Tutor plugin initialized');
            host.emit('ai-tutor:ready', { isElectron });
        },

        initElectronTutor(host) {
            // NightOwl / Hegel Pedagogy AI adapter
            const adapter = {
                async sendAIMessage(question, context) {
                    const systemPrompt = `You are an AI tutor helping a user learn the NightOwl markdown editor application.
Current context:
- Step ${context.stepIndex + 1} of ${context.totalSteps}: "${context.currentStep?.title}"
- Tour is ${context.isPaused ? 'paused for experimentation' : 'active'}

Focus on:
1. Explaining the current feature being demonstrated
2. Providing practical tips for using the editor
3. Answering questions about markdown, writing, and the application's features
4. Encouraging exploration and learning

Be concise, friendly, and helpful. Use examples when appropriate.`;

                    try {
                        // Use NightOwl's AI IPC
                        const response = await window.electronAPI.invoke('send-chat-message-with-options', {
                            message: question,
                            systemMessage: systemPrompt,
                            options: {
                                temperature: 0.7,
                                maxTokens: 500
                            }
                        });
                        return response?.content || response || 'I could not generate a response.';
                    } catch (error) {
                        console.error('[AI Tutor] Electron AI error:', error);
                        throw error;
                    }
                },

                async prepareTarget(step) {
                    // Handle special targets in NightOwl
                    if (step.target === '#chat-pane' && window.showPane) {
                        window.showPane('chat');
                    } else if (step.target === '#preview-pane' && window.showPane) {
                        window.showPane('preview');
                    } else if (step.target === '#settings-dialog' && window.openSettings) {
                        window.openSettings();
                    }
                    // Small delay for UI to update
                    await new Promise(r => setTimeout(r, 100));
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
            // Machine Spirits / my-website adapter
            const adapter = {
                async sendAIMessage(question, context) {
                    const systemPrompt = `You are an AI tutor helping a user learn the Machine Spirits learning platform.
Current context:
- Step ${context.stepIndex + 1} of ${context.totalSteps}: "${context.currentStep?.title}"
- Tour is ${context.isPaused ? 'paused for experimentation' : 'active'}

Focus on:
1. Explaining the current feature or section being shown
2. Helping users understand how to navigate and learn on the platform
3. Answering questions about courses, activities, and content
4. Encouraging engagement with the learning materials

Be concise, friendly, and supportive. Guide users toward deeper learning.`;

                    try {
                        const response = await fetch('/api/chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                message: question,
                                systemPrompt,
                                provider: 'gemini' // Use default provider
                            })
                        });

                        if (response.ok) {
                            const data = await response.json();
                            return data.reply || data.response || data.message || 'I could not generate a response.';
                        }
                        throw new Error('API request failed');
                    } catch (error) {
                        console.error('[AI Tutor] Web AI error:', error);
                        throw error;
                    }
                },

                async prepareTarget(step) {
                    // Handle navigation to sections
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
            // Create a small trigger button
            const button = document.createElement('button');
            button.id = 'tutor-trigger-btn';
            button.innerHTML = '🎓';
            button.title = 'Start AI-Guided Tour';
            button.style.cssText = `
                position: fixed;
                z-index: 9999;
                width: 36px;
                height: 36px;
                border: 2px solid #0a0a0a;
                background: #fff;
                cursor: pointer;
                font-size: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 2px 2px 0 rgba(0,0,0,0.8);
                transition: all 0.2s;
            `;

            // Position based on app type
            if (isElectron) {
                // NightOwl: near the toolbar area
                button.style.top = '8px';
                button.style.right = '180px';
            } else {
                // Machine Spirits: near the user menu
                button.style.top = '16px';
                button.style.right = '70px';
            }

            button.addEventListener('mouseenter', () => {
                button.style.transform = 'translate(-1px, -1px)';
                button.style.boxShadow = '3px 3px 0 rgba(0,0,0,0.8)';
            });

            button.addEventListener('mouseleave', () => {
                button.style.transform = 'none';
                button.style.boxShadow = '2px 2px 0 rgba(0,0,0,0.8)';
            });

            button.addEventListener('click', () => {
                if (TutorCore.isActive) {
                    TutorCore.stopTour();
                } else if (TutorCore.hasProgress()) {
                    // Resume from where they left off
                    const progress = TutorCore.loadProgress();
                    TutorCore.startTour(progress?.currentStepIndex || 0);
                } else {
                    TutorCore.startTour();
                }
            });

            document.body.appendChild(button);
        },

        // ====================================================================
        // TOUR STEPS FOR NIGHTOWL
        // ====================================================================
        getNightOwlTourSteps() {
            return [
                {
                    id: 'welcome',
                    target: '.editor-container',
                    title: 'Welcome to NightOwl',
                    content: 'NightOwl is a powerful markdown editor designed for academic writing, presentations, and knowledge management. Let me show you around!',
                    position: 'right',
                    spotlight: false,
                    aiPrompts: ['What can I do with NightOwl?', 'What makes NightOwl special?']
                },
                {
                    id: 'editor',
                    target: '#editor',
                    title: 'The Monaco Editor',
                    content: 'This is your writing area, powered by Monaco (the same editor used in VS Code). It features syntax highlighting, auto-completion, and visual markdown rendering.',
                    position: 'right',
                    spotlight: true,
                    aiPrompts: ['How do I format text?', 'What keyboard shortcuts are available?']
                },
                {
                    id: 'visual-markdown',
                    target: '#editor',
                    title: 'Visual Markdown',
                    content: 'Notice how images, links, and formatting are rendered inline! This "WYSIWYG-ish" mode lets you see your content as you write.',
                    position: 'right',
                    spotlight: true,
                    aiPrompts: ['How do I add images?', 'Can I disable visual rendering?']
                },
                {
                    id: 'file-tree',
                    target: '.sidebar',
                    title: 'File Navigation',
                    content: 'Your workspace files appear here. You can add multiple folders, organize your documents, and quickly navigate between files.',
                    position: 'right',
                    spotlight: true,
                    aiPrompts: ['How do I add folders?', 'Can I search for files?']
                },
                {
                    id: 'preview',
                    target: '#preview-pane',
                    title: 'Preview Pane',
                    content: 'The preview shows your rendered markdown. You can toggle it with the 👁 button or Cmd+P.',
                    position: 'left',
                    spotlight: true,
                    aiPrompts: ['How do I customize the preview?', 'Can I export to PDF?']
                },
                {
                    id: 'chat',
                    target: '#chat-pane',
                    title: 'AI Chat Assistant',
                    content: 'Meet Dr. Chen, your AI writing companion! Ask questions, get feedback on your writing, or use slash commands like /analyze and /improve.',
                    position: 'left',
                    spotlight: true,
                    aiPrompts: ['What slash commands are available?', 'How do I get writing feedback?']
                },
                {
                    id: 'toolbar',
                    target: '.toolbar',
                    title: 'Formatting Toolbar',
                    content: 'Quick access to formatting options. The Ash button (🅰) invokes your quick writing assistant for instant help.',
                    position: 'bottom',
                    spotlight: true,
                    aiPrompts: ['What does Ash do?', 'How is Ash different from Dr. Chen?']
                },
                {
                    id: 'modes',
                    target: '.mode-tabs',
                    title: 'Application Modes',
                    content: 'Switch between Editor, Presentation, Network Graph, and special modes like Maze and Circle for different ways to interact with your content.',
                    position: 'bottom',
                    spotlight: true,
                    aiPrompts: ['What is Presentation mode?', 'How do I create a knowledge graph?']
                },
                {
                    id: 'settings',
                    target: '#settings-dialog',
                    title: 'Settings & Plugins',
                    content: 'Customize your experience with themes, AI settings, and plugins. Try enabling different plugins to extend functionality!',
                    position: 'left',
                    spotlight: true,
                    aiPrompts: ['What plugins are available?', 'How do I change the AI provider?']
                },
                {
                    id: 'complete',
                    target: '.editor-container',
                    title: 'Ready to Write!',
                    content: 'You\'ve completed the tour! Remember, you can pause anytime to experiment, and the AI Tutor is always here to help. Happy writing!',
                    position: 'right',
                    spotlight: false,
                    aiPrompts: ['What should I write first?', 'Any tips for academic writing?']
                }
            ];
        },

        // ====================================================================
        // TOUR STEPS FOR MACHINE SPIRITS
        // ====================================================================
        getMachineSpiritsTourSteps() {
            return [
                {
                    id: 'welcome',
                    target: '#hero-card',
                    title: 'Welcome to Machine Spirits',
                    content: 'Explore the intersection of Hegelian philosophy and artificial intelligence through interactive courses, articles, and activities.',
                    position: 'bottom',
                    spotlight: true,
                    aiPrompts: ['What is Machine Spirits about?', 'Who is this platform for?']
                },
                {
                    id: 'navigation',
                    target: 'nav',
                    title: 'Main Navigation',
                    content: 'Use these links to jump to different sections: Study (courses), Read (articles), Research (publications), Simulate (experiments), and Converse (AI chat).',
                    position: 'bottom',
                    spotlight: true,
                    aiPrompts: ['What sections should I explore first?', 'How is content organized?']
                },
                {
                    id: 'courses',
                    target: '#courses',
                    title: 'Study: Browse Courses',
                    content: 'Our courses guide you through phenomenology, dialectics, and AI concepts. Each contains structured lectures with interactive activities.',
                    position: 'top',
                    spotlight: false,
                    aiPrompts: ['What courses are available?', 'How do I enroll in a course?']
                },
                {
                    id: 'articles',
                    target: '#articles',
                    title: 'Read: In-Depth Articles',
                    content: 'Articles provide deeper exploration of specific topics. Complete embedded activities to test your understanding and earn progress.',
                    position: 'top',
                    spotlight: false,
                    aiPrompts: ['How do activities work?', 'How is my progress tracked?']
                },
                {
                    id: 'simulations',
                    target: '#lab',
                    title: 'Simulate: Interactive Experiments',
                    content: 'Run JavaScript and Canvas-based simulations to see philosophical concepts in action. The AI Assist button can help explain the code.',
                    position: 'top',
                    spotlight: false,
                    aiPrompts: ['What simulations can I run?', 'How do I use AI Assist?']
                },
                {
                    id: 'chat',
                    target: '#chat',
                    title: 'Converse: AI Discussion',
                    content: 'Engage in philosophical dialogue with our AI. Choose different AI providers and models to get varied perspectives on complex topics.',
                    position: 'top',
                    spotlight: false,
                    aiPrompts: ['What AI models can I use?', 'What topics can I discuss?']
                },
                {
                    id: 'user-menu',
                    target: '.fixed.top-4.right-4',
                    title: 'Your Account',
                    content: 'Access your dashboard, view enrolled courses, check your progress, and manage AI settings from the user menu.',
                    position: 'left',
                    spotlight: true,
                    aiPrompts: ['How do I track my progress?', 'What is in the dashboard?']
                },
                {
                    id: 'themes',
                    target: '.theme-toggles',
                    title: 'Customize Your View',
                    content: 'Toggle dark mode, change accent colors, and enable visual effects like the fauna overlay for a unique experience.',
                    position: 'bottom',
                    spotlight: true,
                    aiPrompts: ['What visual options are available?', 'How do I enable dark mode?']
                },
                {
                    id: 'keyboard',
                    target: '.fixed.top-4.right-4',
                    title: 'Keyboard Shortcuts',
                    content: 'Press ? anytime to see available keyboard shortcuts. Use t to restart this tour, d for dashboard, and more.',
                    position: 'left',
                    spotlight: true,
                    aiPrompts: ['What shortcuts are available?', 'How do I navigate quickly?']
                },
                {
                    id: 'complete',
                    target: '#hero-card',
                    title: 'Start Learning!',
                    content: 'You\'re ready to explore! Remember, you can pause this tour anytime to try things yourself. The AI Tutor is always available to help.',
                    position: 'bottom',
                    spotlight: false,
                    aiPrompts: ['Where should I start?', 'What are the best courses for beginners?']
                }
            ];
        },

        destroy() {
            // Clean up
            TutorCore.stopTour();

            const trigger = document.getElementById('tutor-trigger-btn');
            if (trigger) trigger.remove();

            delete window.TechneAITutor;

            this.host?.log('AI Tutor plugin destroyed');
        }
    };

    // Register the plugin
    if (window.TechnePlugins) {
        window.TechnePlugins.register(plugin);
    } else {
        // Queue for later registration
        window.TECHNE_PLUGIN_QUEUE = window.TECHNE_PLUGIN_QUEUE || [];
        window.TECHNE_PLUGIN_QUEUE.push(plugin);
    }

})();
