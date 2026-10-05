const path = require('path');
const fs = require('fs');

const modulePath = path.resolve(
  __dirname,
  '../../../../plugins/techne-presentations/presentation-viewport.js'
);

describe('presentation viewport geometry', () => {
  let viewport;

  beforeEach(() => {
    jest.resetModules();
    delete window.NightOwlPresentationViewport;
    viewport = require(modulePath);
  });

  test.each([
    { width: 640, height: 360 },
    { width: 1024, height: 600 },
    { width: 1920, height: 1080 },
    { width: 520, height: 260 }
  ])('keeps every 16:9 slide edge inside a $width x $height stage', ({ width, height }) => {
    const result = viewport.calculateFitTransform({
      viewportWidth: width,
      viewportHeight: height,
      slideX: 1440,
      slideY: 720,
      padding: 12
    });

    expect(viewport.isBoundsInsideViewport(result.bounds, width, height)).toBe(true);
    expect(result.bounds.width / result.bounds.height).toBeCloseTo(16 / 9, 5);
    expect(result.pan).toEqual({
      x: width / 2 - 1440 * result.scale,
      y: height / 2 - 720 * result.scale
    });
  });

  test('speaker notes and control insets reduce the stage before fitting', () => {
    const full = viewport.calculateFitScale(1000, 700, { padding: 12 });
    const withNotes = viewport.calculateFitScale(1000, 700 - 220 - 64 - 72, { padding: 12 });

    expect(withNotes).toBeLessThan(full);
    const result = viewport.calculateFitTransform({
      viewportWidth: 1000,
      viewportHeight: 700 - 220 - 64 - 72,
      padding: 12
    });
    expect(viewport.isBoundsInsideViewport(result.bounds, 1000, 344)).toBe(true);
  });

  test('fits and centers authoring slides inside asymmetric control insets', () => {
    const result = viewport.calculateFitTransform({
      viewportWidth: 1000,
      viewportHeight: 700,
      slideX: 720,
      slideY: 360,
      padding: 12,
      insets: { top: 72, right: 16, bottom: 84, left: 16 }
    });

    expect(result.bounds.left).toBeGreaterThanOrEqual(16);
    expect(result.bounds.top).toBeGreaterThanOrEqual(72);
    expect(result.bounds.right).toBeLessThanOrEqual(984);
    expect(result.bounds.bottom).toBeLessThanOrEqual(616);
    expect(result.bounds.width / result.bounds.height).toBeCloseTo(16 / 9, 5);
    expect(result.pan).toEqual({
      x: 500 - 720 * result.scale,
      y: 344 - 360 * result.scale
    });
  });

  test.each([
    ['tall text', 816, 780],
    ['wide table', 1200, 430],
    ['large image', 1050, 700],
    ['long code block', 1400, 820]
  ])('fits overflowing %s content without requiring delivery scrolling', (_name, width, height) => {
    const scale = viewport.calculateContentScale({
      availableWidth: 816,
      availableHeight: 438,
      contentWidth: width,
      contentHeight: height
    });

    expect(width * scale).toBeLessThanOrEqual(816.001);
    expect(height * scale).toBeLessThanOrEqual(438.001);
    expect(scale).toBeLessThan(1);
  });

  test('keeps already fitting slide content at authored size', () => {
    expect(viewport.calculateContentScale({
      availableWidth: 816,
      availableHeight: 438,
      contentWidth: 700,
      contentHeight: 400
    })).toBe(1);
  });

  test('ships a manual overflow fixture covering delivery content and notes controls', () => {
    const fixture = fs.readFileSync(
      path.resolve(__dirname, '../../../fixtures/presentation-viewport-overflow.md'),
      'utf8'
    );

    expect(fixture).toContain('# Tall text fixture');
    expect(fixture).toContain('# Wide table fixture');
    expect(fixture).toContain('# Image fixture');
    expect(fixture).toContain('# Code fixture');
    expect(fixture.match(/```notes/g)).toHaveLength(2);
  });
});
