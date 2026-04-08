const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function drawNeuron(canvas) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const scale = size / 1024;

  // Background - deep dark blue/purple
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.7);
  bg.addColorStop(0, '#0d0d2b');
  bg.addColorStop(1, '#050510');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.18);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.18);
  ctx.clip();

  const S = (v) => v * scale;

  // Helper: draw a glowing line
  function glowLine(x1, y1, x2, y2, color, width, alpha = 1) {
    // Outer glow
    ctx.save();
    ctx.globalAlpha = alpha * 0.18;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.35;
    ctx.lineWidth = width * 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  // Helper: draw a glowing curved branch
  function glowCurve(x1, y1, cpx, cpy, x2, y2, color, width, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.15;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cpx, cpy, x2, y2);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.3;
    ctx.lineWidth = width * 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cpx, cpy, x2, y2);
    ctx.stroke();

    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cpx, cpy, x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function dot(x, y, r, color, alpha = 0.9) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.3;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, color);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // === DENDRITES (top-left branching tree) ===
  const dendColor = '#7b6fff';
  const dw = S(4);

  // Main dendrite trunk going upper-left
  glowCurve(cx, cy, cx - S(80), cy - S(110), cx - S(160), cy - S(200), dendColor, dw);

  // Branch 1 from mid-trunk
  glowCurve(cx - S(80), cy - S(110), cx - S(150), cy - S(100), cx - S(230), cy - S(130), dendColor, dw * 0.7);
  // Sub-branch
  glowCurve(cx - S(150), cy - S(100), cx - S(190), cy - S(60), cx - S(240), cy - S(50), dendColor, dw * 0.45);

  // Branch 2 from tip
  glowCurve(cx - S(160), cy - S(200), cx - S(200), cy - S(240), cx - S(170), cy - S(290), dendColor, dw * 0.7);
  glowCurve(cx - S(160), cy - S(200), cx - S(110), cy - S(260), cx - S(90), cy - S(310), dendColor, dw * 0.55);

  // Second dendrite going upper-right
  glowCurve(cx, cy, cx + S(90), cy - S(90), cx + S(180), cy - S(170), dendColor, dw);
  glowCurve(cx + S(90), cy - S(90), cx + S(160), cy - S(60), cx + S(230), cy - S(80), dendColor, dw * 0.65);
  glowCurve(cx + S(180), cy - S(170), cx + S(220), cy - S(220), cx + S(200), cy - S(280), dendColor, dw * 0.6);
  glowCurve(cx + S(180), cy - S(170), cx + S(240), cy - S(160), cx + S(290), cy - S(130), dendColor, dw * 0.5);

  // Third dendrite going left
  glowCurve(cx, cy, cx - S(120), cy + S(20), cx - S(230), cy - S(20), dendColor, dw * 0.8);
  glowCurve(cx - S(120), cy + S(20), cx - S(150), cy + S(80), cx - S(200), cy + S(100), dendColor, dw * 0.55);

  // Dendrite tips (synaptic terminals)
  dot(cx - S(230), cy - S(130), S(8), '#a89fff');
  dot(cx - S(240), cy - S(50), S(6), '#a89fff');
  dot(cx - S(170), cy - S(290), S(7), '#a89fff');
  dot(cx - S(90), cy - S(310), S(6), '#a89fff');
  dot(cx + S(230), cy - S(80), S(7), '#a89fff');
  dot(cx + S(200), cy - S(280), S(6), '#a89fff');
  dot(cx + S(290), cy - S(130), S(6), '#a89fff');
  dot(cx - S(230), cy - S(20), S(7), '#a89fff');
  dot(cx - S(200), cy + S(100), S(6), '#a89fff');

  // === AXON (going lower-right, long) ===
  const axonColor = '#00e5ff';
  const aw = S(5);

  glowCurve(cx, cy, cx + S(80), cy + S(100), cx + S(130), cy + S(210), axonColor, aw);
  glowCurve(cx + S(130), cy + S(210), cx + S(150), cy + S(270), cx + S(110), cy + S(330), axonColor, aw * 0.85);

  // Axon collaterals
  glowCurve(cx + S(80), cy + S(100), cx + S(140), cy + S(120), cx + S(200), cy + S(160), axonColor, aw * 0.55, 0.85);
  glowCurve(cx + S(130), cy + S(210), cx + S(200), cy + S(230), cx + S(260), cy + S(210), axonColor, aw * 0.5, 0.85);

  // Synaptic terminals at axon ends (bright cyan dots)
  dot(cx + S(110), cy + S(330), S(10), '#00e5ff');
  dot(cx + S(200), cy + S(160), S(8), '#00e5ff');
  dot(cx + S(260), cy + S(210), S(8), '#00e5ff');

  // === SOMA (cell body) ===
  const somaR = S(78);

  // Outer glow halo
  const halo = ctx.createRadialGradient(cx, cy, somaR * 0.5, cx, cy, somaR * 2.2);
  halo.addColorStop(0, 'rgba(100,80,255,0.35)');
  halo.addColorStop(0.5, 'rgba(60,40,200,0.12)');
  halo.addColorStop(1, 'transparent');
  ctx.save();
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, somaR * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Soma body gradient
  const somaGrad = ctx.createRadialGradient(cx - S(20), cy - S(20), S(5), cx, cy, somaR);
  somaGrad.addColorStop(0, '#5a4fff');
  somaGrad.addColorStop(0.45, '#3a28cc');
  somaGrad.addColorStop(1, '#1a1060');
  ctx.save();
  ctx.fillStyle = somaGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, somaR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Soma border glow
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#8b7aff';
  ctx.lineWidth = S(3);
  ctx.beginPath();
  ctx.arc(cx, cy, somaR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Nucleus
  const nucR = S(32);
  const nucGrad = ctx.createRadialGradient(cx - S(8), cy - S(8), S(2), cx, cy, nucR);
  nucGrad.addColorStop(0, '#c0b8ff');
  nucGrad.addColorStop(0.5, '#7060e8');
  nucGrad.addColorStop(1, '#3020a0');
  ctx.save();
  ctx.fillStyle = nucGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, nucR, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#b0a0ff';
  ctx.lineWidth = S(1.5);
  ctx.stroke();
  ctx.restore();

  // Nucleus shine
  ctx.save();
  ctx.globalAlpha = 0.5;
  const shine = ctx.createRadialGradient(cx - S(10), cy - S(10), 0, cx - S(10), cy - S(10), S(18));
  shine.addColorStop(0, 'rgba(255,255,255,0.7)');
  shine.addColorStop(1, 'transparent');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(cx - S(10), cy - S(10), S(18), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore(); // end clip
}

// Sizes needed for icns
const sizes = [16, 32, 64, 128, 256, 512, 1024];

const iconsetDir = path.join(__dirname, '../build/icon.iconset');
fs.mkdirSync(iconsetDir, { recursive: true });
fs.mkdirSync(path.join(__dirname, '../build'), { recursive: true });

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  drawNeuron(canvas);
  const buf = canvas.toBuffer('image/png');
  // Standard names for iconutil
  if (size <= 512) {
    fs.writeFileSync(path.join(iconsetDir, `icon_${size}x${size}.png`), buf);
  }
  if (size >= 32) {
    // @2x versions (half-size label)
    fs.writeFileSync(path.join(iconsetDir, `icon_${size/2}x${size/2}@2x.png`), buf);
  }
  // Also save 1024 as icon.png for Linux
  if (size === 1024) {
    fs.writeFileSync(path.join(__dirname, '../build/icon.png'), buf);
  }
  console.log(`Generated ${size}x${size}`);
}

// Build .icns using iconutil (macOS built-in)
try {
  execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(__dirname, '../build/icon.icns')}"`, { stdio: 'inherit' });
  console.log('Created build/icon.icns');
} catch (e) {
  console.error('iconutil failed:', e.message);
}

// Create a simple .ico for Windows (just use 256px PNG renamed — electron-builder handles it)
const ico256 = createCanvas(256, 256);
drawNeuron(ico256);
// For a proper .ico we'd need a library, but electron-builder accepts PNG for ico on cross-platform builds.
// Save as icon.ico placeholder using the 256 PNG — electron-builder will use icon.icns on mac.
fs.writeFileSync(path.join(__dirname, '../build/icon.ico'), ico256.toBuffer('image/png'));
console.log('Created build/icon.ico (PNG format, electron-builder compatible)');
