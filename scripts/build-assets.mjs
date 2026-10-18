// Builds the flat 2D SVG asset set into public/assets and writes manifest.json.
// Run: node scripts/build-assets.mjs
// Style: flat fills, one ink outline (--lw), fine details as fixed 2-unit strokes (.d), no gradients.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

const COLORS = {
  ink: '#2a2433', paper: '#fbf7ee', red: '#d9443b', yellow: '#f4c542', orange: '#e8863a',
  amber: '#c9742a', rust: '#b4602d', green: '#3f9d62', green2: '#2b7a4b', teal: '#2b7a78',
  blue: '#3b6fb6', navy: '#2f3d66', gold: '#e0a73a', steel: '#6b7886', steel2: '#3d4752',
  card: '#b99870', skin1: '#e0a87c', skin2: '#c98a5c', skin3: '#b97a4e', glass: '#e6f1f4',
  fry: '#dc9c3c', fry2: '#e6ac4d', egg: '#f1dcc0', coffee: '#6b4226', tea: '#7a3419',
  water: '#9fd3ea', bread: '#d9a45b', bread2: '#e8bd7c', purple: '#7b4fa0', pink: '#e86b8a',
  wall: '#b9d1c5', wood: '#a8794f', wood2: '#8a5f3a', gray: '#9aa3ab', silver: '#cfd5da', raw: '#f2b8a2', tofu: '#f3e2a8', tempe: '#d8c48f', shallot: '#a24b78', oil: '#e8b923',
};

const CSS =
  ':root{' + Object.entries(COLORS).map(([k, v]) => `--${k}:${v}`).join(';') + ';--shade:rgba(42,36,51,.16);--lw:2.5}' +
  '.a *{stroke:var(--ink);stroke-width:calc(var(--lw)*var(--k,1)*1px);stroke-linejoin:round;stroke-linecap:round}' +
  '.a .n{stroke:none}.a .d{fill:none;stroke-width:calc(2px*var(--k,1))}' +
  '.a text{stroke:none;font-family:"DM Sans",system-ui,sans-serif;font-weight:700}' +
  Object.keys(COLORS).map((k) => `.c-${k}{fill:var(--${k})}`).join('') +
  '.c-shade{fill:var(--shade)}.o5{opacity:.5}.o3{opacity:.3}.a .s-paper{stroke:var(--paper)}';

const SH = '<ellipse class="n c-shade" cx="48" cy="87" rx="30" ry="4"/>';
const assets = [];
const add = (category, id, name, body, viewBox = '0 0 96 96') => assets.push({ category, id, name, body, viewBox });

/* ---------- Barang ---------- */
const crimp = (y, cls) =>
  `<rect class="${cls}" x="14" y="${y}" width="68" height="10" rx="2"/><path class="d" d="${[21, 29, 37, 45, 53, 61, 69].map((x) => `M${x} ${y + 1}v8`).join('')}"/>`;
const pack = (main, label) =>
  SH + crimp(14, main) + `<rect class="${main}" x="16" y="22" width="64" height="54"/>` + crimp(74, main) + label;

add('barang', 'indomie-goreng', 'Indomie goreng', pack('c-red',
  '<circle class="c-yellow" cx="48" cy="49" r="18"/><path class="c-paper" d="M35 52h26a13 13 0 0 1-26 0z"/><path class="d" d="M37 46q5-7 11 0t11 0"/>'));
add('barang', 'indomie-kuah', 'Indomie kuah', pack('c-orange',
  '<circle class="c-paper" cx="48" cy="49" r="18"/><path class="c-red" d="M35 50h26a13 13 0 0 1-26 0z"/><path class="d" d="M38 45q5-7 10 0t10 0"/><path class="d o5" d="M42 37q-3-4 0-8M54 37q-3-4 0-8"/>'));
add('barang', 'keripik', 'Keripik', pack('c-yellow',
  '<path class="c-red" d="M48 32l5.5 11 12 1.5-8.5 8.5 2.5 12L48 59l-11.5 6 2.5-12-8.5-8.5 12-1.5z"/>'));

add('barang', 'es-teh', 'Es teh', SH +
  '<path class="c-glass" d="M30 18h36l-4 62q0 5-5 5H39q-5 0-5-5z"/>' +
  '<path class="c-amber" d="M32.6 38h30.8l-1.4 42q0 5-5 5H39q-5 0-5-5z"/>' +
  '<rect class="c-paper" x="38" y="43" width="11" height="11" rx="2" transform="rotate(-12 43 48)"/><rect class="c-paper" x="50" y="56" width="11" height="11" rx="2" transform="rotate(10 55 61)"/>' +
  '<rect class="c-red" x="56" y="6" width="6" height="44" rx="3" transform="rotate(14 59 28)"/>');

add('barang', 'kopi-hitam', 'Kopi hitam', SH +
  '<path class="d o5" d="M40 32q-4-6 0-11t0-11M54 32q-4-6 0-11t0-11"/>' +
  '<ellipse class="c-paper" cx="48" cy="74" rx="32" ry="9"/>' +
  '<path class="d" d="M70 46q14 0 12 10-2 8-14 8"/>' +
  '<path class="c-paper" d="M26 40h44v14q0 18-22 18T26 54z"/><ellipse class="c-coffee" cx="48" cy="40" rx="22" ry="5"/>');

const sachet = (x, y, rot, cls) =>
  `<g transform="translate(${x} ${y}) rotate(${rot})"><rect class="${cls}" x="-13" y="-29" width="26" height="58" rx="2"/>` +
  '<path class="d s-paper o5" d="M-13-24l3.25 3 3.25-3 3.25 3 3.25-3 3.25 3 3.25-3 3.25 3M-13 24l3.25 3 3.25-3 3.25 3 3.25-3 3.25 3 3.25-3 3.25 3"/>' +
  '<ellipse class="c-paper" cx="0" cy="0" rx="6" ry="9" transform="rotate(30)"/><path class="d" d="M-3-6q6 6 0 12"/></g>';
add('barang', 'kopi-sachet', 'Kopi sachet', SH + sachet(36, 52, -10, 'c-coffee') + sachet(62, 50, 8, 'c-rust'));

const bottle = (liquid, cap, label) =>
  SH + '<path class="c-glass" d="M42 12h12v14q11 4 11 15v38q0 6-6 6H37q-6 0-6-6V41q0-11 11-15z"/>' +
  `<path class="n ${liquid}" d="M32 44q0-12 10-16h12q10 4 10 16v35q0 6-6 6H38q-6 0-6-6z"/>` +
  `<rect class="${cap}" x="41" y="6" width="14" height="8" rx="2"/>` + label;
add('barang', 'teh-botol', 'Teh botol', bottle('c-tea', 'c-red',
  '<rect class="c-paper" x="32" y="52" width="32" height="22"/><rect class="c-red" x="32" y="52" width="32" height="7"/><path class="d" d="M38 66h20"/>'));
add('barang', 'air-mineral', 'Air mineral', bottle('c-water', 'c-blue',
  '<rect class="c-blue" x="32" y="52" width="32" height="22"/><path class="d s-paper" d="M37 63q3-4 6 0t6 0 6 0"/>'));

add('barang', 'kerupuk', 'Kerupuk', SH +
  '<rect class="c-glass" x="20" y="22" width="56" height="58" rx="10"/>' +
  '<ellipse class="c-fry2" cx="36" cy="44" rx="11" ry="7" transform="rotate(-20 36 44)"/><ellipse class="c-fry2" cx="58" cy="40" rx="11" ry="7" transform="rotate(15 58 40)"/>' +
  '<ellipse class="c-fry2" cx="46" cy="57" rx="12" ry="7" transform="rotate(5 46 57)"/><ellipse class="c-fry2" cx="62" cy="68" rx="10" ry="6" transform="rotate(-10 62 68)"/><ellipse class="c-fry2" cx="34" cy="70" rx="9" ry="6"/>' +
  '<rect class="c-red" x="18" y="12" width="60" height="12" rx="5"/>');

add('barang', 'nasi-bungkus', 'Nasi bungkus', SH +
  '<path class="c-card" d="M12 80L28 42Q48 28 68 42L84 80z"/><path class="d" d="M28 42L48 80M68 42L48 80M24 62Q48 70 72 62"/>' +
  '<path class="c-paper" d="M37 44Q48 34 59 44Q48 40 37 44z"/>');

add('barang', 'roti', 'Roti', SH +
  '<rect class="c-bread" x="12" y="34" width="72" height="42" rx="19"/><path class="n c-bread2" d="M24 40h48a9 9 0 0 1 0 8H24a9 9 0 0 1 0-8z"/>' +
  '<path class="d" d="M32 52v18M48 52v18M64 52v18"/><rect class="c-red" x="76" y="50" width="10" height="14" rx="2"/>');

const candy = (x, y, rot, cls) =>
  `<g transform="translate(${x} ${y}) rotate(${rot})"><path class="${cls}" d="M-11 0l-10-8v16zM11 0l10-8v16z"/><ellipse class="${cls}" rx="12" ry="9"/><ellipse class="n c-paper o5" cx="-3" cy="-3" rx="5" ry="2.5"/></g>`;
add('barang', 'permen', 'Permen', SH + candy(32, 32, -15, 'c-red') + candy(62, 42, 20, 'c-green') + candy(42, 68, 5, 'c-orange'));

const drop = '<path class="n c-paper" d="M0-7q7 9 0 14-7-5 0-14z"/>';
const sac = (x, cls) =>
  `<rect class="${cls}" x="${x}" y="28" width="24" height="44" rx="2"/><g transform="translate(${x + 12} 50)">${drop}</g>`;
add('barang', 'sampo-sachet', 'Sampo sachet', SH +
  '<path class="d" d="M20 8q28-4 56 0"/><rect class="c-paper" x="8" y="18" width="80" height="10" rx="3"/>' +
  `<circle class="d" cx="20" cy="23" r="1.5"/><circle class="d" cx="48" cy="23" r="1.5"/><circle class="d" cx="76" cy="23" r="1.5"/>` +
  sac(10, 'c-blue') + sac(36, 'c-pink') + sac(62, 'c-green'));

add('barang', 'gorengan', 'Gorengan',
  '<ellipse class="c-paper" cx="48" cy="74" rx="38" ry="12"/>' +
  '<ellipse class="c-fry2" cx="46" cy="46" rx="22" ry="9" transform="rotate(-14 46 46)"/>' +
  '<path class="c-fry" d="M18 66q-4-14 10-17 14-3 18 8 3 11-8 14-14 3-20-5z"/><circle class="n c-amber" cx="26" cy="58" r="2.4"/><circle class="n c-amber" cx="36" cy="64" r="2.4"/><circle class="n c-amber" cx="33" cy="54" r="2"/>' +
  '<path class="c-fry" d="M52 62q-2-14 12-16 14-1 16 10 1 11-10 13-14 2-18-7z"/><circle class="n c-amber" cx="62" cy="54" r="2.4"/><circle class="n c-amber" cx="70" cy="62" r="2.4"/><circle class="n c-amber" cx="58" cy="63" r="2"/>' +
  '<path class="c-green" d="M68 30q12-6 18 6-9-3-18-6z"/>');

add('barang', 'rokok', 'Rokok', SH +
  '<rect class="c-paper" x="35" y="10" width="7" height="18" rx="1.5"/><rect class="c-orange" x="35" y="10" width="7" height="5" rx="1.5"/>' +
  '<rect class="c-paper" x="46" y="14" width="7" height="14" rx="1.5"/><rect class="c-orange" x="46" y="14" width="7" height="5" rx="1.5"/>' +
  '<rect class="c-navy" x="26" y="26" width="44" height="58" rx="4"/><rect class="c-blue" x="26" y="26" width="44" height="14" rx="4"/>' +
  '<rect class="c-paper" x="26" y="52" width="44" height="16"/><text x="48" y="64.5" text-anchor="middle" font-size="12" class="c-ink">18+</text>');

/* Frozen goods: sold from the freezer. */
const frost = '<path class="d s-paper o5" d="M70 18v10M65 23h10M67 20l6 6M73 20l-6 6"/>';
add('barang', 'es-krim', 'Es krim stik', SH +
  '<rect class="c-wood" x="44" y="56" width="8" height="26" rx="3"/>' +
  '<path class="c-pink" d="M28 58V34q0-18 20-18t20 18v24z"/><path class="n c-paper o5" d="M34 34q0-10 8-12" />' +
  '<path class="c-coffee" d="M28 44q6 6 10 0t10 0 10 0 10 0v14H28z"/>' + frost);
add('barang', 'nugget', 'Nugget ayam', SH +
  '<rect class="c-blue" x="18" y="18" width="60" height="62" rx="5"/><rect class="c-yellow" x="18" y="18" width="60" height="12" rx="5"/>' +
  '<path class="c-fry" d="M30 44q-4-8 6-10 10-2 12 6 2 8-6 10-9 2-12-6z"/><path class="c-fry2" d="M50 52q-2-9 8-10 9 0 10 8 0 9-9 10-8 1-9-8z"/>' +
  '<path class="c-fry" d="M32 66q0-6 8-6t8 6-8 6-8-6z"/>' + frost);
add('barang', 'sosis', 'Sosis', SH +
  '<rect class="c-red" x="16" y="18" width="64" height="62" rx="5"/><rect class="c-paper" x="16" y="18" width="64" height="12" rx="5"/>' +
  '<rect class="c-rust" x="24" y="38" width="48" height="10" rx="5"/><rect class="c-rust" x="22" y="52" width="48" height="10" rx="5" transform="rotate(-4 46 57)"/>' +
  '<rect class="c-rust" x="26" y="66" width="46" height="9" rx="4.5"/>' + frost);
add('barang', 'bakso-beku', 'Bakso beku', SH +
  '<rect class="c-glass" x="16" y="18" width="64" height="62" rx="8"/><rect class="c-teal" x="16" y="18" width="64" height="12" rx="6"/>' +
  '<circle class="c-silver" cx="35" cy="46" r="10"/><circle class="c-silver" cx="58" cy="44" r="10"/><circle class="c-silver" cx="46" cy="64" r="10"/>' +
  '<path class="d o5" d="M31 43q3-3 6 0M54 41q3-3 6 0M42 61q3-3 6 0"/>' + frost);
add('barang', 'dimsum', 'Dimsum', SH +
  '<rect class="c-tofu" x="14" y="52" width="68" height="28" rx="6"/><rect class="c-red" x="14" y="18" width="68" height="12" rx="5"/>' +
  '<path class="c-paper" d="M22 56q4-18 14-18t14 18z"/><path class="c-paper" d="M46 56q4-18 14-18t14 18z"/>' +
  '<path class="d" d="M27 54q3-8 6 0M51 54q3-8 6 0M63 54q3-8 6 0"/>' + frost);

const egg = (x, y) =>
  `<g transform="translate(${x} ${y})"><path class="c-egg" d="M0-16C9-16 13-2 13 6c0 8-6 13-13 13S-13 14-13 6C-13-2-9-16 0-16z"/><ellipse class="n c-paper" cx="-4" cy="-3" rx="2.5" ry="5" transform="rotate(14 -4 -3)"/></g>`;
add('barang', 'telur', 'Telur', SH + egg(26, 50) + egg(48, 46) + egg(70, 50) +
  '<rect class="c-card" x="10" y="58" width="76" height="22" rx="7"/><path class="d" d="M34 60v18M62 60v18"/>');

add('barang', 'kantong-plastik', 'Kantong plastik', SH +
  '<path class="d" d="M34 34Q34 14 48 14T62 34"/><path class="c-glass" d="M24 34h48l6 50H18z"/>' +
  '<rect class="c-red" x="30" y="46" width="18" height="14" rx="2"/><rect class="c-yellow" x="48" y="52" width="16" height="12" rx="2"/><path class="n c-paper" d="M27 40h5l-2 36h-4z"/>');

add('barang', 'laci-uang', 'Laci uang',
  '<rect class="c-red" x="15" y="32" width="22" height="13" rx="1.5" transform="rotate(-7 26 38)"/><circle class="n c-paper o5" cx="26" cy="38" r="3.5"/>' +
  '<rect class="c-blue" x="38" y="30" width="22" height="13" rx="1.5" transform="rotate(4 49 36)"/><circle class="n c-paper o5" cx="49" cy="36" r="3.5"/>' +
  '<rect class="c-steel" x="8" y="40" width="80" height="42" rx="6"/><rect class="c-steel2" x="12" y="43" width="72" height="20" rx="3"/>' +
  '<path class="d s-paper o3" d="M36 44v18M60 44v18"/>' +
  '<circle class="c-gold" cx="68" cy="55" r="5.5"/><circle class="c-gold" cx="78" cy="57" r="5.5"/><circle class="c-gold" cx="72" cy="50" r="4.5"/>' +
  '<rect class="c-steel" x="8" y="62" width="80" height="20" rx="6"/><rect class="c-paper" x="38" y="69" width="20" height="5" rx="2.5"/>');

add('barang', 'buku-kasbon', 'Buku kasbon', SH +
  '<rect class="c-teal" x="20" y="12" width="58" height="72" rx="5"/>' +
  '<rect class="c-paper" x="32" y="22" width="40" height="18" rx="2"/><path class="d" d="M38 29h28M38 35h18"/>' +
  '<path class="d s-paper" d="M36 52v16M43 52v16M50 52v16M57 52v16M33 66l27-12"/>' +
  '<circle class="c-paper" cx="20" cy="26" r="3.5"/><circle class="c-paper" cx="20" cy="40" r="3.5"/><circle class="c-paper" cx="20" cy="54" r="3.5"/><circle class="c-paper" cx="20" cy="68" r="3.5"/>' +
  '<g transform="rotate(16 80 58)"><rect class="c-yellow" x="76.5" y="34" width="7" height="38" rx="1.5"/><path class="c-paper" d="M76.5 72h7L80 80z"/></g>');

/* ---------- Uang ---------- */
const notes = [['100000', '100.000', '#d9443b', 'p'], ['50000', '50.000', '#3b6fb6', 'p'], ['20000', '20.000', '#3f9d62', 'p'], ['10000', '10.000', '#7b4fa0', 'p'],
  ['5000', '5.000', '#a6693a', 'p'], ['2000', '2.000', '#8b949c', 'i'], ['1000', '1.000', '#e3b52f', 'i']];
for (const [id, label, fill, tone] of notes) {
  const t = tone === 'i' ? 'var(--ink)' : 'var(--paper)';
  add('uang', `uang-${id}`, `Rp${label}`,
    `<rect x="4" y="8" width="104" height="44" rx="4" style="fill:${fill}"/><rect class="d o5" x="10" y="14" width="92" height="32" rx="2" style="stroke:${t}"/>` +
    `<circle class="n o5" cx="32" cy="30" r="10" style="fill:${t}"/><text x="76" y="35" text-anchor="middle" font-size="12" style="fill:${t}">${label}</text>`, '0 0 112 60');
}
// Coins carry their value so they are easy to tell apart at small sizes.
for (const [id, label, r, bi, fs] of [['1000', '1.000', 18, true, 8.5], ['500', '500', 16, false, 12], ['200', '200', 14, false, 11], ['100', '100', 12, false, 9.5]]) {
  const num = id;
  add('uang', `koin-${id}`, `Koin Rp${label}`,
    `<circle cx="20" cy="20" r="${r}" style="fill:${bi ? 'var(--gold)' : '#cfd5da'}"/>` +
    (bi ? `<circle cx="20" cy="20" r="${r - 4.5}" style="fill:#cfd5da"/>` : `<circle class="d o3" cx="20" cy="20" r="${r - 2.5}"/>`) +
    `<text x="20" y="${(20 + fs * 0.36).toFixed(1)}" text-anchor="middle" font-size="${fs}" class="c-ink">${num}</text>`, '0 0 40 40');
}

/* ---------- Pelanggan ---------- */
const FACES = {
  happy: '<path class="d" d="M40 49Q48 58 56 49"/><circle class="n c-red o3" cx="35" cy="47" r="3.5"/><circle class="n c-red o3" cx="61" cy="47" r="3.5"/>',
  neutral: '<path class="d" d="M43 52H53"/>',
  annoyed: '<path class="d" d="M35 33L45 37M61 33L51 37"/><path class="d" d="M41 54Q48 48 55 54"/><circle class="n c-red o3" cx="35" cy="47" r="3.5"/><circle class="n c-red o3" cx="61" cy="47" r="3.5"/>',
};
const HAIR = '<path class="c-ink" d="M28 40Q26 16 48 16Q70 16 68 40Q62 28 48 28Q34 28 28 40z"/>';
const TYPES = {
  pelajar: { name: 'Pelajar', skin: 'c-skin1', torso:
    '<path class="c-paper" d="M24 112V84Q24 66 48 66Q72 66 72 84V112Z"/><path class="c-blue" d="M40 66l8 10 8-10z"/><rect class="c-navy" x="31" y="72" width="6" height="40" rx="3"/><rect class="c-navy" x="59" y="72" width="6" height="40" rx="3"/>', gear: HAIR },
  ojol: { name: 'Driver ojol', skin: 'c-skin2', torso:
    '<path class="c-green" d="M22 112V84Q22 66 48 66Q74 66 74 84V112Z"/><rect class="n c-paper" x="22" y="96" width="52" height="5"/><path class="d" d="M48 74v38"/>', gear:
    '<path class="c-green2" d="M27 31Q27 12 48 12Q69 12 69 31Z"/><rect class="c-ink" x="26" y="28" width="44" height="5" rx="2.5"/><path class="d s-paper o5" d="M36 20q4-4 10-5"/>' },
  langganan: { name: 'Langganan', skin: 'c-skin3', torso:
    '<path class="c-rust" d="M22 112V84Q22 66 48 66Q74 66 74 84V112Z"/>' + [[34, 84], [60, 86], [46, 98], [62, 104], [32, 104]].map(([x, y]) => `<circle class="n c-gold" cx="${x}" cy="${y}" r="2.5"/>`).join(''),
    gear: '<path class="c-ink" d="M30 29Q30 12 48 12Q66 12 66 29V30H30z"/><path class="c-ink" d="M40 46Q48 42 56 46Q48 49 40 46z" style="stroke-width:1.5"/>' },
  'uang-besar': { name: 'Bayar uang besar', skin: 'c-skin1', torso:
    '<path class="c-navy" d="M22 112V84Q22 66 48 66Q74 66 74 84V112Z"/><path class="c-blue" d="M40 66l8 10 8-10z"/>' +
    '<g transform="rotate(-12 70 92)"><rect class="c-red" x="52" y="82" width="34" height="18" rx="2"/><circle class="n c-paper o5" cx="62" cy="91" r="5"/><path class="d s-paper o5" d="M72 87h10M72 93h10"/></g>',
    gear: HAIR + '<circle class="d" cx="41" cy="40" r="6.5"/><circle class="d" cx="55" cy="40" r="6.5"/><path class="d" d="M47.5 40h1"/>' },
  ibu: { name: 'Ibu', skin: 'c-skin1', ears: false, torso: '<path class="c-purple" d="M22 112V84Q22 66 48 66Q74 66 74 84V112Z"/>',
    behind: '<path class="c-teal" d="M25 46Q23 12 48 12Q73 12 71 46Q71 64 62 70H34Q25 64 25 46z"/>',
    gear: '<path class="c-teal" d="M30 36Q48 8 66 36Q48 26 30 36z"/>' },
  anak: { name: 'Anak', skin: 'c-skin1', torso:
    '<path class="c-yellow" d="M24 112V84Q24 66 48 66Q72 66 72 84V112Z"/>', gear: HAIR },
};
const person = (t, mood, tf, k) =>
  `<g transform="${tf}" style="--k:${k}">${t.torso}${t.behind || ''}` +
  (t.behind ? '' : `<rect class="${t.skin}" x="42" y="54" width="12" height="16" rx="4"/>`) +
  (t.ears === false ? '' : `<circle class="${t.skin}" cx="29" cy="42" r="4.5"/><circle class="${t.skin}" cx="67" cy="42" r="4.5"/>`) +
  `<circle class="${t.skin}" cx="48" cy="40" r="19"/>${t.gear}` +
  `<circle class="n c-ink" cx="41" cy="40" r="2.3"/><circle class="n c-ink" cx="55" cy="40" r="2.3"/>${FACES[mood]}</g>`;
for (const mood of ['happy', 'neutral', 'annoyed']) {
  for (const id of ['pelajar', 'ojol', 'langganan', 'uang-besar']) {
    add('pelanggan', `${id}-${mood}`, `${TYPES[id].name} (${mood})`,
      '<ellipse class="n c-shade" cx="48" cy="113" rx="26" ry="4"/>' + person(TYPES[id], mood, '', 1), '0 0 96 120');
  }
  add('pelanggan', `keluarga-${mood}`, `Keluarga (${mood})`,
    '<ellipse class="n c-shade" cx="60" cy="113" rx="42" ry="4"/>' +
    person(TYPES.ibu, mood, `translate(0 ${113 * 0.1}) scale(.9)`, 1 / 0.9) +
    person(TYPES.anak, mood === 'annoyed' ? 'neutral' : 'happy', `translate(60 ${113 * 0.38}) scale(.62)`, 1 / 0.62), '0 0 120 120');
}

/* ---------- UI ---------- */
const finder = (x, y) =>
  `<rect class="n c-ink" x="${x}" y="${y}" width="10" height="10"/><rect class="n c-paper" x="${x + 2}" y="${y + 2}" width="6" height="6"/><rect class="n c-ink" x="${x + 4}" y="${y + 4}" width="2" height="2"/>`;
add('ui', 'qris-stand', 'Stand QRIS',
  SH + '<rect class="c-steel" x="20" y="76" width="56" height="8" rx="3"/><rect class="c-paper" x="24" y="10" width="48" height="68" rx="5"/><rect class="c-red" x="24" y="10" width="48" height="14" rx="5"/>' +
  '<text x="48" y="21" text-anchor="middle" font-size="10" class="c-paper">QRIS</text>' + finder(32, 30) + finder(54, 30) + finder(32, 52) +
  [[46, 32], [46, 38], [50, 44], [42, 46], [56, 46], [48, 52], [54, 54], [60, 58], [44, 58], [36, 44]].map(([x, y]) => `<rect class="n c-ink" x="${x}" y="${y}" width="3" height="3"/>`).join(''));
add('ui', 'ponsel', 'Ponsel',
  SH + '<rect class="c-navy" x="28" y="8" width="40" height="80" rx="8"/><rect class="c-paper" x="32" y="16" width="32" height="64" rx="3"/><path class="d s-paper" d="M44 12h8"/>' +
  '<rect class="c-green" x="35" y="24" width="24" height="10" rx="3"/><rect class="c-blue" x="38" y="40" width="22" height="10" rx="3"/><path class="d" d="M36 60h22M36 67h14"/><circle class="c-red" cx="66" cy="14" r="5"/>');
add('ui', 'kalkulator', 'Kalkulator',
  SH + '<rect class="c-teal" x="24" y="8" width="48" height="76" rx="6"/><rect class="c-paper" x="30" y="14" width="36" height="14" rx="2"/><text x="63" y="25" text-anchor="end" font-size="10" class="c-ink">12.500</text>' +
  [0, 1, 2].flatMap((j) => [0, 1, 2].map((i) => `<rect class="${i === 2 ? 'c-orange' : 'c-paper'}" x="${30 + i * 13}" y="${36 + j * 12}" width="10" height="8" rx="2"/>`)).join('') +
  '<rect class="c-paper" x="30" y="72" width="23" height="8" rx="2"/><rect class="c-orange" x="56" y="72" width="10" height="8" rx="2"/>');
const sign = (cls, txt, size) =>
  '<path class="d" d="M30 6L36 22M66 6L60 22"/>' + `<rect class="${cls}" x="12" y="22" width="72" height="36" rx="5"/><rect class="d s-paper o5" x="17" y="27" width="62" height="26" rx="3"/>` +
  `<text x="48" y="46" text-anchor="middle" font-size="${size}" class="c-paper">${txt}</text>`;
add('ui', 'tanda-buka', 'Tanda buka', sign('c-green', 'BUKA', 17));
add('ui', 'tanda-tutup', 'Tanda tutup', sign('c-red', 'TUTUP', 15));
add('ui', 'tanda-habis', 'Tanda habis', '<rect class="c-ink" x="10" y="32" width="76" height="30" rx="6"/><text x="48" y="53" text-anchor="middle" font-size="18" class="c-yellow">HABIS</text>');
add('ui', 'ikon-bintang', 'Ikon reputasi', '<path class="c-yellow" d="M48 10L58.5 35 85 37 65 54 71.500 80 48 66 24.500 80 31 54 11 37 37.500 35z"/>');
add('ui', 'ikon-energi', 'Ikon energi', '<path class="c-yellow" d="M56 8L24 54H44L38 88L72 40H52z"/>');
add('ui', 'ikon-jam', 'Ikon jam',
  '<circle class="c-blue" cx="48" cy="48" r="38"/><circle class="c-paper" cx="48" cy="48" r="31"/><path class="d" d="M48 22v6M48 68v6M22 48h6M68 48h6M48 48V30M48 48L63 56"/><circle class="n c-ink" cx="48" cy="48" r="3"/>');
add('ui', 'ikon-koin', 'Ikon uang',
  [66, 50, 34].map((y) => `<path class="c-gold" d="M22 ${y}v10a26 9 0 0 0 52 0V${y}z"/><ellipse class="c-gold" cx="48" cy="${y}" rx="26" ry="9"/><ellipse class="d o5" cx="48" cy="${y}" rx="16" ry="5"/>`).join(''));

/* ---------- Layar ---------- */
{
  const stripes = Array.from({ length: 8 }, (_, i) => `<path class="${i % 2 ? 'c-paper' : 'c-red'}" d="M${i * 45} 0h45v26a22.500 10 0 0 1-45 0z"/>`).join('');
  const box = (x, base, w, h, cls) => `<rect class="${cls}" x="${x}" y="${base - h}" width="${w}" height="${h}" rx="2"/>`;
  const shelf1 = box(34, 100, 22, 30, 'c-red') + box(58, 100, 22, 30, 'c-orange') + box(84, 100, 26, 34, 'c-yellow') + box(114, 100, 16, 34, 'c-tea') + box(134, 100, 16, 34, 'c-tea') + box(154, 100, 16, 34, 'c-water') +
    box(190, 100, 18, 26, 'c-coffee') + box(210, 100, 18, 26, 'c-rust') + box(244, 100, 26, 30, 'c-navy') + box(272, 100, 26, 30, 'c-navy') + box(300, 100, 22, 22, 'c-pink');
  const shelf2 = box(34, 142, 34, 30, 'c-glass') + '<rect class="c-red" x="32" y="110" width="38" height="8" rx="3"/>' +
    box(80, 142, 40, 18, 'c-card') + box(130, 142, 20, 28, 'c-blue') + box(154, 142, 20, 28, 'c-green') + box(190, 142, 36, 22, 'c-bread') + box(240, 142, 28, 30, 'c-teal') + box(274, 142, 28, 24, 'c-purple');
  add('ui', 'warung-depan', 'Warung (latar)',
    '<rect class="c-wall" x="0" y="0" width="360" height="164"/>' + stripes +
    '<rect class="c-wood" x="22" y="100" width="316" height="8" rx="2"/><rect class="c-wood" x="22" y="142" width="316" height="8" rx="2"/>' + shelf1 + shelf2 +
    '<rect class="c-yellow" x="130" y="40" width="100" height="22" rx="4"/><text x="180" y="56" text-anchor="middle" font-size="14" class="c-ink">WARUNG</text>' +
    '<rect class="c-wood" x="0" y="160" width="360" height="14"/><rect class="c-wood2" x="0" y="174" width="360" height="46"/><path class="d o3" d="M60 176v42M120 176v42M180 176v42M240 176v42M300 176v42"/>',
    '0 0 360 220');
}

/* ---------- Ponsel ---------- */
{
  // frame: the screen is cut out so HTML can sit behind it
  const outer = 'M30 4h140a26 26 0 0 1 26 26v340a26 26 0 0 1-26 26H30A26 26 0 0 1 4 370V30A26 26 0 0 1 30 4z';
  const hole = 'M32 14h136a18 18 0 0 1 18 18v336a18 18 0 0 1-18 18H32a18 18 0 0 1-18-18V32a18 18 0 0 1 18-18z';
  add('ponsel', 'ponsel-bingkai', 'Bingkai ponsel',
    `<rect class="c-navy" x="195" y="100" width="5" height="44" rx="2"/><path class="c-navy" fill-rule="evenodd" d="${outer}${hole}"/>` +
    '<rect class="c-ink" x="82" y="19" width="36" height="7" rx="3.5"/><circle class="c-steel2" cx="132" cy="22.500" r="4"/>', '0 0 204 400');
  add('ponsel', 'ponsel-layar-mati', 'Ponsel mati',
    `<rect class="c-navy" x="195" y="100" width="5" height="44" rx="2"/><path class="c-navy" d="${outer}"/><path class="c-ink" d="${hole}"/>` +
    '<rect class="c-ink" x="82" y="19" width="36" height="7" rx="3.5" style="stroke:var(--navy)"/>' +
    '<rect class="c-ink" x="72" y="184" width="50" height="26" rx="5" style="stroke:var(--red)"/><rect class="c-red" x="122" y="192" width="5" height="10" rx="1.500" style="stroke:none"/>' +
    '<rect class="n c-red" x="76" y="188" width="8" height="18" rx="2"/>', '0 0 204 400');

  // status bar glyphs (32 grid, thin outline)
  const st = (id, name, body) => add('ponsel', id, name, `<g style="--k:.6">${body}</g>`, '0 0 32 32');
  for (let n = 0; n <= 4; n++) {
    st(`sinyal-${n}`, `Sinyal ${n}`,
      [0, 1, 2, 3].map((i) => `<rect class="${i < n ? 'c-ink' : 'c-silver'}" x="${3 + i * 7}" y="${22 - (6 * i + 4)}" width="5" height="${6 * i + 4 + 6}" rx="1"/>`).join('') +
      (n === 0 ? '<path class="d" d="M20 4l8 8M28 4l-8 8" style="stroke:var(--red);stroke-width:3"/>' : ''));
  }
  const batt = (id, name, w, cls, extra = '') =>
    st(id, name, `<rect class="c-paper" x="2" y="9" width="24" height="14" rx="3"/><rect class="c-paper" x="26" y="13" width="3" height="6" rx="1"/>` +
      (w ? `<rect class="n ${cls}" x="4.500" y="11.500" width="${w}" height="9" rx="1.500"/>` : '') + extra);
  batt('baterai-penuh', 'Baterai penuh', 19, 'c-green');
  batt('baterai-sedang', 'Baterai sedang', 12, 'c-yellow');
  batt('baterai-rendah', 'Baterai rendah', 5, 'c-red');
  batt('baterai-kosong', 'Baterai kosong', 0, 'c-red', '<path class="d" d="M8 12l12 8M20 12L8 20" style="stroke:var(--red);stroke-width:2.500"/>');
  batt('baterai-cas', 'Baterai mengisi', 14, 'c-green', '<path class="n c-yellow" d="M16 6l-6 10h5l-2 8 8-12h-5z" style="stroke:var(--ink);stroke-width:1"/>');
  st('data-on', 'Data aktif', '<path class="d" d="M10 26V8M5 13l5-5 5 5M22 6v18M17 19l5 5 5-5"/>');
  st('data-off', 'Data habis', '<path class="d o5" d="M10 26V8M5 13l5-5 5 5M22 6v18M17 19l5 5 5-5"/><path class="d" d="M4 28L28 4" style="stroke:var(--red);stroke-width:3.500"/>');

  // app icons
  const app = (id, name, bg, body) => add('ponsel', `ikon-app-${id}`, name, `<rect class="${bg}" x="6" y="6" width="84" height="84" rx="20"/>${body}`);
  app('chat', 'Aplikasi chat', 'c-green',
    '<path class="c-paper" d="M24 26h48a10 10 0 0 1 10 10v16a10 10 0 0 1-10 10H46L32 74V62h-8a10 10 0 0 1-10-10V36a10 10 0 0 1 10-10z" transform="translate(-2 0)"/>' +
    '<circle class="n c-ink" cx="34" cy="44" r="3"/><circle class="n c-ink" cx="46" cy="44" r="3"/><circle class="n c-ink" cx="58" cy="44" r="3"/>');
  app('bank', 'Aplikasi bank', 'c-blue',
    '<rect class="c-paper" x="18" y="28" width="60" height="40" rx="6"/><rect class="n c-navy" x="18" y="37" width="60" height="9"/><rect class="c-gold" x="26" y="52" width="14" height="10" rx="2.500"/><path class="d" d="M52 58h18"/>');
  app('ojol', 'Aplikasi ojol', 'c-green2',
    '<circle class="c-paper" cx="30" cy="64" r="9"/><circle class="c-paper" cx="68" cy="64" r="9"/><path class="c-paper" d="M30 64L40 44h14l10 12 4 8H30z"/>' +
    '<path class="d s-paper" d="M58 44l5-9M60 35h8"/><rect class="c-yellow" x="22" y="40" width="16" height="12" rx="2"/>');
  app('pasar', 'Aplikasi pasar', 'c-red',
    '<circle class="c-green" cx="36" cy="40" r="8"/><circle class="c-yellow" cx="52" cy="36" r="9"/><circle class="c-orange" cx="64" cy="42" r="7"/>' +
    '<path class="c-paper" d="M20 46h56l-6 28H26z"/><path class="d" d="M36 52l2 16M48 52v16M60 52l-2 16"/>');
  app('jadwal', 'Aplikasi jadwal', 'c-purple',
    '<rect class="c-paper" x="20" y="24" width="56" height="52" rx="7"/><path class="c-red" d="M20 31a7 7 0 0 1 7-7h42a7 7 0 0 1 7 7v7H20z"/>' +
    '<circle class="c-paper" cx="34" cy="24" r="3"/><circle class="c-paper" cx="62" cy="24" r="3"/>' +
    [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => `<rect class="n ${r === 1 && c === 1 ? 'c-red' : 'c-ink'}" x="${28 + c * 14}" y="${46 + r * 10}" width="8" height="6" rx="1.500"/>`)).join(''));
  app('buku-kas', 'Aplikasi buku kas', 'c-teal',
    '<rect class="c-paper" x="20" y="20" width="56" height="58" rx="6"/><rect class="c-green" x="28" y="50" width="9" height="20"/><rect class="c-gold" x="43" y="40" width="9" height="30"/><rect class="c-red" x="58" y="56" width="9" height="14"/><path class="d" d="M26 70h44M28 32h30"/>');
  app('layanan', 'Aplikasi layanan digital', 'c-orange',
    '<circle class="c-paper" cx="48" cy="48" r="26"/><path class="c-yellow" d="M52 26L36 52h11l-3 18 16-26H49z"/>');
  app('berita', 'Aplikasi berita', 'c-navy',
    '<path class="d s-paper" d="M58 38L72 18"/><rect class="c-paper" x="18" y="36" width="60" height="38" rx="7"/><circle class="c-silver" cx="36" cy="55" r="11"/><circle class="n c-ink" cx="36" cy="55" r="3"/>' +
    '<path class="d" d="M54 48h16M54 56h16M54 64h10"/>');

  // avatars (chat contacts)
  Object.assign(TYPES, {
    bapak: { name: 'Bapak', skin: 'c-skin3', torso: '<path class="c-paper" d="M22 112V84Q22 66 48 66Q74 66 74 84V112Z"/><path class="c-silver" d="M40 66l8 10 8-10z"/>',
      gear: '<path class="c-ink" d="M30 29Q30 12 48 12Q66 12 66 29V30H30z"/><path class="c-gray" d="M40 46Q48 42 56 46Q48 49 40 46z" style="stroke-width:1.500"/>' },
    bukos: { name: 'Bu Kos', skin: 'c-skin2', torso: '<path class="c-pink" d="M22 112V84Q22 66 48 66Q74 66 74 84V112Z"/>' + [[34, 84], [58, 82], [46, 98], [62, 100]].map(([x, y]) => `<circle class="n c-paper" cx="${x}" cy="${y}" r="3"/>`).join(''),
      gear: '<circle class="c-ink" cx="48" cy="10" r="8"/><path class="c-ink" d="M28 42Q24 14 48 14Q72 14 68 42Q62 26 48 26Q34 26 28 42z"/><circle class="d" cx="41" cy="40" r="6.500"/><circle class="d" cx="55" cy="40" r="6.500"/><path class="d" d="M47.500 40h1"/>' },
    pakhaji: { name: 'Pak Haji Rohim', skin: 'c-skin2', torso: '<path class="c-paper" d="M22 112V84Q22 66 48 66Q74 66 74 84V112Z"/><path class="d" d="M48 70v42"/>',
      gear: '<path class="c-paper" d="M31 28Q31 12 48 12Q65 12 65 28V30H31z"/><path class="c-silver" d="M30 48Q30 70 48 74Q66 70 66 48Q58 58 48 58Q38 58 30 48z"/>' },
  });
  const avatar = (id, name, bg, inner) =>
    add('ponsel', `avatar-${id}`, name,
      `<clipPath id="av-${id}"><circle cx="48" cy="48" r="44"/></clipPath><circle class="${bg}" cx="48" cy="48" r="44"/><g clip-path="url(#av-${id})">${inner}</g><circle class="d" cx="48" cy="48" r="44" style="stroke-width:2.500"/>`);
  avatar('ibu', 'Ibu', 'c-yellow', person(TYPES.ibu, 'happy', 'translate(0 8)', 1));
  avatar('bapak', 'Bapak', 'c-water', person(TYPES.bapak, 'happy', 'translate(0 8)', 1));
  avatar('bu-kos', 'Bu Kos', 'c-bread2', person(TYPES.bukos, 'neutral', 'translate(0 12)', 1));
  avatar('pak-haji-rohim', 'Pak Haji Rohim', 'c-green', person(TYPES.pakhaji, 'happy', 'translate(0 8)', 1));
  avatar('grup-keluarga', 'Grup keluarga', 'c-pink',
    person(TYPES.bapak, 'happy', 'translate(0 30) scale(.45)', 1 / 0.45) + person(TYPES.ibu, 'happy', 'translate(50 30) scale(.45)', 1 / 0.45) +
    person(TYPES.anak, 'happy', 'translate(28 40) scale(.4)', 1 / 0.4));
  add('ponsel', 'ikon-centang', 'Centang dibaca', '<g style="--k:.6"><path class="d" d="M6 52l14 14L42 34M34 56l10 10L72 30" style="stroke:var(--blue);stroke-width:7"/></g>');
  add('ponsel', 'ikon-lonceng', 'Lonceng notifikasi', '<path class="c-yellow" d="M26 66V46Q26 24 48 22Q70 24 70 46V66l6 6H20z"/><circle class="c-gold" cx="48" cy="80" r="6"/><circle class="c-yellow" cx="48" cy="18" r="4"/>');

  // in-app glyphs: bank
  add('aplikasi', 'kartu-bank', 'Kartu bank',
    '<rect class="c-blue" x="4" y="4" width="112" height="68" rx="8"/><rect class="n c-navy" x="4" y="16" width="112" height="12"/><rect class="c-gold" x="14" y="38" width="20" height="15" rx="3"/>' +
    '<path class="d s-paper" d="M88 40q6 6 0 12M95 36q10 10 0 20"/><path class="d s-paper o5" d="M14 62h30"/>', '0 0 120 76');
  add('aplikasi', 'dompet', 'Dompet',
    '<circle class="c-gold" cx="58" cy="28" r="10"/><path class="c-rust" d="M14 36a8 8 0 0 1 8-8h50a8 8 0 0 1 8 8v40H22a8 8 0 0 1-8-8z"/><rect class="c-gold" x="56" y="46" width="30" height="18" rx="6"/><circle class="c-paper" cx="68" cy="55" r="3.500"/>');
  const arrow = (bg, d) => `<circle class="${bg}" cx="48" cy="48" r="38"/><path class="d" d="${d}" style="stroke:var(--paper);stroke-width:7"/>`;
  add('aplikasi', 'panah-masuk', 'Uang masuk', arrow('c-green', 'M48 26v38M34 50l14 14 14-14'));
  add('aplikasi', 'panah-keluar', 'Uang keluar', arrow('c-red', 'M48 70V32M34 46l14-14 14 14'));
  const bill = (id, name, bg, glyph) => add('aplikasi', `tagihan-${id}`, name,
    '<path class="c-paper" d="M22 8h52v72l-8-6-6 6-6-6-6 6-6-6-6 6-6-6-8 6z"/>' + `<circle class="${bg}" cx="48" cy="34" r="17"/>${glyph}<path class="d" d="M32 62h32M32 68h20"/>`);
  bill('listrik', 'Tagihan listrik', 'c-orange', '<path class="n c-paper" d="M51 22L40 37h8l-2 12 12-17h-8z"/>');
  bill('data', 'Tagihan data', 'c-blue', '<path class="d" d="M38 33q10-9 20 0M42 38q6-5 12 0" style="stroke:var(--paper);stroke-width:3"/><circle class="n c-paper" cx="48" cy="44" r="2.500"/>');
  bill('motor', 'Cicilan motor', 'c-green', '<circle class="n c-paper" cx="39" cy="42" r="4"/><circle class="n c-paper" cx="57" cy="42" r="4"/><path class="d" d="M39 42l5-10h8l5 10" style="stroke:var(--paper);stroke-width:3"/>');
  bill('kos', 'Uang kos', 'c-rust', '<path class="n c-paper" d="M36 36L48 24l12 12v12H36z"/><rect class="n c-rust" x="45" y="40" width="6" height="8"/>');
  bill('pinjol', 'Tagihan pinjol', 'c-red', '<text x="48" y="41" text-anchor="middle" font-size="18" class="c-paper">%</text>');

  // ojol
  add('aplikasi', 'motor-ojol', 'Motor ojol', SH +
    '<rect class="c-green2" x="8" y="38" width="22" height="18" rx="3"/><path class="c-green" d="M26 62q4-18 18-18h14l10 8v14H26z"/><rect class="c-ink" x="32" y="40" width="20" height="6" rx="3"/>' +
    '<path class="d" d="M60 42l7-12M63 30h9"/><circle class="c-yellow" cx="72" cy="50" r="3.500"/>' +
    '<circle class="c-ink" cx="24" cy="68" r="12"/><circle class="n c-steel" cx="24" cy="68" r="5"/><circle class="c-ink" cx="72" cy="68" r="12"/><circle class="n c-steel" cx="72" cy="68" r="5"/>');
  add('aplikasi', 'ikon-bensin', 'Ikon bensin', SH +
    '<path class="d" d="M60 36h12v24a5 5 0 0 0 10 0V44l-6-8"/><rect class="c-red" x="22" y="14" width="40" height="64" rx="5"/><rect class="c-paper" x="28" y="20" width="28" height="18" rx="3"/><rect class="c-steel2" x="16" y="76" width="52" height="8" rx="2"/>');
  add('aplikasi', 'ikon-helm', 'Ikon helm', SH +
    '<path class="c-green2" d="M16 62Q16 22 48 22Q82 22 82 54V66H16z"/><path class="c-ink" d="M44 44h38v14H46Q44 52 44 44z"/><rect class="c-steel2" x="14" y="62" width="70" height="8" rx="4"/><path class="d s-paper o5" d="M26 40q4-10 14-13"/>');
  add('aplikasi', 'ikon-pin', 'Titik pesanan',
    '<path class="c-red" d="M48 86Q22 58 22 38a26 26 0 0 1 52 0Q74 58 48 86z"/><circle class="c-paper" cx="48" cy="38" r="10"/>');

  // market
  add('aplikasi', 'ikon-keranjang', 'Keranjang pasar', SH +
    '<path class="d" d="M28 46Q28 14 48 14T68 46"/><circle class="c-red" cx="34" cy="42" r="9"/><circle class="c-green" cx="50" cy="38" r="8"/><circle class="c-yellow" cx="64" cy="42" r="8"/>' +
    '<path class="c-card" d="M14 46h68l-8 38H22z"/><path class="d" d="M28 52l3 26M44 52v26M60 52l-3 26"/>');
  add('aplikasi', 'ikon-truk', 'Pengiriman', SH +
    '<rect class="c-paper" x="6" y="28" width="48" height="38" rx="3"/><path class="c-blue" d="M54 38h18l14 14v14H54z"/><path class="c-paper" d="M60 43h10l8 9H60z"/>' +
    '<circle class="c-ink" cx="24" cy="68" r="9"/><circle class="n c-steel" cx="24" cy="68" r="4"/><circle class="c-ink" cx="68" cy="68" r="9"/><circle class="n c-steel" cx="68" cy="68" r="4"/>');
  add('aplikasi', 'ikon-grafik', 'Grafik harga',
    '<rect class="c-paper" x="10" y="14" width="76" height="62" rx="7"/><path class="d o3" d="M20 62h58M20 48h58M20 34h58"/><path class="d" d="M20 62L36 46 48 52 62 32 78 24" style="stroke:var(--green);stroke-width:4"/><circle class="c-green" cx="78" cy="24" r="4"/>');
  add('aplikasi', 'harga-naik', 'Harga naik', '<path class="c-red" d="M48 18L76 66H20z"/>');
  add('aplikasi', 'harga-turun', 'Harga turun', '<path class="c-green" d="M48 74L20 26h56z"/>');
}

/* ---------- Bahan (ingredients and supplies, ids follow the PRD price table) ---------- */
{
  const bahan = (id, name, body) => add('bahan', `bahan-${id}`, name, body);
  const bag = (bodyCls, bandCls, glyph) =>
    SH + `<path class="${bodyCls}" d="M22 36Q18 80 28 84H68Q78 80 74 36Z"/><path class="${bodyCls}" d="M30 36Q32 24 40 26Q48 16 56 26Q64 24 66 36Z"/>` +
    `<path class="d" d="M34 36q14 6 28 0"/><rect class="${bandCls}" x="21" y="42" width="54" height="8"/>` + glyph;

  // Pokok
  bahan('beras', 'Beras', bag('c-bread2', 'c-red', '<circle class="c-paper" cx="48" cy="67" r="12"/>' + [[-5, -3, -30], [5, -3, 30], [-6, 5, -20], [6, 5, 20], [0, 0, 0]].map(([dx, dy, r]) => `<ellipse class="n c-card" cx="${48 + dx}" cy="${67 + dy}" rx="2.6" ry="4.4" transform="rotate(${r} ${48 + dx} ${67 + dy})"/>`).join('')));
  bahan('mi-instan', 'Mi instan',
    SH + '<rect class="c-yellow" x="14" y="30" width="62" height="44" rx="9"/>' +
    [40, 49, 58, 67].map((y) => `<path class="d" d="M22 ${y}q5-5 10 0t10 0t10 0t10 0t10 0"/>`).join('') +
    '<rect class="c-red" x="56" y="56" width="26" height="24" rx="3" transform="rotate(8 69 68)"/><path class="n c-paper" d="M69 61q6 7 0 12-6-5 0-12z" transform="rotate(8 69 68)"/>');
  bahan('tepung', 'Tepung terigu', bag('c-paper', 'c-blue', '<g transform="translate(48 68)"><path class="d" d="M0 12V-12"/>' + [-8, -2, 4].map((y) => `<ellipse class="c-gold" cx="-5" cy="${y}" rx="4" ry="2.4" transform="rotate(-30 -5 ${y})"/><ellipse class="c-gold" cx="5" cy="${y}" rx="4" ry="2.4" transform="rotate(30 5 ${y})"/>`).join('') + '</g>'));
  bahan('gula', 'Gula pasir', bag('c-glass', 'c-teal', [[36, 62], [46, 70], [56, 63], [62, 74], [38, 76], [50, 78], [66, 64]].map(([x, y]) => `<rect class="n c-paper" x="${x}" y="${y}" width="6" height="6" rx="1" transform="rotate(${(x * 7) % 40} ${x + 3} ${y + 3})"/>`).join('')));
  bahan('minyak', 'Minyak goreng', SH + '<path class="c-glass" d="M42 14h12v14q12 4 12 16v34q0 6-6 6H36q-6 0-6-6V44q0-12 12-16z"/><path class="n c-oil" d="M31 38q0-10 11-12h12q11 2 11 12v40q0 6-6 6H37q-6 0-6-6z"/><rect class="c-red" x="41" y="6" width="14" height="9" rx="2"/><rect class="c-paper" x="31" y="48" width="34" height="24"/><path class="n c-orange" d="M48 52q8 9 0 15-8-6 0-15z"/>');

  // Protein
  bahan('telur', 'Telur',
    SH + '<ellipse class="c-bread2" cx="48" cy="72" rx="34" ry="12"/><path class="d o5" d="M22 70q10 4 20 0M50 74q10 4 22-2M30 78q8 2 14 0"/>' + egg(34, 54) + egg(62, 54) + egg(48, 46));
  const leg = (x, r) => `<g transform="translate(${x} 58) rotate(${r})"><path class="c-raw" d="M-8 0Q-11 12-5 20H5Q11 12 8 0Z"/><rect class="c-paper" x="-3" y="18" width="6" height="7" rx="2"/><circle class="c-paper" cx="-3.5" cy="27" r="3.6"/><circle class="c-paper" cx="3.5" cy="27" r="3.6"/></g>`;
  bahan('ayam', 'Ayam', SH + leg(32, 14) + leg(64, -14) + '<path class="c-raw" d="M20 46Q18 24 48 22Q78 24 76 46Q74 68 48 70Q22 68 20 46Z"/><path class="c-raw" d="M44 22Q48 12 52 22Z"/><path class="d o5 s-paper" d="M34 38Q48 30 62 38M32 52Q48 62 64 52"/><g class="o5"><circle class="n c-skin1" cx="36" cy="46" r="2"/><circle class="n c-skin1" cx="60" cy="44" r="2"/><circle class="n c-skin1" cx="48" cy="54" r="2"/></g>');
  bahan('tahu', 'Tahu', SH + [[16, 52], [50, 52], [33, 26]].map(([x, y]) => `<rect class="c-tofu" x="${x}" y="${y}" width="30" height="28" rx="5"/><circle class="n c-bread2" cx="${x + 8}" cy="${y + 8}" r="1.6"/><circle class="n c-bread2" cx="${x + 20}" cy="${y + 12}" r="1.6"/><circle class="n c-bread2" cx="${x + 12}" cy="${y + 20}" r="1.6"/>`).join(''));
  bahan('tempe', 'Tempe', SH + '<rect class="c-tempe" x="12" y="32" width="72" height="40" rx="6"/>' + [[26, 42], [38, 50], [50, 40], [62, 52], [74, 44], [30, 62], [46, 62], [58, 64], [70, 62]].map(([x, y]) => `<circle class="n c-card" cx="${x}" cy="${y}" r="3"/>`).join('') + '<path class="c-green" d="M12 32h14v40H12z"/><path class="c-green" d="M70 32h14v40H70z"/><path class="d o5 s-paper" d="M19 36v32M77 36v32"/>');
  bahan('lele', 'Ikan lele',
    SH + '<path class="c-steel" d="M80 44Q88 36 92 42L88 52 92 62Q88 66 80 58Q60 70 30 62Q14 58 10 50Q16 38 34 38Q64 34 80 44Z"/><path class="n c-silver" d="M20 54Q40 66 70 58Q50 60 20 54Z"/><circle class="c-paper" cx="26" cy="47" r="3.5"/><circle class="n c-ink" cx="26" cy="47" r="1.5"/><path class="d" d="M12 52Q4 56 2 64M12 50Q2 48 0 40M20 40Q14 32 16 24"/>');

  // Sayur dan bumbu
  const chili = (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r})"><path class="c-red" d="M-30-6C-10-14 22-8 38 12C42 18 36 20 30 17C14 8-8 6-30 6C-34 6-34-5-30-6Z"/><path class="c-green" d="M-30-6C-34-12-40-12-42-6C-40 0-34 4-30 6Z"/><path class="d o5 s-paper" d="M-14-3C4-4 18 2 28 10"/></g>`;
  bahan('cabai', 'Cabai', SH + chili(46, 38, 12) + chili(48, 62, -6));
  const bulb = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" style="--k:${(1 / s).toFixed(2)}"><path class="c-shallot" d="M0-24Q3-14 12-6Q18 6 12 16Q6 22 0 22Q-6 22-12 16Q-18 6-12-6Q-3-14 0-24Z"/><path class="d o5 s-paper" d="M-3-12Q-9 4-5 17M4-10Q9 4 6 17"/><path class="d" d="M-3 22l-2 5M0 22v6M3 22l2 5"/></g>`;
  bahan('bawang-merah', 'Bawang merah', SH + bulb(32, 56, 1) + bulb(62, 56, 1) + bulb(47, 42, 1.05));
  bahan('bawang-putih', 'Bawang putih', SH + '<path class="c-paper" d="M48 16Q50 28 62 36Q78 50 70 68Q62 80 48 80Q34 80 26 68Q18 50 34 36Q46 28 48 16Z"/><path class="d o5" d="M48 32Q38 54 44 78M48 32Q58 54 52 78M37 44Q29 58 35 74M59 44Q67 58 61 74"/><path class="d" d="M42 80l-3 7M48 81v7M54 80l3 7"/>');
  const leaf = (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r})"><ellipse class="c-green" rx="14" ry="28"/><path class="d o5 s-paper" d="M0-24V24"/></g>`;
  bahan('sawi', 'Sawi', SH + leaf(32, 42, -24) + leaf(64, 42, 24) + leaf(48, 36, 0) + '<path class="c-paper" d="M37 62L42 84H54L59 62Z"/><path class="d" d="M43 66v14M48 66v16M53 66v14"/><rect class="c-red" x="36" y="68" width="24" height="5" rx="2"/>');
  const calyx = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" style="--k:${(1 / s).toFixed(2)}"><path class="c-green" d="M0-10l5 7 8-2-4 8 7 5-9 1-1 8-6-5-6 5-1-8-9-1 7-5-4-8 8 2z"/></g>`;
  bahan('tomat', 'Tomat', SH + '<circle class="c-red" cx="42" cy="54" r="26"/><ellipse class="n c-paper o5" cx="32" cy="44" rx="4" ry="7" transform="rotate(25 32 44)"/>' + calyx(42, 32, 1) + '<circle class="c-red" cx="72" cy="68" r="15"/>' + calyx(72, 56, 0.55));

  // Minuman
  bahan('kopi', 'Kopi bubuk', pack('c-coffee', '<circle class="c-paper" cx="48" cy="49" r="18"/><ellipse class="c-coffee" cx="48" cy="49" rx="8" ry="12" transform="rotate(25 48 49)"/><path class="d s-paper" d="M44 40q8 8 0 18" transform="rotate(25 48 49)"/>'));
  bahan('teh', 'Teh', SH + '<rect class="c-green2" x="22" y="12" width="52" height="72" rx="5"/><rect class="c-paper" x="29" y="22" width="38" height="36" rx="3"/><path class="c-green" d="M47 29Q64 34 60 52Q42 50 47 29Z"/><path class="d" d="M48 32Q52 42 56 50"/><rect class="c-yellow" x="22" y="64" width="52" height="9"/>');
  bahan('susu', 'Susu kental manis', SH + '<path class="c-blue" d="M28 26v50a20 7 0 0 0 40 0V26z"/><path class="n c-paper" d="M28 40a20 6 0 0 0 40 0v22a20 6 0 0 1-40 0z"/><path class="d" d="M28 40a20 6 0 0 0 40 0M28 62a20 6 0 0 0 40 0"/><path class="n c-red" d="M48 44q8 9 0 15-8-6 0-15z"/><ellipse class="c-silver" cx="48" cy="26" rx="20" ry="6"/>');
  const cube = (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r})"><rect class="c-water" x="-15" y="-15" width="30" height="30" rx="7"/><path class="d s-paper" d="M-8-7l8-5"/><rect class="n c-paper o5" x="-9" y="-2" width="7" height="9" rx="2"/></g>`;
  bahan('es-batu', 'Es batu', SH + cube(32, 60, -10) + cube(62, 62, 12) + cube(46, 36, 4));
  bahan('air-galon', 'Air galon', SH + '<path class="d" d="M76 48q12 0 12 12t-12 12"/><path class="c-glass" d="M34 28Q34 22 40 20H56Q62 22 62 28V34Q76 40 76 56V76Q76 84 68 84H28Q20 84 20 76V56Q20 40 34 34Z"/><path class="n c-water" d="M22 54Q22 46 32 42H64Q74 46 74 54V76Q74 82 68 82H28Q22 82 22 76Z"/><rect class="c-blue" x="38" y="10" width="20" height="11" rx="3"/><path class="d s-paper o5" d="M30 56q10-6 20 0t18 0"/>');

  // Perlengkapan
  bahan('lpg', 'Gas LPG 3 kg', SH + '<path class="d" d="M32 24Q48 6 64 24"/><rect class="c-green" x="24" y="30" width="48" height="54" rx="18"/><rect class="c-green2" x="34" y="20" width="28" height="14" rx="4"/><circle class="c-steel" cx="48" cy="16" r="5"/><rect class="n c-paper" x="24" y="48" width="48" height="20"/><path class="d" d="M24 48H72M24 68H72"/><path class="n c-orange" d="M48 50q9 7 5 13-3 4-5 4t-6-4q-3-5 3-9 0 4 3 2-1-4 0-6z"/><text x="48" y="79" text-anchor="middle" font-size="8" class="c-paper">3 KG</text>');
  const tbag = (dx, dy, cls) => `<path class="${cls}" d="M${24 + dx} ${26 + dy}H${37 + dx}Q${39 + dx} ${44 + dy} ${48 + dx} ${44 + dy}Q${57 + dx} ${44 + dy} ${59 + dx} ${26 + dy}H${72 + dx}L${68 + dx} ${80 + dy}H${28 + dx}Z"/>`;
  bahan('kantong', 'Kantong plastik', SH + tbag(8, 4, 'c-glass') + tbag(4, 2, 'c-glass') + tbag(0, 0, 'c-glass') + '<rect class="c-red" x="24" y="56" width="46" height="12"/><path class="d s-paper" d="M30 62h20"/>');
  bahan('kertas-nasi', 'Kertas nasi', SH + '<rect class="c-card" x="20" y="32" width="54" height="46" rx="3" transform="rotate(-7 47 55)"/><rect class="c-bread2" x="22" y="30" width="54" height="46" rx="3" transform="rotate(4 49 53)"/><path class="d o5" d="M30 42h38M30 50h38M30 58h38"/><path class="c-paper" d="M62 30l14 14V30z"/><rect class="c-red" x="22" y="62" width="54" height="9" transform="rotate(4 49 66)"/>');
  bahan('tisu', 'Tisu', SH + '<path class="c-paper" d="M30 48Q34 26 44 40Q50 20 58 38Q66 28 68 48Z"/><rect class="c-blue" x="18" y="46" width="60" height="36" rx="7"/><ellipse class="c-paper" cx="48" cy="64" rx="16" ry="9"/><path class="d" d="M38 64q5-5 10 0t10 0"/>');
  bahan('sabun-piring', 'Sabun cuci piring', SH + '<circle class="c-glass" cx="75" cy="30" r="7"/><circle class="c-glass" cx="82" cy="46" r="4.5"/><circle class="c-glass" cx="20" cy="28" r="5.5"/><path class="c-green" d="M36 34Q28 40 28 52V78Q28 84 34 84H62Q68 84 68 78V52Q68 40 60 34V30H36Z"/><rect class="c-yellow" x="38" y="16" width="20" height="14" rx="3"/><path class="c-yellow" d="M46 16q2-8 16-8v6"/><circle class="c-paper" cx="48" cy="62" r="14"/><ellipse class="c-yellow" cx="48" cy="62" rx="9" ry="6.5"/><path class="d" d="M48 55.500v13M41 62h14"/>');
}

/* ---------- write ---------- */
rmSync(outDir, { recursive: true, force: true });
const manifest = [];
for (const a of assets) {
  const [, , w, h] = a.viewBox.split(' ');
  const dir = join(outDir, a.category);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${a.id}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${a.viewBox}" width="${w}" height="${h}"><style>${CSS}</style><g class="a">${a.body}</g></svg>\n`);
  manifest.push({ id: a.id, name: a.name, category: a.category, file: `${a.category}/${a.id}.svg`, viewBox: a.viewBox });
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${manifest.length} assets to ${outDir}`);
