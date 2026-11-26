// WCAG 2.2 AA Contrast Verification Script (fails CI if any token pair < 4.5:1)
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function luminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1, hex2) {
  const l1 = luminance(hexToRgb(hex1));
  const l2 = luminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const pairs = [
  { name: 'Light: ink on cream', fg: '#0A0A0A', bg: '#FAF7F0', min: 4.5 },
  { name: 'Light: muted on cream', fg: '#4B5563', bg: '#FAF7F0', min: 4.5 },
  { name: 'Light: ink on coral button', fg: '#0A0A0A', bg: '#FF6B6B', min: 4.5 },
  { name: 'Light: ink on teal button', fg: '#0A0A0A', bg: '#00B4D8', min: 4.5 },
  { name: 'Light: ink on yellow', fg: '#0A0A0A', bg: '#FCD34D', min: 4.5 },
  { name: 'Light: ink on mint', fg: '#0A0A0A', bg: '#34D399', min: 4.5 },
  { name: 'Dark: cream ink on dark bg', fg: '#FAF7F0', bg: '#111318', min: 4.5 },
  { name: 'Dark: muted on dark surface', fg: '#CBD5E1', bg: '#1A1E26', min: 4.5 },
  { name: 'Dark: ink on dark coral', fg: '#0A0A0A', bg: '#FF8585', min: 4.5 },
  { name: 'Dark: ink on dark teal', fg: '#0A0A0A', bg: '#38C9E8', min: 4.5 },
];

let failed = false;
for (const p of pairs) {
  const ratio = contrastRatio(p.fg, p.bg);
  const ok = ratio >= p.min;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${p.name}: ${ratio.toFixed(2)}:1 (min ${p.min}:1)`);
  if (!ok) failed = true;
}

if (failed) process.exit(1);
