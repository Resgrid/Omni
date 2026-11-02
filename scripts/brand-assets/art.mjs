// Vector masters for the five Resgrid app icons. Every icon is the Resgrid grid mark — a framed square with a column
// of blocks to its right and a row below, the outer corners rounded — with the app's glyph inside the frame:
// Responder a person with a check, Unit a road with a turn sign, IC a clipboard checklist, Dispatch a console
// monitor, BigBoard a radio. Geometry is in "mark units": the mark's box is 0..1000 on both axes.

export const VARIANTS = ['responder', 'unit', 'ic', 'dispatch', 'bigboard'];

export const BRAND = {
  gradientStart: '#2F93CE',
  gradientEnd: '#2757AB',
};

// Colour roles. `light` is the store icon; `dark` and `tinted` are the iOS 18 appearances; `monochrome` is rendered
// as grey levels and turned into the alpha of Android's themed icon (black = cut out).
export const PALETTES = {
  light: { frame: '#FFFFFF', block: '#70CCE4', primary: '#FFFFFF', secondary: '#CCCCCC', ink: '#333333', signal: '#70CCE4', onSignal: '#FFFFFF', detail: '#70CCE4', deep: '#2757AB', speaker: '#2F93CE', onInk: '#FFFFFF' },
  dark: { frame: '#FFFFFF', block: '#70CCE4', primary: '#FFFFFF', secondary: '#C5D0DC', ink: '#55667B', signal: '#70CCE4', onSignal: '#FFFFFF', detail: '#70CCE4', deep: '#2F6FC0', speaker: '#2F93CE', onInk: '#FFFFFF' },
  tinted: {
    frame: '#FFFFFF',
    block: '#9C9C9C',
    primary: '#FFFFFF',
    secondary: '#C4C4C4',
    ink: '#5C5C5C',
    signal: '#9C9C9C',
    onSignal: '#FFFFFF',
    detail: '#9C9C9C',
    deep: '#5C5C5C',
    speaker: '#7A7A7A',
    onInk: '#FFFFFF',
  },
  monochrome: {
    frame: '#FFFFFF',
    block: '#999999',
    primary: '#FFFFFF',
    secondary: '#BFBFBF',
    ink: '#737373',
    signal: '#FFFFFF',
    onSignal: '#000000',
    detail: '#000000',
    deep: '#000000',
    speaker: '#000000',
    onInk: '#FFFFFF',
  },
};

const FRAME = 680; // frame side
const GAP = 40;
const RADIUS = 64; // outer corners of the mark
const STROKE = 30; // frame line
const HALO = 30; // clearance cut into the frame around a glyph that crosses it

/** Rounded rectangle path with an independent radius per corner. */
export function roundedRect(x, y, w, h, { tl = 0, tr = 0, br = 0, bl = 0 } = {}) {
  return [
    `M${x + tl},${y}`,
    `H${x + w - tr}`,
    tr ? `A${tr},${tr} 0 0 1 ${x + w},${y + tr}` : '',
    `V${y + h - br}`,
    br ? `A${br},${br} 0 0 1 ${x + w - br},${y + h}` : '',
    `H${x + bl}`,
    bl ? `A${bl},${bl} 0 0 1 ${x},${y + h - bl}` : '',
    `V${y + tl}`,
    tl ? `A${tl},${tl} 0 0 1 ${x + tl},${y}` : '',
    'Z',
  ].join('');
}

const rr = (x, y, w, h, r) => roundedRect(x, y, w, h, { tl: r, tr: r, br: r, bl: r });

// ── Glyphs ── each returns the glyph drawn with a palette and, when it crosses the frame line, the shapes whose
// outline (grown by HALO) is cut out of the frame.

function responder(c) {
  const check = 'M-84,300 L14,398 L166,246';
  return {
    draw: [
      `<circle cx="404" cy="252" r="112" fill="${c.primary}"/>`,
      `<path d="M196,650 V566 A146,146 0 0 1 342,420 H466 A146,146 0 0 1 612,566 V650 Z" fill="${c.secondary}"/>`,
      `<path d="${check}" fill="none" stroke="${c.signal}" stroke-width="70" stroke-linecap="round" stroke-linejoin="round"/>`,
    ].join(''),
    // Hull of the check, so the frame line stops above it rather than running into the V.
    halo: `<path d="${check}Z" stroke-width="${70 + HALO * 2}"/>`,
  };
}

function unit(c) {
  const sign = { x: 10, y: 300, r: 146 };
  const diamond = `M${sign.x},${sign.y - sign.r} L${sign.x + sign.r},${sign.y} L${sign.x},${sign.y + sign.r} L${sign.x - sign.r},${sign.y} Z`;
  // Road in perspective: centre line dashes grow toward the viewer.
  const top = 292;
  const bottom = 650;
  const widthAt = (y) => 150 + ((560 - 150) * (y - top)) / (bottom - top);
  const dashes = [
    [314, 344],
    [384, 432],
    [476, 544],
    [592, 650],
  ]
    .map(([y0, y1]) => {
      const w = widthAt((y0 + y1) / 2) * 0.075;
      return `<path d="${roundedRect(370 - w / 2, y0, w, y1 - y0, { tl: w / 3, tr: w / 3, br: y1 === bottom ? 0 : w / 3, bl: y1 === bottom ? 0 : w / 3 })}" fill="${c.onInk}"/>`;
    })
    .join('');
  const sx = sign.x;
  const sy = sign.y;
  return {
    draw: [
      `<path d="M${370 - 75},${top} H${370 + 75} L${370 + 280},${bottom} H${370 - 280} Z" fill="${c.ink}" stroke="${c.ink}" stroke-width="16" stroke-linejoin="round"/>`,
      dashes,
      `<path d="${diamond}" fill="${c.signal}" stroke="${c.signal}" stroke-width="44" stroke-linejoin="round"/>`,
      // Turn-left arrow: stem up from the bottom, bending left into an arrowhead.
      `<path d="M${sx + 40},${sy + 84} V${sy + 4} A42,42 0 0 0 ${sx - 2},${sy - 38} H${sx - 24}" fill="none" stroke="${c.onSignal}" stroke-width="34" stroke-linejoin="round"/>`,
      `<path d="M${sx - 24},${sy - 90} L${sx - 86},${sy - 38} L${sx - 24},${sy + 14} Z" fill="${c.onSignal}" stroke="${c.onSignal}" stroke-width="8" stroke-linejoin="round"/>`,
    ].join(''),
    halo: `<path d="${diamond}" stroke-width="${44 + HALO * 2}"/>`,
  };
}

function ic(c) {
  const row = (y, mark) =>
    [
      mark === 'check'
        ? `<path d="M206,${y} L236,${y + 30} L290,${y - 26}" fill="none" stroke="${c.deep}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<circle cx="244" cy="${y + 4}" r="24" fill="${c.deep}"/>`,
      `<path d="${rr(322, y - 12, 228, 32, 16)}" fill="${c.detail}"/>`,
    ].join('');
  return {
    draw: [
      `<path d="${rr(150, 150, 460, 500, 44)}" fill="${c.primary}"/>`,
      // Clip: a tab across the top of the board and a ring above it.
      `<path d="${rr(266, 116, 228, 84, 24)}" fill="${c.secondary}"/>`,
      `<circle cx="380" cy="104" r="50" fill="${c.secondary}"/>`,
      `<circle cx="380" cy="104" r="20" fill="${c.primary}"/>`,
      row(300, 'check'),
      row(410, 'check'),
      row(520, 'dot'),
    ].join(''),
    halo: '',
  };
}

function dispatch(c) {
  const monitor = rr(-20, 170, 620, 372, 40);
  return {
    draw: [
      `<path d="${monitor}" fill="${c.primary}"/>`,
      `<path d="${rr(14, 204, 552, 304, 12)}" fill="${c.secondary}"/>`,
      `<path d="${rr(60, 240, 46, 232, 8)}" fill="${c.ink}"/>`,
      `<path d="${rr(140, 250, 380, 50, 10)}" fill="${c.primary}"/>`,
      `<path d="${rr(140, 331, 380, 50, 10)}" fill="${c.primary}"/>`,
      `<path d="${rr(140, 412, 380, 50, 10)}" fill="${c.primary}"/>`,
      `<path d="M252,540 H328 L340,604 H240 Z" fill="${c.primary}"/>`,
      `<path d="${rr(170, 596, 240, 40, 14)}" fill="${c.primary}"/>`,
    ].join(''),
    halo: `<path d="${monitor}" stroke-width="${HALO * 2}"/>`,
  };
}

function bigboard(c) {
  const knob = { x: 432, y: 228 };
  const arc = (r) => {
    const a0 = (-112 * Math.PI) / 180;
    const a1 = (-8 * Math.PI) / 180;
    return `M${knob.x + r * Math.cos(a0)},${knob.y + r * Math.sin(a0)} A${r},${r} 0 0 1 ${knob.x + r * Math.cos(a1)},${knob.y + r * Math.sin(a1)}`;
  };
  return {
    draw: [
      `<path d="M126,384 L${knob.x},${knob.y}" stroke="${c.ink}" stroke-width="30" stroke-linecap="round"/>`,
      `<circle cx="${knob.x}" cy="${knob.y}" r="30" fill="${c.ink}"/>`,
      `<path d="${arc(84)}" fill="none" stroke="${c.primary}" stroke-width="28" stroke-linecap="round"/>`,
      `<path d="${arc(146)}" fill="none" stroke="${c.ink}" stroke-width="28" stroke-linecap="round"/>`,
      `<path d="${rr(84, 360, 508, 290, 56)}" fill="${c.primary}"/>`,
      `<path d="${rr(146, 444, 150, 30, 15)}" fill="${c.speaker}"/>`,
      `<path d="${rr(146, 500, 150, 30, 15)}" fill="${c.speaker}"/>`,
      `<path d="${rr(146, 556, 150, 30, 15)}" fill="${c.speaker}"/>`,
      `<circle cx="458" cy="512" r="86" fill="${c.secondary}"/>`,
      `<circle cx="458" cy="512" r="36" fill="${c.primary}"/>`,
    ].join(''),
    halo: '',
  };
}

const GLYPHS = { responder, unit, ic, dispatch, bigboard };

/**
 * The mark for one variant in mark units (0..1000), as SVG markup. `id` keeps mask ids unique within a document.
 */
export function mark(variant, palette, id = variant) {
  const c = PALETTES[palette];
  const glyph = GLYPHS[variant](c);
  const inner = FRAME - STROKE;
  const innerRadius = RADIUS - STROKE;
  const framePath = `${roundedRect(0, 0, FRAME, FRAME, { tl: RADIUS })}${roundedRect(STROKE, STROKE, inner - STROKE, inner - STROKE, { tl: innerRadius })}`;
  const side = FRAME + GAP;
  const cell = (FRAME - GAP) / 2; // the right column and bottom row split the frame side in two
  const end = 1000 - side;
  const mask = glyph.halo
    ? `<mask id="${id}-cut" maskUnits="userSpaceOnUse" x="-400" y="-400" width="1800" height="1800"><rect x="-400" y="-400" width="1800" height="1800" fill="#fff"/><g fill="#000" stroke="#000" stroke-linejoin="round" stroke-linecap="round">${glyph.halo}</g></mask>`
    : '';
  return [
    mask,
    `<path d="${framePath}" fill-rule="evenodd" fill="${c.frame}"${glyph.halo ? ` mask="url(#${id}-cut)"` : ''}/>`,
    `<path d="${roundedRect(side, 0, end, cell, { tr: RADIUS })}" fill="${c.block}"/>`,
    `<path d="${roundedRect(side, cell + GAP, end, cell)}" fill="${c.frame}"/>`,
    `<path d="${roundedRect(0, side, cell, end, { bl: RADIUS })}" fill="${c.frame}"/>`,
    `<path d="${roundedRect(cell + GAP, side, cell, end)}" fill="${c.block}"/>`,
    `<path d="${roundedRect(side, side, end, end, { br: RADIUS })}" fill="${c.frame}"/>`,
    glyph.draw,
  ].join('');
}

/**
 * Long shadow cast by the mark's box toward the bottom right, in mark units: the box swept along (1, 1), minus the box
 * itself so the gaps between blocks keep the background colour.
 */
export function longShadow(id) {
  const k = RADIUS / Math.SQRT2;
  const p1 = [1000 - RADIUS + k, RADIUS - k];
  const p2 = [RADIUS - k, 1000 - RADIUS + k];
  const far = 3000;
  const points = [p1, [p1[0] + far, p1[1] + far], [p2[0] + far, p2[1] + far], p2].map(([x, y]) => `${x},${y}`).join(' ');
  return [
    `<linearGradient id="${id}-shadow" gradientUnits="userSpaceOnUse" x1="500" y1="500" x2="1500" y2="1500"><stop offset="0" stop-color="#0B2350" stop-opacity="0.34"/><stop offset="1" stop-color="#0B2350" stop-opacity="0"/></linearGradient>`,
    `<mask id="${id}-shadow-mask" maskUnits="userSpaceOnUse" x="-400" y="-400" width="5000" height="5000"><rect x="-400" y="-400" width="5000" height="5000" fill="#fff"/><path d="${roundedRect(0, 0, 1000, 1000, { tl: RADIUS, tr: RADIUS, br: RADIUS, bl: RADIUS })}" fill="#000"/></mask>`,
    `<polygon points="${points}" fill="url(#${id}-shadow)" mask="url(#${id}-shadow-mask)"/>`,
  ].join('');
}

/** Places mark-unit content centred in a canvas, `size` canvas units wide. */
export function place(content, { canvas, size, dx = 0, dy = 0 }) {
  const scale = size / 1000;
  const offset = (canvas - size) / 2;
  return `<g transform="translate(${offset + dx} ${offset + dy}) scale(${scale})">${content}</g>`;
}

export function gradientBackground(id, canvas, shape) {
  return [
    `<linearGradient id="${id}-bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${canvas}" y2="${canvas}"><stop offset="0" stop-color="${BRAND.gradientStart}"/><stop offset="0.27" stop-color="${BRAND.gradientStart}"/><stop offset="1" stop-color="${BRAND.gradientEnd}"/></linearGradient>`,
    shape ? shape(`url(#${id}-bg)`) : `<rect width="${canvas}" height="${canvas}" fill="url(#${id}-bg)"/>`,
  ].join('');
}

export function svg(canvas, body, viewBox = `0 0 ${canvas} ${canvas}`) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="${viewBox}">${body}</svg>`;
}

// ── Notification glyphs (Android status bar): white silhouettes on a 24 dp grid, details cut out. ──

const NOTIFICATION = {
  responder: {
    shape:
      '<circle cx="15.25" cy="7.25" r="3.5"/><path d="M8.75,20.5 v-2 a4.5,4.5 0 0 1 4.5,-4.5 h4 a4.5,4.5 0 0 1 4.5,4.5 v2 z"/><path d="M1.75,10.75 l2.5,2.5 l4.5,-4.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    cut: '',
  },
  unit: {
    shape: '<path d="M9.6,3 h4.8 l7.1,18 h-19 z" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>',
    cut: '<rect x="11.4" y="4.5" width="1.2" height="2.5" rx="0.6"/><rect x="11.2" y="9" width="1.6" height="3.5" rx="0.8"/><rect x="11" y="14.5" width="2" height="7" rx="1"/>',
  },
  ic: {
    shape: '<path d="M5.5,4.5 h3 a3.5,3.5 0 0 1 7,0 h3 a1.75,1.75 0 0 1 1.75,1.75 v14 a1.75,1.75 0 0 1 -1.75,1.75 h-13 a1.75,1.75 0 0 1 -1.75,-1.75 v-14 a1.75,1.75 0 0 1 1.75,-1.75 z"/>',
    cut: '<circle cx="12" cy="4.5" r="1.25"/><path d="M6.5,10 l1.4,1.4 l2.6,-2.6" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5,14.5 l1.4,1.4 l2.6,-2.6" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.25" cy="19" r="1.1"/><rect x="11.75" y="9.4" width="5.5" height="1.6" rx="0.8"/><rect x="11.75" y="13.9" width="5.5" height="1.6" rx="0.8"/><rect x="11.75" y="18.2" width="5.5" height="1.6" rx="0.8"/>',
  },
  dispatch: {
    shape: '<rect x="1.5" y="3.5" width="21" height="13.5" rx="1.75"/><path d="M10,17 h4 l0.6,2.5 h-5.2 z"/><rect x="6.5" y="19.25" width="11" height="1.75" rx="0.875"/>',
    cut: '<rect x="3.25" y="5.25" width="17.5" height="10" rx="0.5"/>',
    inner:
      '<rect x="4.75" y="6.5" width="1.75" height="7.5" rx="0.4"/><rect x="8" y="6.75" width="11" height="1.75" rx="0.5"/><rect x="8" y="9.75" width="11" height="1.75" rx="0.5"/><rect x="8" y="12.75" width="11" height="1.75" rx="0.5"/>',
  },
  bigboard: {
    shape:
      '<rect x="2" y="11" width="20" height="10.5" rx="2.25"/><path d="M3.5,11.5 L16.5,5.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="16.5" cy="5.5" r="1.4"/><path d="M18,1.9 a4,4 0 0 1 2.35,4.6" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>',
    cut: '<rect x="4.5" y="13.5" width="6" height="1.4" rx="0.7"/><rect x="4.5" y="15.6" width="6" height="1.4" rx="0.7"/><rect x="4.5" y="17.7" width="6" height="1.4" rx="0.7"/><circle cx="16.25" cy="16.25" r="3"/>',
    inner: '<circle cx="16.25" cy="16.25" r="1.1"/>',
  },
};

/** Android small notification icon: white on transparent, 24 dp art rendered at `size` px. */
export function notificationIcon(variant, size) {
  const { shape, cut, inner = '' } = NOTIFICATION[variant];
  const masked = cut
    ? `<mask id="n-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><g fill="#000">${cut}</g></mask><g fill="#fff" mask="url(#n-cut)">${shape}</g>`
    : `<g fill="#fff">${shape}</g>`;
  return svg(size, `${masked}<g fill="#fff">${inner}</g>`, '0 0 24 24');
}
