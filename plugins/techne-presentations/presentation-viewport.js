(function () {
  'use strict';

  const SLIDE_WIDTH = 864;
  const SLIDE_HEIGHT = 486;

  const finiteDimension = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  };

  const finiteInset = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  };

  function calculateFitScale(viewportWidth, viewportHeight, options = {}) {
    const width = finiteDimension(viewportWidth);
    const height = finiteDimension(viewportHeight);
    const slideWidth = finiteDimension(options.slideWidth) || SLIDE_WIDTH;
    const slideHeight = finiteDimension(options.slideHeight) || SLIDE_HEIGHT;
    const padding = Math.max(0, Number(options.padding) || 0);
    const availableWidth = Math.max(0, width - padding * 2);
    const availableHeight = Math.max(0, height - padding * 2);

    if (!availableWidth || !availableHeight) return 1;
    return Math.min(availableWidth / slideWidth, availableHeight / slideHeight);
  }

  function calculateFitTransform({
    viewportWidth,
    viewportHeight,
    slideX = 0,
    slideY = 0,
    slideWidth = SLIDE_WIDTH,
    slideHeight = SLIDE_HEIGHT,
    padding = 12,
    insets = {}
  } = {}) {
    const width = finiteDimension(viewportWidth);
    const height = finiteDimension(viewportHeight);
    const left = finiteInset(insets.left);
    const right = finiteInset(insets.right);
    const top = finiteInset(insets.top);
    const bottom = finiteInset(insets.bottom);
    const insetWidth = Math.max(0, width - left - right);
    const insetHeight = Math.max(0, height - top - bottom);
    const fitWidth = insetWidth || width;
    const fitHeight = insetHeight || height;
    const centerX = insetWidth ? left + insetWidth / 2 : width / 2;
    const centerY = insetHeight ? top + insetHeight / 2 : height / 2;
    const scale = calculateFitScale(fitWidth, fitHeight, { slideWidth, slideHeight, padding });
    const pan = {
      x: centerX - Number(slideX || 0) * scale,
      y: centerY - Number(slideY || 0) * scale
    };
    const renderedWidth = slideWidth * scale;
    const renderedHeight = slideHeight * scale;

    return {
      scale,
      pan,
      bounds: {
        left: centerX - renderedWidth / 2,
        top: centerY - renderedHeight / 2,
        right: centerX + renderedWidth / 2,
        bottom: centerY + renderedHeight / 2,
        width: renderedWidth,
        height: renderedHeight
      }
    };
  }

  function calculateContentScale({
    availableWidth,
    availableHeight,
    contentWidth,
    contentHeight,
    minimumScale = 0
  } = {}) {
    const width = finiteDimension(availableWidth);
    const height = finiteDimension(availableHeight);
    const naturalWidth = finiteDimension(contentWidth);
    const naturalHeight = finiteDimension(contentHeight);

    if (!width || !height || !naturalWidth || !naturalHeight) return 1;
    const scale = Math.min(1, width / naturalWidth, height / naturalHeight);
    const floor = Math.min(1, Math.max(0, Number(minimumScale) || 0));
    return floor > 0 ? Math.max(floor, scale) : scale;
  }

  function isBoundsInsideViewport(bounds, viewportWidth, viewportHeight, tolerance = 0.5) {
    if (!bounds) return false;
    const width = finiteDimension(viewportWidth);
    const height = finiteDimension(viewportHeight);
    return bounds.left >= -tolerance &&
      bounds.top >= -tolerance &&
      bounds.right <= width + tolerance &&
      bounds.bottom <= height + tolerance;
  }

  const api = {
    SLIDE_WIDTH,
    SLIDE_HEIGHT,
    calculateContentScale,
    calculateFitScale,
    calculateFitTransform,
    isBoundsInsideViewport
  };

  if (typeof window !== 'undefined') {
    window.NightOwlPresentationViewport = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
