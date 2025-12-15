/**
 * GENERATIVE FAUNA OVERLAY (Techne plugin vendor)
 * Five totems: Kookaburra, Snake, Octopus, Wallaby, Echidna
 *
 * Usage:
 *   const fauna = new FaunaOverlay('fauna-canvas', { opacity: [0.12, 0.28] });
 *   fauna.start();
 *   fauna.stop();
 *   fauna.toggle();
 */

class FaunaOverlay {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.warn(`FaunaOverlay: Canvas #${canvasId} not found`);
      return;
    }
    this.ctx = this.canvas.getContext('2d');

    // Configuration with defaults
    this.config = {
      opacityRange: options.opacity || [0.12, 0.28], // [min, max] - increased visibility
      entityCount: options.entityCount || [20, 30],
      lineWidthRange: options.lineWidth || [1.0, 2.0],
      driftAmount: options.driftAmount || [8, 28],
      parallaxMultiplier: options.parallaxMultiplier || 1.0,
      seed: options.seed || Math.random() * 999999,
      // Swiss palette mode: uses red/black instead of earthy tones
      swissPalette: options.swissPalette !== false, // default true
      // Accent hue: 355 = red (#E63946), 27 = orange (#ff7a1a)
      accentHue: options.accentHue || 355,
      ...options
    };

    this.width = 0;
    this.height = 0;
    this.scrollY = 0;
    this.targetScrollY = 0;
    this.time = 0;
    this.entities = [];
    this.active = false;
    this.animationId = null;

    this.SESSION_SEED = this.config.seed;
    this.palette = this.generatePalette(this.SESSION_SEED);

    this.boundOnScroll = this.onScroll.bind(this);
    this.boundOnResize = this.onResize.bind(this);
    this.boundAnimate = this.animate.bind(this);

    this.init();
  }

  // Deterministic random functions
  rand(seed) {
    const x = Math.sin(seed * 9999.9999) * 99999.9999;
    return x - Math.floor(x);
  }

  randRange(min, max, seed) {
    return min + this.rand(seed) * (max - min);
  }

  randGauss(seed) {
    return (this.rand(seed) + this.rand(seed + 1) + this.rand(seed + 2)) / 3;
  }

  randChoice(arr, seed) {
    return arr[Math.floor(this.rand(seed) * arr.length)];
  }

  generatePalette(seed) {
    if (this.config.swissPalette) {
      // Swiss palette: accent color and black (#0a0a0a)
      // Accent hue: 355 = red (#E63946), 27 = orange (#ff7a1a)
      const accentHue = this.config.accentHue;
      return {
        stroke: (opacity) => {
          const choice = this.rand(seed + opacity * 100);
          if (choice > 0.65) {
            // Accent color strokes (~35%)
            const h = accentHue + (this.rand(seed + opacity * 200) - 0.5) * 8;
            const s = 75 + (this.rand(seed + opacity * 300) - 0.5) * 10;
            const l = 48 + (this.rand(seed + opacity * 400) - 0.5) * 8;
            return `hsla(${h}, ${s}%, ${l}%, ${opacity})`;
          } else {
            // Black/dark strokes (~65%)
            const l = 8 + (this.rand(seed + opacity * 500) - 0.5) * 10;
            return `hsla(0, 0%, ${l}%, ${opacity})`;
          }
        },
        ghost: (opacity) => {
          const choice = this.rand(seed + opacity * 600);
          if (choice > 0.7) {
            return `hsla(${accentHue}, 70%, 55%, ${opacity * 0.4})`;
          }
          return `hsla(0, 0%, 15%, ${opacity * 0.5})`;
        }
      };
    }

    // Original earthy palette
    const hueBase = this.rand(seed) * 50 + 20;
    const satBase = 25 + this.rand(seed + 1) * 30;
    const lightBase = 28 + this.rand(seed + 2) * 22;

    return {
      stroke: (opacity) => {
        const h = hueBase + (this.rand(seed + opacity * 100) - 0.5) * 15;
        const s = satBase + (this.rand(seed + opacity * 200) - 0.5) * 10;
        const l = lightBase + (this.rand(seed + opacity * 300) - 0.5) * 8;
        return `hsla(${h}, ${s}%, ${l}%, ${opacity})`;
      },
      ghost: (opacity) => `hsla(${hueBase}, ${satBase * 0.4}%, ${lightBase + 25}%, ${opacity * 0.6})`
    };
  }

  // ========== GESTURE PRIMITIVES ==========

  tremor(x1, y1, x2, y2, seed, intensity = 1) {
    const ctx = this.ctx;
    const segments = 4 + Math.floor(this.rand(seed) * 8);
    const dx = (x2 - x1) / segments;
    const dy = (y2 - y1) / segments;
    const len = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i <= segments; i++) {
      const wobble = intensity * 2.5 * (this.rand(seed + i) - 0.5);
      const perpX = len > 0 ? -(y2-y1) / len * wobble : 0;
      const perpY = len > 0 ? (x2-x1) / len * wobble : 0;
      ctx.lineTo(x1 + dx * i + perpX, y1 + dy * i + perpY);
    }
    ctx.stroke();
  }

  arcFragment(cx, cy, radius, seed) {
    const ctx = this.ctx;
    const startAngle = this.rand(seed) * Math.PI * 2;
    const sweep = this.rand(seed + 1) * Math.PI * (0.4 + this.rand(seed + 2) * 1.0);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, startAngle + sweep);
    ctx.stroke();
  }

  dotField(cx, cy, spread, seed, count = null) {
    const ctx = this.ctx;
    const n = count || (2 + Math.floor(this.rand(seed) * 6));
    for (let i = 0; i < n; i++) {
      const angle = this.rand(seed + i * 2) * Math.PI * 2;
      const dist = this.rand(seed + i * 2 + 1) * spread;
      const size = 1.5 + this.rand(seed + i * 3) * 2.5;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  hatchField(cx, cy, size, seed, angle = null) {
    const ctx = this.ctx;
    const count = 2 + Math.floor(this.rand(seed) * 4);
    const a = angle !== null ? angle : this.rand(seed + 1) * Math.PI;
    const spacing = size / count;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const offset = (i - count/2) * spacing;
      const perpX = Math.cos(a + Math.PI/2) * offset;
      const perpY = Math.sin(a + Math.PI/2) * offset;
      const len = size * (0.5 + this.rand(seed + i + 10) * 0.5);
      ctx.moveTo(cx + perpX - Math.cos(a) * len/2, cy + perpY - Math.sin(a) * len/2);
      ctx.lineTo(cx + perpX + Math.cos(a) * len/2, cy + perpY + Math.sin(a) * len/2);
    }
    ctx.stroke();
  }

  shard(cx, cy, size, seed) {
    const ctx = this.ctx;
    const points = 3 + Math.floor(this.rand(seed) * 2);
    const angles = [];
    for (let i = 0; i < points; i++) angles.push(this.rand(seed + i) * Math.PI * 2);
    angles.sort((a, b) => a - b);
    ctx.beginPath();
    angles.forEach((angle, i) => {
      const dist = size * (0.5 + this.rand(seed + i + 10) * 0.5);
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  eyeMark(cx, cy, size, seed) {
    const ctx = this.ctx;
    const style = this.rand(seed);
    if (style > 0.5) {
      const rings = 1 + Math.floor(this.rand(seed + 1) * 2);
      for (let i = 0; i < rings; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, size * (0.4 + i * 0.35), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.15, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      if (this.rand(seed + 2) > 0.3) {
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.55, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  reptileEye(cx, cy, size, seed) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    const slitAngle = this.rand(seed) * 0.3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.08, size * 0.35, slitAngle, 0, Math.PI * 2);
    ctx.fill();
  }

  beakForm(cx, cy, size, angle, seed) {
    const ctx = this.ctx;
    const length = size * (1.0 + this.rand(seed) * 0.6);
    const width = size * (0.2 + this.rand(seed + 1) * 0.25);
    const massive = this.rand(seed + 3) > 0.5;
    const tipX = cx + Math.cos(angle) * length;
    const tipY = cy + Math.sin(angle) * length;
    const perpAngle = angle + Math.PI / 2;
    const widthMult = massive ? 1.5 : 1;
    const p1x = cx + Math.cos(perpAngle) * width * widthMult;
    const p1y = cy + Math.sin(perpAngle) * width * widthMult;
    const p2x = cx - Math.cos(perpAngle) * width * widthMult;
    const p2y = cy - Math.sin(perpAngle) * width * widthMult;
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    if (massive) {
      const midX = cx + Math.cos(angle) * length * 0.6;
      const midY = cy + Math.sin(angle) * length * 0.6;
      ctx.lineTo(midX + Math.cos(perpAngle) * width * 1.2, midY + Math.sin(perpAngle) * width * 1.2);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(midX - Math.cos(perpAngle) * width * 1.2, midY - Math.sin(perpAngle) * width * 1.2);
      ctx.lineTo(p2x, p2y);
    } else {
      ctx.quadraticCurveTo(cx + Math.cos(angle) * length * 0.6, cy + Math.sin(angle) * length * 0.6, tipX, tipY);
      ctx.quadraticCurveTo(cx + Math.cos(angle) * length * 0.6, cy + Math.sin(angle) * length * 0.6, p2x, p2y);
    }
    ctx.stroke();
    if (this.rand(seed + 4) > 0.4) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
    }
  }

  earForm(cx, cy, size, angle, seed) {
    const ctx = this.ctx;
    const height = size * (1.4 + this.rand(seed + 1) * 1.0);
    const width = size * (0.3 + this.rand(seed + 2) * 0.35);
    const tipX = cx + Math.cos(angle) * height;
    const tipY = cy + Math.sin(angle) * height;
    const perpAngle = angle + Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(perpAngle) * width, cy + Math.sin(perpAngle) * width);
    ctx.lineTo(tipX, tipY);
    ctx.quadraticCurveTo(
      cx + Math.cos(angle) * height * 0.8 - Math.cos(perpAngle) * width * 0.5,
      cy + Math.sin(angle) * height * 0.8 - Math.sin(perpAngle) * width * 0.5,
      cx - Math.cos(perpAngle) * width, cy - Math.sin(perpAngle) * width
    );
    ctx.stroke();
  }

  spineRadial(cx, cy, size, seed, arcStart = null, arcSpan = null) {
    const ctx = this.ctx;
    const count = 6 + Math.floor(this.rand(seed) * 12);
    const aStart = arcStart !== null ? arcStart : this.rand(seed + 1) * Math.PI;
    const aSpan = arcSpan !== null ? arcSpan : Math.PI * (0.6 + this.rand(seed + 2) * 0.7);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const angle = aStart + (i / (count - 1)) * aSpan;
      const len = size * (0.5 + this.rand(seed + i + 10) * 0.7);
      const wobble = (this.rand(seed + i + 20) - 0.5) * 0.15;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle + wobble) * len, cy + Math.sin(angle + wobble) * len);
    }
    ctx.stroke();
  }

  snakeBody(startX, startY, length, seed, thickness = 3) {
    const ctx = this.ctx;
    const segments = 20 + Math.floor(this.rand(seed) * 20);
    const amplitude = 15 + this.rand(seed + 1) * 25;
    const frequency = 0.08 + this.rand(seed + 2) * 0.08;
    const direction = this.rand(seed + 3) * Math.PI * 2;
    const points = [];
    let x = startX, y = startY;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const wave = Math.sin(t * Math.PI * 2 * frequency * segments) * amplitude * (1 - t * 0.3);
      const mainDist = t * length;
      const perpAngle = direction + Math.PI / 2;
      x = startX + Math.cos(direction) * mainDist + Math.cos(perpAngle) * wave;
      y = startY + Math.sin(direction) * mainDist + Math.sin(perpAngle) * wave;
      points.push({ x, y, t });
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    return { points, direction };
  }

  snakeHead(x, y, size, angle, seed) {
    const ctx = this.ctx;
    const headLen = size * (1.2 + this.rand(seed) * 0.5);
    const headWidth = size * (0.6 + this.rand(seed + 1) * 0.3);
    ctx.beginPath();
    const tipX = x + Math.cos(angle) * headLen;
    const tipY = y + Math.sin(angle) * headLen;
    const perpAngle = angle + Math.PI / 2;
    ctx.moveTo(x + Math.cos(perpAngle) * headWidth, y + Math.sin(perpAngle) * headWidth);
    ctx.quadraticCurveTo(
      x + Math.cos(angle) * headLen * 0.7 + Math.cos(perpAngle) * headWidth * 0.6,
      y + Math.sin(angle) * headLen * 0.7 + Math.sin(perpAngle) * headWidth * 0.6,
      tipX, tipY
    );
    ctx.quadraticCurveTo(
      x + Math.cos(angle) * headLen * 0.7 - Math.cos(perpAngle) * headWidth * 0.6,
      y + Math.sin(angle) * headLen * 0.7 - Math.sin(perpAngle) * headWidth * 0.6,
      x - Math.cos(perpAngle) * headWidth, y - Math.sin(perpAngle) * headWidth
    );
    ctx.stroke();
    const eyeX = x + Math.cos(angle) * headLen * 0.3 + Math.cos(perpAngle) * headWidth * 0.4;
    const eyeY = y + Math.sin(angle) * headLen * 0.3 + Math.sin(perpAngle) * headWidth * 0.4;
    this.reptileEye(eyeX, eyeY, size * 0.35, seed + 10);

    // Forked tongue
    if (this.rand(seed + 3) > 0.4) {
      const tongueLen = size * 0.8;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + Math.cos(angle) * tongueLen * 0.7, tipY + Math.sin(angle) * tongueLen * 0.7);
      ctx.lineTo(tipX + Math.cos(angle - 0.3) * tongueLen, tipY + Math.sin(angle - 0.3) * tongueLen);
      ctx.moveTo(tipX + Math.cos(angle) * tongueLen * 0.7, tipY + Math.sin(angle) * tongueLen * 0.7);
      ctx.lineTo(tipX + Math.cos(angle + 0.3) * tongueLen, tipY + Math.sin(angle + 0.3) * tongueLen);
      ctx.stroke();
    }
  }

  octopusMantle(cx, cy, size, seed) {
    const ctx = this.ctx;
    const bulbousness = 0.8 + this.rand(seed) * 0.4;
    const asymmetry = (this.rand(seed + 1) - 0.5) * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.5, cy + size * 0.3);
    ctx.quadraticCurveTo(cx - size * (0.7 + asymmetry), cy - size * 0.3, cx - size * 0.3, cy - size * bulbousness);
    ctx.quadraticCurveTo(cx, cy - size * (bulbousness + 0.2), cx + size * 0.3, cy - size * bulbousness);
    ctx.quadraticCurveTo(cx + size * (0.7 - asymmetry), cy - size * 0.3, cx + size * 0.5, cy + size * 0.3);
    ctx.stroke();
    const eyeSize = size * (0.15 + this.rand(seed + 2) * 0.1);
    const eyeY = cy - size * 0.2;
    this.eyeMark(cx - size * 0.25, eyeY, eyeSize, seed + 10);
    this.eyeMark(cx + size * 0.25, eyeY, eyeSize, seed + 11);
  }

  octopusTentacle(startX, startY, length, angle, seed) {
    const ctx = this.ctx;
    const segments = 12 + Math.floor(this.rand(seed) * 8);
    const curl = (this.rand(seed + 1) - 0.5) * 2;
    const taper = 0.7 + this.rand(seed + 2) * 0.3;
    const points = [];
    let currentAngle = angle;
    let x = startX, y = startY;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      points.push({ x, y, t });
      const segLen = (length / segments) * (1 - t * (1 - taper));
      currentAngle += curl * 0.15 * (1 + t);
      currentAngle += (this.rand(seed + i + 10) - 0.5) * 0.3;
      x += Math.cos(currentAngle) * segLen;
      y += Math.sin(currentAngle) * segLen;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // Suckers
    if (this.rand(seed + 3) > 0.3) {
      ctx.beginPath();
      for (let i = 1; i < points.length - 1; i += 2) {
        const p = points[i];
        const suckerSize = 2 + (1 - p.t) * 3;
        ctx.moveTo(p.x + suckerSize, p.y);
        ctx.arc(p.x, p.y, suckerSize, 0, Math.PI * 2);
      }
      ctx.stroke();
    }

    return points;
  }

  tailForm(cx, cy, size, angle, seed, style = null) {
    const ctx = this.ctx;
    const s = style || this.randChoice(['thick', 'curl', 'whip'], seed);
    if (s === 'thick') {
      const len = size * (1.2 + this.rand(seed + 1) * 0.5);
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.12, cy);
      ctx.quadraticCurveTo(cx + Math.cos(angle) * len * 0.5 - size * 0.08, cy + Math.sin(angle) * len * 0.5, cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
      ctx.quadraticCurveTo(cx + Math.cos(angle) * len * 0.5 + size * 0.08, cy + Math.sin(angle) * len * 0.5, cx + size * 0.12, cy);
      ctx.stroke();
    } else {
      const segments = 6 + Math.floor(this.rand(seed + 1) * 5);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      let px = cx, py = cy;
      let currentAngle = angle;
      for (let i = 0; i < segments; i++) {
        const segLen = size * 0.2 * (1 - i * 0.08);
        currentAngle += (this.rand(seed + i + 10) - 0.5) * 0.4;
        px += Math.cos(currentAngle) * segLen;
        py += Math.sin(currentAngle) * segLen;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  pouchForm(cx, cy, size, seed) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.55, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.35, cy - size * 0.15);
    ctx.quadraticCurveTo(cx, cy - size * 0.3, cx + size * 0.35, cy - size * 0.15);
    ctx.stroke();
    if (this.rand(seed) > 0.4) {
      ctx.beginPath();
      ctx.arc(cx, cy - size * 0.4, size * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.12, cy - size * 0.52);
      ctx.lineTo(cx - size * 0.18, cy - size * 0.7);
      ctx.lineTo(cx - size * 0.08, cy - size * 0.55);
      ctx.moveTo(cx + size * 0.12, cy - size * 0.52);
      ctx.lineTo(cx + size * 0.18, cy - size * 0.7);
      ctx.lineTo(cx + size * 0.08, cy - size * 0.55);
      ctx.stroke();
      // Joey eyes
      ctx.beginPath();
      ctx.arc(cx - size * 0.06, cy - size * 0.42, size * 0.03, 0, Math.PI * 2);
      ctx.arc(cx + size * 0.06, cy - size * 0.42, size * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  featherStrokes(cx, cy, size, angle, seed) {
    const ctx = this.ctx;
    const barbs = 3 + Math.floor(this.rand(seed) * 5);
    const endX = cx + Math.cos(angle) * size;
    const endY = cy + Math.sin(angle) * size;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 1; i < barbs; i++) {
      const t = i / barbs;
      const px = cx + (endX - cx) * t;
      const py = cy + (endY - cy) * t;
      const barbLen = size * 0.25 * (1 - t * 0.4);
      const barbAngle = angle + Math.PI / 2;
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(barbAngle) * barbLen, py + Math.sin(barbAngle) * barbLen);
      ctx.moveTo(px, py);
      ctx.lineTo(px - Math.cos(barbAngle) * barbLen, py - Math.sin(barbAngle) * barbLen);
    }
    ctx.stroke();
  }

  // ========== CREATURE TEMPLATES ==========

  getTemplates() {
    return {
      kookaburra: (seed) => ({
        type: 'kookaburra',
        headSize: 22 + this.rand(seed) * 18,
        headShape: this.randChoice(['round', 'angular', 'oval'], seed + 1),
        beakSize: 35 + this.rand(seed + 2) * 30,
        beakAngle: (this.rand(seed + 3) - 0.5) * 0.3,
        eyeSize: 7 + this.rand(seed + 6) * 5,
        eyePosition: 0.2 + this.rand(seed + 7) * 0.15,
        hasSecondEye: this.rand(seed + 8) > 0.35,
        hasCrest: this.rand(seed + 9) > 0.5,
        crestStyle: this.randChoice(['hatch', 'feathers', 'spiky'], seed + 10),
        hasBody: this.rand(seed + 11) > 0.4,
        hasEyeStripe: this.rand(seed + 13) > 0.6,
        hasWingHint: this.rand(seed + 14) > 0.5
      }),

      snake: (seed) => ({
        type: 'snake',
        bodyLength: 80 + this.rand(seed) * 120,
        bodyThickness: 3 + this.rand(seed + 1) * 4,
        coiled: this.rand(seed + 4) > 0.7,
        headSize: 10 + this.rand(seed + 5) * 10,
        raised: this.rand(seed + 12) > 0.6,
        direction: this.rand(seed + 13) * Math.PI * 2
      }),

      octopus: (seed) => ({
        type: 'octopus',
        mantleSize: 25 + this.rand(seed) * 20,
        tentacleCount: 5 + Math.floor(this.rand(seed + 4) * 4),
        tentacleLength: 40 + this.rand(seed + 5) * 50,
        tentacleCurl: 0.5 + this.rand(seed + 6) * 1.5,
        tentacleSpread: 0.8 + this.rand(seed + 7) * 0.8,
        hasTexture: this.rand(seed + 10) > 0.6
      }),

      wallaby: (seed) => ({
        type: 'wallaby',
        headSize: 18 + this.rand(seed) * 15,
        headShape: this.randChoice(['soft', 'angular'], seed + 1),
        earHeight: 28 + this.rand(seed + 2) * 22,
        earWidth: 8 + this.rand(seed + 3) * 6,
        earSpread: 0.25 + this.rand(seed + 4) * 0.35,
        earInnerLine: this.rand(seed + 5) > 0.5,
        hasSecondEar: this.rand(seed + 6) > 0.25,
        eyeSize: 7 + this.rand(seed + 7) * 5,
        eyeLarge: this.rand(seed + 8) > 0.5,
        noseSize: 4 + this.rand(seed + 10) * 4,
        hasPouch: this.rand(seed + 11) > 0.5,
        hasJoey: this.rand(seed + 12) > 0.6,
        hasTail: this.rand(seed + 13) > 0.5,
        tailStyle: this.randChoice(['thick', 'curl'], seed + 14),
        alertEars: this.rand(seed + 15) > 0.5,
        hasArms: this.rand(seed + 16) > 0.6
      }),

      echidna: (seed) => ({
        type: 'echidna',
        bodySize: 28 + this.rand(seed) * 22,
        bodyShape: this.randChoice(['dome', 'oval', 'humped'], seed + 1),
        spineCount: 10 + Math.floor(this.rand(seed + 2) * 15),
        spineLength: 20 + this.rand(seed + 3) * 25,
        spineArc: Math.PI * (0.5 + this.rand(seed + 4) * 0.5),
        snoutLength: 25 + this.rand(seed + 6) * 25,
        snoutAngle: (this.rand(seed + 7) - 0.3) * 0.6,
        snoutCurve: this.rand(seed + 8) > 0.5,
        eyeSize: 3 + this.rand(seed + 9) * 3,
        eyeVisible: this.rand(seed + 10) > 0.3,
        hasLegs: this.rand(seed + 11) > 0.5
      })
    };
  }

  // ========== ENTITY GENERATION ==========

  generateEntity(seed) {
    const weights = [
      { template: 'kookaburra', weight: 0.22 },
      { template: 'snake', weight: 0.20 },
      { template: 'octopus', weight: 0.18 },
      { template: 'wallaby', weight: 0.22 },
      { template: 'echidna', weight: 0.18 }
    ];

    let r = this.rand(seed);
    let cumulative = 0;
    let chosen = 'kookaburra';
    for (const w of weights) {
      cumulative += w.weight;
      if (r < cumulative) { chosen = w.template; break; }
    }

    const templates = this.getTemplates();
    const template = templates[chosen](seed + 1000);

    const [opacityMin, opacityMax] = this.config.opacityRange;
    const [lineWidthMin, lineWidthMax] = this.config.lineWidthRange;
    const [driftMin, driftMax] = this.config.driftAmount;

    const baseX = this.rand(seed + 10000) * this.width;
    const scale = 0.6 + this.randGauss(seed + 10002) * 1.0;
    const rotation = (this.rand(seed + 10003) - 0.5) * 0.45;
    const parallaxSpeed = (0.08 + this.rand(seed + 10004) * 0.5) * this.config.parallaxMultiplier;

    // Bidirectional: ~40% emerge scrolling down, ~60% emerge scrolling up
    const emergeDirection = this.rand(seed + 10011) > 0.6 ? -1 : 1;

    // Position based on direction - downward emergers start higher (off top of screen)
    const baseY = emergeDirection === 1
      ? this.rand(seed + 10001) * this.height * 3.5  // normal: spread through page
      : -this.height * 0.5 - this.rand(seed + 10001) * this.height * 2.5;  // reversed: start above viewport

    // Varied opacities: some very faint, some bold
    const opacityVariance = this.rand(seed + 10012);
    let opacity;
    if (opacityVariance < 0.3) {
      // 30% very faint (ghost-like)
      opacity = opacityMin * 0.5 + this.rand(seed + 10005) * (opacityMin * 0.5);
    } else if (opacityVariance > 0.85) {
      // 15% bold/prominent
      opacity = opacityMax + this.rand(seed + 10005) * (opacityMax * 0.3);
    } else {
      // 55% normal range
      opacity = opacityMin + this.rand(seed + 10005) * (opacityMax - opacityMin);
    }

    const lineWidth = lineWidthMin + this.rand(seed + 10006) * (lineWidthMax - lineWidthMin);
    const phase = this.rand(seed + 10007) * Math.PI * 2;
    const driftSpeed = 0.06 + this.rand(seed + 10008) * 0.2;
    const driftAmount = driftMin + this.rand(seed + 10009) * (driftMax - driftMin);
    const flip = this.rand(seed + 10010) > 0.5 ? 1 : -1;

    return {
      template, baseX, baseY, scale, rotation, parallaxSpeed,
      opacity, lineWidth, phase, driftSpeed, driftAmount, flip, seed,
      emergeDirection
    };
  }

  drawEntity(entity, scrollOffset, t) {
    const x = entity.baseX + Math.sin(t * entity.driftSpeed + entity.phase) * entity.driftAmount;
    // Bidirectional: emergeDirection controls whether entity moves up or down with scroll
    const scrollEffect = scrollOffset * entity.parallaxSpeed * entity.emergeDirection;
    const y = entity.baseY - scrollEffect + Math.cos(t * entity.driftSpeed * 0.7 + entity.phase) * entity.driftAmount * 0.5;

    if (y < -400 || y > this.height + 400) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(entity.rotation + Math.sin(t * 0.03 + entity.phase) * 0.015);
    ctx.scale(entity.scale * entity.flip, entity.scale);

    ctx.strokeStyle = this.palette.stroke(entity.opacity);
    ctx.fillStyle = this.palette.stroke(entity.opacity * 0.8);
    ctx.lineWidth = entity.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (entity.template.type) {
      case 'kookaburra': this.drawKookaburra(entity, t); break;
      case 'snake': this.drawSnake(entity, t); break;
      case 'octopus': this.drawOctopus(entity, t); break;
      case 'wallaby': this.drawWallaby(entity, t); break;
      case 'echidna': this.drawEchidna(entity, t); break;
    }

    ctx.restore();
  }

  // ========== CREATURE DRAWING ==========

  drawKookaburra(entity, t) {
    const tpl = entity.template;
    const s = entity.seed;
    const hs = tpl.headSize;
    const ctx = this.ctx;

    if (tpl.headShape === 'round') {
      ctx.beginPath();
      ctx.arc(0, 0, hs, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tpl.headShape === 'angular') {
      this.shard(0, 0, hs * 1.1, s);
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, hs * 0.9, hs * 1.1, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const beakX = hs * 0.7;
    this.beakForm(beakX, hs * 0.1, tpl.beakSize, tpl.beakAngle, s + 100);

    const eyeX = hs * tpl.eyePosition;
    const eyeY = -hs * 0.25;
    this.eyeMark(eyeX, eyeY, tpl.eyeSize, s + 200);
    if (tpl.hasSecondEye) this.eyeMark(eyeX - hs * 0.5, eyeY + 2, tpl.eyeSize * 0.7, s + 201);

    if (tpl.hasEyeStripe) {
      ctx.beginPath();
      ctx.moveTo(eyeX - hs * 0.3, eyeY);
      ctx.lineTo(eyeX + hs * 0.5, eyeY + hs * 0.1);
      ctx.stroke();
    }

    if (tpl.hasCrest) {
      if (tpl.crestStyle === 'hatch') this.hatchField(-hs * 0.2, -hs * 0.7, hs * 0.5, s + 300, -Math.PI * 0.3);
      else if (tpl.crestStyle === 'feathers') for (let i = 0; i < 3; i++) this.featherStrokes(-hs * 0.1 + i * hs * 0.15, -hs * 0.6, hs * 0.35, -Math.PI/2 + (i - 1) * 0.2, s + 300 + i);
      else this.spineRadial(0, -hs * 0.5, hs * 0.4, s + 300, -Math.PI * 0.8, Math.PI * 0.6);
    }

    if (tpl.hasBody) {
      ctx.strokeStyle = this.palette.ghost(entity.opacity);
      ctx.beginPath();
      ctx.moveTo(-hs * 0.3, hs * 0.8);
      ctx.quadraticCurveTo(-hs * 0.1, hs * 1.5, 0, hs * 2.2);
      ctx.quadraticCurveTo(hs * 0.2, hs * 1.5, hs * 0.3, hs * 0.8);
      ctx.stroke();
      if (tpl.hasWingHint) {
        ctx.strokeStyle = this.palette.stroke(entity.opacity * 0.7);
        this.featherStrokes(-hs * 0.4, hs * 1.2, hs * 0.6, Math.PI * 0.7, s + 400);
      }
    }
  }

  drawSnake(entity, t) {
    const tpl = entity.template;
    const s = entity.seed;
    const ctx = this.ctx;

    if (tpl.coiled) {
      const coils = 2 + this.rand(s) * 1.5;
      const maxR = tpl.bodyLength * 0.15;
      ctx.beginPath();
      for (let a = 0; a < coils * Math.PI * 2; a += 0.1) {
        const r = maxR * (1 - a / (coils * Math.PI * 2) * 0.7);
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r * 0.4 + a * 3;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (tpl.raised) this.snakeHead(0, -maxR * 0.5, tpl.headSize, -Math.PI/2 + (this.rand(s + 50) - 0.5) * 0.5, s + 100);
    } else {
      this.snakeBody(0, 0, tpl.bodyLength, s, tpl.bodyThickness);
      this.snakeHead(0, 0, tpl.headSize, tpl.direction, s + 100);
    }
  }

  drawOctopus(entity, t) {
    const tpl = entity.template;
    const s = entity.seed;
    const ms = tpl.mantleSize;
    const ctx = this.ctx;

    this.octopusMantle(0, 0, ms, s);
    const baseY = ms * 0.35;

    for (let i = 0; i < tpl.tentacleCount; i++) {
      const spreadAngle = (i / (tpl.tentacleCount - 1) - 0.5) * Math.PI * tpl.tentacleSpread;
      const baseAngle = Math.PI / 2 + spreadAngle;
      const animOffset = Math.sin(t * 0.3 + i * 0.8) * 0.1;
      const startX = Math.cos(spreadAngle) * ms * 0.4;
      const startY = baseY;
      const tentacleSeed = s + 300 + i * 100;
      const length = tpl.tentacleLength * (0.7 + this.rand(tentacleSeed) * 0.5);
      ctx.strokeStyle = this.palette.stroke(entity.opacity * (0.7 + this.rand(tentacleSeed + 2) * 0.3));
      this.octopusTentacle(startX, startY, length, baseAngle + animOffset, tentacleSeed);
    }

    if (tpl.hasTexture) {
      ctx.strokeStyle = this.palette.ghost(entity.opacity);
      this.dotField(0, -ms * 0.4, ms * 0.3, s + 500, 4);
    }
  }

  drawWallaby(entity, t) {
    const tpl = entity.template;
    const s = entity.seed;
    const hs = tpl.headSize;
    const ctx = this.ctx;

    if (tpl.headShape === 'soft') {
      ctx.beginPath();
      ctx.ellipse(0, 0, hs * 0.85, hs, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else this.shard(0, 0, hs * 1.1, s);

    const earBaseY = -hs * 0.65;
    const earTwitch = tpl.alertEars ? Math.sin(t * 0.5) * 0.08 : 0;
    this.earForm(hs * tpl.earSpread, earBaseY, tpl.earWidth * 0.5, -Math.PI/2 - 0.15 + earTwitch, s + 100);

    ctx.beginPath();
    ctx.moveTo(hs * tpl.earSpread, earBaseY);
    ctx.quadraticCurveTo(hs * tpl.earSpread + tpl.earWidth * 0.3, earBaseY - tpl.earHeight * 0.6, hs * tpl.earSpread * 0.9, earBaseY - tpl.earHeight);
    ctx.quadraticCurveTo(hs * tpl.earSpread - tpl.earWidth * 0.2, earBaseY - tpl.earHeight * 0.6, hs * tpl.earSpread - tpl.earWidth * 0.3, earBaseY);
    ctx.stroke();

    if (tpl.earInnerLine) {
      ctx.beginPath();
      ctx.moveTo(hs * tpl.earSpread * 0.95, earBaseY - tpl.earHeight * 0.15);
      ctx.lineTo(hs * tpl.earSpread * 0.92, earBaseY - tpl.earHeight * 0.7);
      ctx.stroke();
    }

    if (tpl.hasSecondEar) {
      const ear2Spread = -tpl.earSpread * 0.7;
      ctx.beginPath();
      ctx.moveTo(hs * ear2Spread, earBaseY + hs * 0.1);
      ctx.quadraticCurveTo(hs * ear2Spread - tpl.earWidth * 0.25, earBaseY - tpl.earHeight * 0.5, hs * ear2Spread * 0.8, earBaseY - tpl.earHeight * 0.85);
      ctx.quadraticCurveTo(hs * ear2Spread + tpl.earWidth * 0.15, earBaseY - tpl.earHeight * 0.5, hs * ear2Spread + tpl.earWidth * 0.25, earBaseY + hs * 0.1);
      ctx.stroke();
    }

    const eyeSize = tpl.eyeLarge ? tpl.eyeSize * 1.3 : tpl.eyeSize;
    this.eyeMark(hs * 0.25, -hs * 0.1, eyeSize, s + 200);

    ctx.beginPath();
    ctx.moveTo(hs * 0.4, hs * 0.2);
    ctx.quadraticCurveTo(hs * 0.8, hs * 0.35, hs * 0.6, hs * 0.6);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(hs * 0.65, hs * 0.45, tpl.noseSize * 0.5, 0, Math.PI * 2);
    ctx.fill();

    if (tpl.hasArms) {
      ctx.strokeStyle = this.palette.ghost(entity.opacity);
      ctx.beginPath();
      ctx.moveTo(hs * 0.2, hs * 1.2);
      ctx.quadraticCurveTo(hs * 0.5, hs * 1.4, hs * 0.4, hs * 1.7);
      ctx.moveTo(-hs * 0.1, hs * 1.2);
      ctx.quadraticCurveTo(hs * 0.1, hs * 1.5, 0, hs * 1.7);
      ctx.stroke();
    }

    if (tpl.hasPouch) {
      ctx.strokeStyle = this.palette.ghost(entity.opacity);
      this.pouchForm(0, hs * 2.2, hs * 0.7, tpl.hasJoey ? s + 300 : s + 9999);
    }

    if (tpl.hasTail) {
      ctx.strokeStyle = this.palette.ghost(entity.opacity);
      this.tailForm(-hs * 0.3, hs * 2.5, hs * 1.8, Math.PI * 0.55, s + 400, tpl.tailStyle);
    }
  }

  drawEchidna(entity, t) {
    const tpl = entity.template;
    const s = entity.seed;
    const bs = tpl.bodySize;
    const ctx = this.ctx;

    if (tpl.bodyShape === 'dome') {
      ctx.beginPath();
      ctx.arc(0, bs * 0.2, bs * 0.75, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, bs * 0.2, bs * 0.75, bs * 0.3, 0, 0, Math.PI);
      ctx.stroke();
    } else if (tpl.bodyShape === 'oval') {
      ctx.beginPath();
      ctx.ellipse(0, 0, bs * 0.9, bs * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-bs * 0.8, bs * 0.3);
      ctx.quadraticCurveTo(-bs * 0.3, -bs * 0.6, bs * 0.2, -bs * 0.3);
      ctx.quadraticCurveTo(bs * 0.6, bs * 0.1, bs * 0.5, bs * 0.4);
      ctx.lineTo(-bs * 0.8, bs * 0.3);
      ctx.stroke();
    }

    const spineBaseY = tpl.bodyShape === 'dome' ? -bs * 0.1 : -bs * 0.2;
    this.spineRadial(0, spineBaseY, tpl.spineLength, s + 100, -Math.PI * 0.85, tpl.spineArc);
    if (tpl.spineCount > 15) this.spineRadial(bs * 0.15, spineBaseY + bs * 0.1, tpl.spineLength * 0.7, s + 150, -Math.PI * 0.75, tpl.spineArc * 0.7);

    const snoutStartX = bs * 0.5;
    const snoutStartY = bs * 0.25;
    if (tpl.snoutCurve) {
      ctx.beginPath();
      ctx.moveTo(snoutStartX, snoutStartY - bs * 0.1);
      ctx.quadraticCurveTo(snoutStartX + tpl.snoutLength * 0.6, snoutStartY + Math.sin(tpl.snoutAngle) * tpl.snoutLength * 0.3, snoutStartX + Math.cos(tpl.snoutAngle) * tpl.snoutLength, snoutStartY + Math.sin(tpl.snoutAngle) * tpl.snoutLength);
      ctx.quadraticCurveTo(snoutStartX + tpl.snoutLength * 0.6, snoutStartY + Math.sin(tpl.snoutAngle) * tpl.snoutLength * 0.3 + bs * 0.08, snoutStartX, snoutStartY + bs * 0.1);
      ctx.stroke();
    } else this.beakForm(snoutStartX, snoutStartY, tpl.snoutLength * 0.8, tpl.snoutAngle, s + 200);

    if (tpl.eyeVisible) {
      ctx.beginPath();
      ctx.arc(bs * 0.3, bs * 0.05, tpl.eyeSize, 0, Math.PI * 2);
      ctx.fill();
    }

    if (tpl.hasLegs) {
      ctx.strokeStyle = this.palette.ghost(entity.opacity);
      ctx.beginPath();
      ctx.moveTo(bs * 0.3, bs * 0.4);
      ctx.lineTo(bs * 0.4, bs * 0.8);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(bs * 0.4 + i * 4, bs * 0.8);
        ctx.lineTo(bs * 0.42 + i * 4, bs * 0.95);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-bs * 0.4, bs * 0.4);
      ctx.lineTo(-bs * 0.5, bs * 0.85);
      ctx.stroke();
    }
  }

  // ========== LIFECYCLE ==========

  init() {
    this.resize();
    this.initEntities();
  }

  initEntities() {
    this.entities = [];
    const [countMin, countMax] = this.config.entityCount;
    const entityCount = countMin + Math.floor(this.rand(this.SESSION_SEED + 99999) * (countMax - countMin));

    for (let i = 0; i < entityCount; i++) {
      this.entities.push(this.generateEntity(this.SESSION_SEED + i * 10000));
    }

    this.entities.sort((a, b) => a.parallaxSpeed - b.parallaxSpeed);
  }

  resize() {
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
  }

  onResize() {
    this.resize();
    this.initEntities();
  }

  onScroll() {
    this.targetScrollY = window.scrollY;
  }

  animate() {
    if (!this.active) {
      return;
    }

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.time += 0.016;
    this.scrollY += (this.targetScrollY - this.scrollY) * 0.08;

    this.entities.forEach(entity => this.drawEntity(entity, this.scrollY, this.time));

    this.animationId = requestAnimationFrame(this.boundAnimate);
  }

  start() {
    if (this.active) return;
    this.active = true;
    window.addEventListener('resize', this.boundOnResize);
    window.addEventListener('scroll', this.boundOnScroll, { passive: true });
    this.targetScrollY = window.scrollY;
    this.animate();
  }

  stop() {
    this.active = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    window.removeEventListener('resize', this.boundOnResize);
    window.removeEventListener('scroll', this.boundOnScroll);
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  toggle() {
    if (this.active) {
      this.stop();
    } else {
      this.start();
    }
    return this.active;
  }

  isActive() {
    return this.active;
  }

  /**
   * Update the accent color (for theme switching)
   * @param {string} accent - 'red' or 'orange'
   */
  setAccent(accent) {
    // Red: hue 355, Orange: hue 27
    this.config.accentHue = accent === 'orange' ? 27 : 355;
    // Regenerate palette with new accent
    this.palette = this.generatePalette(this.SESSION_SEED);
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FaunaOverlay;
}
