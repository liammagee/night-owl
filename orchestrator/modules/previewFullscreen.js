// Preview Fullscreen Module
// Handles fullscreen toggle for preview pane

class PreviewFullscreen {
    constructor() {
        this.previewPane = null;
        this.fullscreenBtn = null;
    }

    get isFullscreen() {
        return Boolean(window.NightOwlUIState?.getState?.().preview.fullscreen);
    }

    initialize() {
        console.log('[PreviewFullscreen] Initializing preview fullscreen module');

        this.previewPane = document.getElementById('preview-pane');
        this.fullscreenBtn = document.getElementById('preview-fullscreen-btn');

        if (!this.previewPane || !this.fullscreenBtn) {
            console.warn('[PreviewFullscreen] Preview pane or fullscreen button not found');
            return;
        }

        // Set up button click handler
        this.fullscreenBtn.addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Set up keyboard shortcut (F11)
        document.addEventListener('keydown', (e) => {
            // F11 key
            if (e.key === 'F11') {
                e.preventDefault();
                this.toggleFullscreen();
            }

            // Escape key to exit fullscreen
            if (e.key === 'Escape' && this.isFullscreen) {
                this.exitFullscreen();
            }
        });

        console.log('[PreviewFullscreen] Preview fullscreen initialized');
    }

    toggleFullscreen() {
        if (this.isFullscreen) {
            this.exitFullscreen();
        } else {
            this.enterFullscreen();
        }
    }

    enterFullscreen() {
        if (!this.previewPane) return;

        console.log('[PreviewFullscreen] Entering fullscreen mode');
        window.NightOwlUIState?.dispatch?.({ type: 'SET_PREVIEW_FULLSCREEN', fullscreen: true });
        if (!this.isFullscreen) return;

        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('preview-fullscreen-enter'));
    }

    exitFullscreen() {
        if (!this.previewPane) return;

        console.log('[PreviewFullscreen] Exiting fullscreen mode');
        window.NightOwlUIState?.dispatch?.({ type: 'SET_PREVIEW_FULLSCREEN', fullscreen: false });

        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('preview-fullscreen-exit'));
    }
}

// Initialize when DOM is ready
if (typeof window !== 'undefined') {
    window.previewFullscreen = new PreviewFullscreen();

    // Initialize when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.previewFullscreen.initialize();
        });
    } else {
        // DOM already loaded
        window.previewFullscreen.initialize();
    }
}
