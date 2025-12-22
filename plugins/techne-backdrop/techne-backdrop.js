/* Techne Backdrop Layers
   - Mounts shapes + rotating shapes + fauna overlay into #techne-background
   - Uses FaunaOverlay when available
   - Exposes window.TechneBackdrop for cleanup/destroy
*/

(function () {
    // Cleanup any previous instance
    if (window.TechneBackdrop?.destroy) {
        window.TechneBackdrop.destroy();
    }

    const backdropRoot = document.getElementById('techne-background') || document.body;
    if (!backdropRoot) return;

    // Clear any existing ready flag so we can reinitialize
    delete backdropRoot.dataset.techneBackdropReady;
    backdropRoot.dataset.techneBackdropReady = 'true';

    const html = window.TECHNE_BACKDROP_LAYERS_HTML;
    const hasExistingLayers = Boolean(
        document.getElementById('shapesLayer') ||
        document.querySelector('.shapes-layer') ||
        document.querySelector('.rotating-shapes-layer') ||
        document.getElementById('fauna-overlay')
    );

    // Track elements we create for cleanup
    const createdElements = [];

    if (!hasExistingLayers) {
        if (typeof html === 'string' && html.trim()) {
            // Create a temporary container to parse the HTML
            const temp = document.createElement('div');
            temp.innerHTML = html;
            while (temp.firstChild) {
                createdElements.push(temp.firstChild);
                backdropRoot.appendChild(temp.firstChild);
            }
        } else {
            console.warn('[techne-backdrop] Missing markup: window.TECHNE_BACKDROP_LAYERS_HTML');
        }
    }

    const prefersReducedMotion = (() => {
        try {
            return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
        } catch {
            return false;
        }
    })();

    const faunaOverlayEl = document.getElementById('fauna-overlay');
    const faunaCanvas = document.getElementById('fauna-canvas');

    let faunaInstance = null;
    let faunaRunning = false;
    let animationFrameId = null;
    let isDestroyed = false;

    const getAccent = () =>
        document.body.classList.contains('techne-accent-orange') || document.body.classList.contains('theme-orange')
            ? 'orange'
            : 'red';

    const startFauna = () => {
        if (faunaRunning || isDestroyed) return;
        if (!faunaOverlayEl || !faunaCanvas) return;
        if (prefersReducedMotion) return;

        const ctor =
            (typeof FaunaOverlay === 'function' && FaunaOverlay) ||
            window.FaunaOverlay ||
            window.faunaOverlay ||
            window.faunaOverlayClass;
        if (typeof ctor !== 'function') return;

        const accent = getAccent();
        faunaOverlayEl.classList.add('active');
        faunaInstance = faunaInstance || new ctor('fauna-canvas', {
            opacity: [0.16, 0.34],
            entityCount: [18, 28],
            lineWidth: [1.2, 2.4],
            driftAmount: [3, 10],
            parallaxMultiplier: 0.35,
            swissPalette: true,
            accentHue: accent === 'orange' ? 27 : 355
        });

        faunaInstance?.setAccent?.(accent);
        faunaInstance?.start?.();
        faunaRunning = true;
    };

    const stopFauna = () => {
        if (!faunaRunning) return;
        faunaRunning = false;
        faunaOverlayEl?.classList.remove('active');
        faunaInstance?.stop?.();
    };

    const syncAccent = () => {
        faunaInstance?.setAccent?.(getAccent());
    };

    const syncVisibility = () => {
        if (isDestroyed) return;
        const techneOn =
            document.body.classList.contains('techne-theme') ||
            document.body.classList.contains('theme-dark') ||
            document.body.classList.contains('theme-orange');
        if (!techneOn) {
            stopFauna();
            return;
        }
        startFauna();
        syncAccent();
    };

    const bodyObserver = new MutationObserver(() => syncVisibility());
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // === Parallax shapes ===
    const shapesLayer = document.getElementById('shapesLayer');
    const shapeNodes = Array.from(shapesLayer?.querySelectorAll?.('.shape') || []).map((el) => ({
        el,
        depth: Math.max(0, Math.min(1, Number.parseFloat(el.getAttribute('data-parallax') || '0.1'))),
        baseRot: Number.parseFloat(el.getAttribute('data-rotation') || '0') || 0
    }));

    const rotatingIds = ['shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6'];
    const rotatingShapes = rotatingIds
        .map((id) => document.getElementById(id))
        .filter(Boolean);

    let mouseX = 0.5;
    let mouseY = 0.5;

    const onPointerMove = (event) => {
        if (!event || isDestroyed) return;
        const w = window.innerWidth || 1;
        const h = window.innerHeight || 1;
        mouseX = Math.max(0, Math.min(1, (event.clientX || 0) / w));
        mouseY = Math.max(0, Math.min(1, (event.clientY || 0) / h));
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });

    let lastTime = performance.now();
    const animate = (now) => {
        if (isDestroyed) return;

        const techneOn =
            document.body.classList.contains('techne-theme') ||
            document.body.classList.contains('theme-dark') ||
            document.body.classList.contains('theme-orange');
        lastTime = now;

        if (techneOn && !prefersReducedMotion) {
            const dx = mouseX - 0.5;
            const dy = mouseY - 0.5;

            for (const shape of shapeNodes) {
                const depth = shape.depth;
                const tx = dx * 80 * depth;
                const ty = dy * 60 * depth;
                const rot = shape.baseRot + dx * 24 * depth;
                shape.el.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`;
            }

            rotatingShapes.forEach((el, idx) => {
                const depth = 0.6 + idx * 0.12;
                const tx = dx * 22 * depth;
                const ty = dy * 16 * depth;
                const rot = (now / 1000) * (12 + idx * 4) * (idx % 2 === 0 ? 1 : -1);
                el.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`;
            });

            if (faunaCanvas) {
                const driftX = dx * 10;
                const driftY = dy * 10;
                const rot = (now / 1000) * 0.8;
                faunaCanvas.style.transform = `translate(${driftX.toFixed(2)}px, ${driftY.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`;
            }
        }

        animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    syncVisibility();

    // Expose destroy function for cleanup
    window.TechneBackdrop = {
        destroy: () => {
            if (isDestroyed) return;
            isDestroyed = true;

            // Stop animation loop
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }

            // Stop fauna overlay
            stopFauna();
            if (faunaInstance) {
                faunaInstance = null;
            }

            // Disconnect observer
            bodyObserver.disconnect();

            // Remove event listener
            window.removeEventListener('pointermove', onPointerMove);

            // Remove created DOM elements
            for (const el of createdElements) {
                el.remove?.();
            }

            // Also remove any layers that might have been created before tracking
            const layersToRemove = [
                document.getElementById('shapesLayer'),
                document.querySelector('.shapes-layer'),
                document.querySelector('.rotating-shapes-layer'),
                document.getElementById('fauna-overlay')
            ].filter(Boolean);

            for (const el of layersToRemove) {
                el.remove?.();
            }

            // Clear ready flag
            if (backdropRoot) {
                delete backdropRoot.dataset.techneBackdropReady;
            }

            // Clear global reference
            delete window.TechneBackdrop;
        },
        isActive: () => !isDestroyed
    };
})();
