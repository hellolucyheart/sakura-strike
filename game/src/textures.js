// textures.js — every surface in Harbor Yard is painted on a canvas at boot.
// No image files, no network: the game ships as pure code, and the yard gets
// corrugated container steel, stencilled unit numbers, worn concrete with
// painted site letters, warehouse cladding and hazard stripes from here.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(THREE, c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Corrugated container side: vertical ribs, a stencil number, rust at the feet.
export function containerTexture(THREE, base, dark, label) {
  const [c, g] = canvas(512, 256);
  g.fillStyle = base; g.fillRect(0, 0, 512, 256);
  for (let x = 8; x < 512; x += 32) {
    const grad = g.createLinearGradient(x, 0, x + 28, 0);
    grad.addColorStop(0, dark); grad.addColorStop(0.45, base); grad.addColorStop(1, dark);
    g.fillStyle = grad; g.fillRect(x, 10, 28, 236);
  }
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, 0, 512, 12); g.fillRect(0, 244, 512, 12);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = 'bold 44px ui-monospace, monospace';
  g.fillText(label, 28, 66);
  g.font = '20px ui-monospace, monospace';
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillText('SAKURA FREIGHT LINES', 28, 96);
  // rust streaks
  g.fillStyle = 'rgba(90,50,25,0.35)';
  for (let i = 0; i < 14; i++) {
    const x = (i * 67) % 500;
    g.fillRect(x, 210 + (i % 4) * 8, 5, 40);
  }
  return toTexture(THREE, c);
}

// The yard floor: one big painted concrete sheet for the whole 72 x 52 map,
// drawn once at world scale so site letters and lane lines sit exactly where
// the gameplay says they are. map.js passes its own site/lane coordinates in.
export function groundTexture(THREE, sites, lanes) {
  const W = 1440, H = 1040; // 20 px per metre over 72 x 52 m
  const [c, g] = canvas(W, H);
  g.fillStyle = '#5d6066'; g.fillRect(0, 0, W, H);
  // concrete slabs + noise wear
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
  for (let x = 0; x <= W; x += 120) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += 120) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + Math.random() * 0.05})`;
    g.fillRect(Math.random() * W, Math.random() * H, 3 + Math.random() * 9, 2 + Math.random() * 5);
  }
  const px = (x) => (x + 36) * 20;
  const pz = (z) => (z + 26) * 20;
  // lane guide lines
  g.strokeStyle = 'rgba(240,200,90,0.55)'; g.lineWidth = 5; g.setLineDash([26, 18]);
  for (const lane of lanes) {
    g.beginPath();
    lane.forEach(([x, z], i) => (i === 0 ? g.moveTo(px(x), pz(z)) : g.lineTo(px(x), pz(z))));
    g.stroke();
  }
  g.setLineDash([]);
  // bombsite paint: ring + giant letter
  for (const s of sites) {
    g.strokeStyle = s.color; g.lineWidth = 8;
    g.beginPath(); g.arc(px(s.x), pz(s.z), s.radius * 20, 0, Math.PI * 2); g.stroke();
    g.fillStyle = s.color; g.globalAlpha = 0.8;
    g.font = 'bold 150px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(s.id, px(s.x), pz(s.z) + 6);
    g.globalAlpha = 1; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  const t = toTexture(THREE, c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function claddingTexture(THREE) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#7a8288'; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, 0, 3, 256);
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 3, 0, 2, 256);
  }
  g.fillStyle = 'rgba(0,0,0,0.10)';
  for (let i = 0; i < 300; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 4, 3);
  return toTexture(THREE, c, 3, 1);
}

export function hazardTexture(THREE) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#d8a723'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#22242a';
  for (let x = -128; x < 256; x += 44) {
    g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 22, 128); g.lineTo(x + 128 + 22, 0); g.lineTo(x + 128, 0); g.fill();
  }
  return toTexture(THREE, c, 2, 1);
}

export function crateTexture(THREE) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#9a7c4f'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(60,40,18,0.8)'; g.lineWidth = 6; g.strokeRect(4, 4, 120, 120);
  g.beginPath(); g.moveTo(4, 4); g.lineTo(124, 124); g.moveTo(124, 4); g.lineTo(4, 124); g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 120; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 5, 2);
  return toTexture(THREE, c);
}
