// === Flow Indicator UI ===
// Manages visual flow state indicators and user interface for flow detection

class FlowIndicatorUI {
    constructor() {
        this.indicator = null;
        this.indicatorTimeout = null;
        this.lastIndicatorHidden = 0;
        this.indicatorCooldown = 15000; // 15 seconds cooldown
        this.lastShownState = null;
        this.lastStateChangeTime = 0;
        
        // UI configuration
        this.config = {
            autoHideDelay: {
                deep_flow: 3000,
                light_flow: 4000,
                focused: 5000,
                struggling: 8000,
                blocked: 10000
            },
            positions: {
                'top-right': { top: '20px', right: '20px' },
                'top-left': { top: '20px', left: '20px' },
                'bottom-right': { bottom: '20px', right: '20px' },
                'bottom-left': { bottom: '20px', left: '20px' }
            },
            defaultPosition: 'top-right'
        };

        this.createIndicatorElement();
        this.attachEventListeners();
    }

    // Create the flow indicator DOM element
    createIndicatorElement() {
        this.indicator = document.createElement('div');
        this.indicator.id = 'flow-indicator';
        this.indicator.className = 'flow-indicator';
        // Accessibility: This decorative status indicator doesn't need to be in a landmark
        this.indicator.setAttribute('role', 'status');
        this.indicator.setAttribute('aria-live', 'polite');
        this.indicator.setAttribute('aria-label', 'Flow state indicator');

        this.indicator.innerHTML = `
            <div class="flow-icon" aria-hidden="true">🌊</div>
            <div class="flow-text">Flow State</div>
            <div class="flow-close" title="Dismiss" aria-label="Dismiss flow indicator">×</div>
        `;

        // Apply default styles
        this.applyIndicatorStyles();
        
        // Append to body (initially hidden)
        document.body.appendChild(this.indicator);
    }

    // Apply CSS styles to the indicator
    applyIndicatorStyles() {
        const styles = `
            .flow-indicator {
                position: fixed;
                ${this.config.positions[this.config.defaultPosition].top ? `top: ${this.config.positions[this.config.defaultPosition].top};` : ''}
                ${this.config.positions[this.config.defaultPosition].right ? `right: ${this.config.positions[this.config.defaultPosition].right};` : ''}
                ${this.config.positions[this.config.defaultPosition].bottom ? `bottom: ${this.config.positions[this.config.defaultPosition].bottom};` : ''}
                ${this.config.positions[this.config.defaultPosition].left ? `left: ${this.config.positions[this.config.defaultPosition].left};` : ''}
                z-index: 10000;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 16px;
                border-radius: 25px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                backdrop-filter: blur(10px);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                font-size: 14px;
                font-weight: 500;
                color: white;
                cursor: pointer;
                user-select: none;
                transform: translateY(-20px);
                opacity: 0;
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                pointer-events: none;
            }

            .flow-indicator.visible {
                transform: translateY(0);
                opacity: 1;
                pointer-events: auto;
            }

            .flow-indicator.flow-deep {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
            }

            .flow-indicator.flow-light {
                background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
                box-shadow: 0 4px 20px rgba(79, 172, 254, 0.4);
            }

            .flow-indicator.flow-focused {
                background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
                box-shadow: 0 4px 20px rgba(67, 233, 123, 0.4);
            }

            .flow-indicator.flow-struggling {
                background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
                box-shadow: 0 4px 20px rgba(250, 112, 154, 0.4);
            }

            .flow-indicator.flow-blocked {
                background: linear-gradient(135deg, #ff6b6b 0%, #feca57 100%);
                box-shadow: 0 4px 20px rgba(255, 107, 107, 0.4);
            }

            .flow-icon {
                font-size: 18px;
                line-height: 1;
            }

            .flow-text {
                font-weight: 600;
                letter-spacing: -0.01em;
            }

            .flow-close {
                margin-left: 4px;
                padding: 2px 6px;
                border-radius: 12px;
                background: rgba(255, 255, 255, 0.2);
                font-size: 16px;
                line-height: 1;
                opacity: 0.7;
                transition: all 0.2s ease;
            }

            .flow-close:hover {
                background: rgba(255, 255, 255, 0.3);
                opacity: 1;
            }

            .flow-indicator:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 25px rgba(0, 0, 0, 0.2);
            }

            @media (max-width: 768px) {
                .flow-indicator {
                    font-size: 13px;
                    padding: 10px 14px;
                }
                
                .flow-icon {
                    font-size: 16px;
                }
            }
        `;

        // Inject styles if not already present
        if (!document.getElementById('flow-indicator-styles')) {
            const styleElement = document.createElement('style');
            styleElement.id = 'flow-indicator-styles';
            styleElement.textContent = styles;
            document.head.appendChild(styleElement);
        }
    }

    // Attach event listeners
    attachEventListeners() {
        // Close button click
        const closeBtn = this.indicator.querySelector('.flow-close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hideIndicator();
        });

        // Indicator click (for potential expansion)
        this.indicator.addEventListener('click', () => {
            this.onIndicatorClick();
        });

        // Keyboard shortcut for manual hide
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.indicator.classList.contains('visible')) {
                this.hideIndicator();
            }
        });
    }

    // Update flow indicator display
    updateIndicator(flowScore, flowState, options = {}) {
        if (!this.shouldShowIndicator(flowState)) return;

        this.clearAutoHideTimeout();
        
        // Remove existing flow classes
        this.indicator.classList.remove('flow-deep', 'flow-light', 'flow-focused', 'flow-struggling', 'flow-blocked', 'visible');
        
        // Update content based on flow state
        const { className, icon, text } = this.getStateDisplay(flowState, flowScore);
        
        const iconElement = this.indicator.querySelector('.flow-icon');
        const textElement = this.indicator.querySelector('.flow-text');
        
        iconElement.textContent = icon;
        textElement.textContent = text;
        
        // Add state-specific class and show
        this.indicator.classList.add(className, 'visible');
        
        // Set auto-hide timeout
        const autoHideDelay = this.config.autoHideDelay[flowState] || 5000;
        this.setAutoHideTimeout(autoHideDelay);
        
        // Update state tracking
        this.updateStateTracking(flowState);
    }

    // Get display properties for flow state
    getStateDisplay(flowState, flowScore) {
        const scorePercent = Math.round(flowScore * 100);
        
        const displays = {
            deep_flow: {
                className: 'flow-deep',
                icon: '🌊',
                text: 'Deep Flow'
            },
            light_flow: {
                className: 'flow-light',
                icon: '💫',
                text: 'Light Flow'
            },
            focused: {
                className: 'flow-focused',
                icon: '🎯',
                text: 'Focused'
            },
            struggling: {
                className: 'flow-struggling',
                icon: '⚡',
                text: 'Finding Rhythm'
            },
            blocked: {
                className: 'flow-blocked',
                icon: '🔄',
                text: 'Recharging'
            }
        };

        return displays[flowState] || displays.focused;
    }

    // Check if indicator should be shown
    shouldShowIndicator(flowState) {
        const now = Date.now();
        
        // Don't show indicators during presentation mode
        if (document.body.classList.contains('is-presenting')) {
            return false;
        }
        
        // Cooldown check
        const timeSinceHidden = now - this.lastIndicatorHidden;
        if (timeSinceHidden < this.indicatorCooldown) {
            return false;
        }
        
        // State change check
        const timeSinceStateChange = now - this.lastStateChangeTime;
        if (this.lastShownState === flowState && timeSinceStateChange < 30000) { // 30 seconds
            return false;
        }
        
        return true;
    }

    // Update state tracking
    updateStateTracking(flowState) {
        const now = Date.now();
        
        if (this.lastShownState !== flowState) {
            this.lastShownState = flowState;
            this.lastStateChangeTime = now;
        }
    }

    // Set auto-hide timeout
    setAutoHideTimeout(delay) {
        this.clearAutoHideTimeout();
        
        this.indicatorTimeout = setTimeout(() => {
            this.hideIndicator();
        }, delay);
    }

    // Clear auto-hide timeout
    clearAutoHideTimeout() {
        if (this.indicatorTimeout) {
            clearTimeout(this.indicatorTimeout);
            this.indicatorTimeout = null;
        }
    }

    // Hide indicator
    hideIndicator() {
        this.clearAutoHideTimeout();
        this.indicator.classList.remove('visible');
        this.lastIndicatorHidden = Date.now();
    }

    // Show indicator manually (for testing)
    showIndicator(flowState = 'focused', flowScore = 0.5) {
        this.updateIndicator(flowScore, flowState);
    }

    // Remove indicator completely
    removeIndicator() {
        this.clearAutoHideTimeout();
        if (this.indicator && this.indicator.parentNode) {
            this.indicator.parentNode.removeChild(this.indicator);
        }
        
        // Remove styles
        const styleElement = document.getElementById('flow-indicator-styles');
        if (styleElement) {
            styleElement.parentNode.removeChild(styleElement);
        }
    }

    // Handle indicator click
    onIndicatorClick() {
        // Future: Could show detailed flow metrics or insights
        console.log('[FlowIndicatorUI] Indicator clicked - could show detailed view');
    }

    // Set indicator position
    setPosition(position) {
        if (!this.config.positions[position]) return false;
        
        const pos = this.config.positions[position];
        
        // Clear all position styles
        ['top', 'right', 'bottom', 'left'].forEach(prop => {
            this.indicator.style[prop] = '';
        });
        
        // Apply new position
        Object.keys(pos).forEach(prop => {
            this.indicator.style[prop] = pos[prop];
        });
        
        this.config.defaultPosition = position;
        return true;
    }

    // Get available positions
    getAvailablePositions() {
        return Object.keys(this.config.positions);
    }

    // Check if indicator is visible
    isVisible() {
        return this.indicator && this.indicator.classList.contains('visible');
    }

    // Get current state
    getState() {
        return {
            visible: this.isVisible(),
            currentState: this.lastShownState,
            position: this.config.defaultPosition,
            cooldownActive: (Date.now() - this.lastIndicatorHidden) < this.indicatorCooldown,
            lastStateChange: this.lastStateChangeTime,
            lastHidden: this.lastIndicatorHidden
        };
    }

    // Update configuration
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.FlowIndicatorUI = FlowIndicatorUI;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlowIndicatorUI;
}