'use strict';
// ═══════════════════════════════════════════════════════════════════════════════
// WORD STORM  ·  game.js
//
// Mechanics:
//   · Words fall from top at varying speeds
//   · Typing auto-targets the word matching your keystrokes
//   · Complete a word to destroy it (explosion + score)
//   · Word hits bottom → lose a life, screen flash
//   · 3 lives total
//   · Difficulty scales: more words, faster fall, longer words, less spawn gap
//   · Combo: consecutive kills within 2s stack a multiplier
//   · Mobile: tap word to target, then type via virtual keyboard
// ═══════════════════════════════════════════════════════════════════════════════

/* ── DOM ─────────────────────────────────────────────────────────────────── */
const $          = id => document.getElementById(id);
const canvas     = $('gameCanvas');
const ctx        = canvas.getContext('2d');
const hiddenInput= $('hidden-input');
const inputDisp  = $('input-display');

/* ── Screens ─────────────────────────────────────────────────────────────── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  if (id === 'screen-game') hiddenInput.focus({ preventScroll:true });
}

/* ── Word lists by difficulty tier ──────────────────────────────────────── */
const WORDS = {
  easy: [
    'cat','dog','run','sun','map','top','bit','cup','fog','hat',
    'ice','jam','key','log','mud','net','oak','pen','rat','sky',
    'tap','van','web','zip','ant','bat','can','den','egg','fan',
    'gap','hub','ink','jet','kit','lip','mop','nap','orb','pat',
    'rid','sob','tab','urn','vat','wax','yak','zap','arc','bay',
    'cod','dip','elk','fir','gem','hop','ivy','jot','keg','lag',
  ],
  medium: [
    'storm','flame','frost','blade','ghost','crane','plant','track',
    'swift','brush','cliff','draft','eagle','flank','grind','haven',
    'ivory','joust','kneel','lance','marsh','night','orbit','pivot',
    'quake','ridge','shade','thorn','ultra','valor','wrath','xenon',
    'yield','zebra','abyss','blaze','crypt','drift','ember','flint',
    'glare','haste','input','jumbo','karma','lunar','magic','noble',
    'ocean','prism','quest','realm','sword','tiger','unify','vivid',
    'waste','exact','yacht','zonal','angel','brave','chess','depth',
  ],
  hard: [
    'thunder','cascade','eclipse','phantom','scatter','tremble','voltage',
    'warlock','alchemy','bravado','circuit','dazzle','enforce','frantic',
    'gravity','harvest','impulse','justice','kinetic','luster','machine',
    'natural','octagon','pension','quarrel','raccoon','silence','tactics',
    'urgency','version','warrior','xternal','yanking','zipping','ancient',
    'banquet','crystal','diagram','endemic','faction','glamour','hostile',
    'iceberg','journal','kingdom','lantern','mention','nucleus','outrage',
    'peptide','quantum','renewal','serpent','texture','uranium','viscous',
  ],
  expert: [
    'atmosphere','bankruptcy','carefully','dangerous','elaborate','fantastic',
    'gradually','hurricane','identical','judiciary','knowledge','lightning',
    'machinery','notorious','objective','potential','qualified','ruthless',
    'strategic','turbulent','unlimited','venomous','whirlpool','extension',
    'byzantine','clockwork','dimension','elaborate','fortitude','gladiator',
    'hypnotic','intensity','labyrinth','magnitude','nightmare','ominous',
    'perimeter','quicksand','ravishing','scattered','threshold','undeniable',
    'vigilance','whirlwind','xenophobe','yelping','zealously','acrobatic',
    'broadcast','clocktower','devastate','eliminate','framework','graphical',
  ],
};

/* ── Constants ───────────────────────────────────────────────────────────── */
const HH = 56;   // hud height
const IH = 62;   // input area height

/* ── Difficulty table — indexed by level (0-based) ──────────────────────── */
// { spawnInterval (ms), maxOnScreen, speedMin, speedMax, wordTier, bonusPoints }
function getDiff(level) {
  const l = Math.min(level, 14);
  return {
    spawnInterval: Math.max(1200, 4000 - l * 200),
    maxOnScreen:   Math.min(8, 2 + Math.floor(l / 2)),
    speedMin:      20 + l * 3,
    speedMax:      35 + l * 5,
    tier:          l < 3 ? 'easy' : l < 6 ? 'medium' : l < 10 ? 'hard' : 'expert',
    scoreBase:     l < 3 ? 10    : l < 6 ? 20      : l < 10  ? 35    : 60,
  };
}

/* ── Palette ─────────────────────────────────────────────────────────────── */
const C = {
  bg:      '#080c18',
  bg2:     '#0d1225',
  word:    '#f0f4ff',
  typed:   '#e8ff47',
  tag:     'rgba(13,18,37,.85)',
  tagBord: 'rgba(100,160,255,.4)',
  tagAct:  'rgba(232,255,71,.15)',
  tagActB: 'rgba(232,255,71,.7)',
  danger:  '#ff3344',
  particle:'#e8ff47',
  lightning:'#88bbff',
  rain:    'rgba(100,140,255,.15)',
};

/* ── State ───────────────────────────────────────────────────────────────── */
let G = null;
let animId = null;
let lastTs = 0;

function freshState() {
  return {
    phase: 'playing',
    score: 0,
    lives: 3,
    level: 1,
    combo: 0,
    comboTimer: 0,
    maxCombo: 0,
    wordsDestroyed: 0,
    wordsMissed: 0,
    totalChars: 0,
    typed: '',           // current input buffer
    targetWord: null,    // the falling word being typed
    words: [],           // active falling words
    particles: [],       // explosion particles
    lightning: [],       // lightning bolt effects
    rain: [],            // background rain drops
    spawnTimer: 0,
    nextSpawnIn: 4000,
    usedWords: new Set(),
    screenFlash: null,   // {color, timer}
    bgScroll: 0,         // cloud parallax
  };
}

/* ── Falling word object ─────────────────────────────────────────────────── */
let wordId = 0;
function spawnWord() {
  const d = getDiff(G.level - 1);
  const pool = WORDS[d.tier];
  // Pick an unused word
  let word, tries = 0;
  do {
    word = pool[Math.floor(Math.random() * pool.length)];
    tries++;
  } while (G.usedWords.has(word) && tries < 30);
  G.usedWords.add(word);
  if (G.usedWords.size > pool.length * 0.7) G.usedWords.clear(); // reset when pool depleted

  const margin = 60;
  const x = margin + Math.random() * (canvas.width - margin * 2);
  const speed = d.speedMin + Math.random() * (d.speedMax - d.speedMin);

  G.words.push({
    id: ++wordId,
    text: word,
    x,
    y: -24,
    speed,               // px/sec
    typed: 0,            // chars correctly typed
    active: false,       // being targeted
    shakeX: 0,           // wobble on near-bottom
    opacity: 1,
    dying: false,        // explosion in progress
    dieTimer: 0,
  });
}

/* ── Layout ──────────────────────────────────────────────────────────────── */
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight - HH - IH;
  canvas.style.top  = HH + 'px';
  canvas.style.left = '0px';
  // Respawn rain
  if (G) initRain();
}
window.addEventListener('resize', () => { resize(); if (G) initRain(); });

function initRain() {
  G.rain = [];
  const count = Math.floor(canvas.width / 8);
  for (let i = 0; i < count; i++) {
    G.rain.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      len: 6 + Math.random() * 14,
      speed: 120 + Math.random() * 80,
      opacity: 0.05 + Math.random() * 0.12,
    });
  }
}

/* ── Persistence ─────────────────────────────────────────────────────────── */
const getBest  = () => parseInt(localStorage.getItem('ws_best') || '0');
const saveBest = s  => { if (s > getBest()) localStorage.setItem('ws_best', s); };
function updateTitleBest() {
  const b = getBest();
  $('title-best').textContent = b > 0 ? `BEST: ${b.toLocaleString()} PTS` : '';
}
updateTitleBest();

/* ── Buttons ─────────────────────────────────────────────────────────────── */
$('btn-start').onclick  = startGame;
$('btn-retry').onclick  = startGame;
$('btn-menu').onclick   = () => { stopGame(); showScreen('screen-title'); };

/* ── Mobile focus button ─────────────────────────────────────────────────── */
const mobileFocusBtn = $('mobile-focus-btn');
function isMobile() { return 'ontouchstart' in window || window.innerWidth <= 700; }
mobileFocusBtn.addEventListener('touchstart', e => {
  e.preventDefault();
  hiddenInput.focus({ preventScroll: true });
}, { passive: false });

/* ── Start / Stop ─────────────────────────────────────────────────────────── */
function startGame() {
  stopGame();
  G = freshState();
  resize();
  initRain();
  showScreen('screen-game');
  mobileFocusBtn.style.display = isMobile() ? 'block' : 'none';
  updateHUD();
  hiddenInput.value = '';
  hiddenInput.focus({ preventScroll: true });
  lastTs = performance.now();
  animId = requestAnimationFrame(loop);
}
function stopGame() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
}

/* ── Input handling ──────────────────────────────────────────────────────── */
hiddenInput.addEventListener('input', e => {
  if (!G || G.phase !== 'playing') return;
  const raw = hiddenInput.value;
  hiddenInput.value = '';       // clear immediately
  for (const ch of raw) handleChar(ch);
});

hiddenInput.addEventListener('keydown', e => {
  if (!G || G.phase !== 'playing') return;
  if (e.key === 'Backspace') {
    if (G.typed.length > 0) {
      G.typed = G.typed.slice(0, -1);
      if (G.targetWord) {
        G.targetWord.typed = G.typed.length;
        if (G.typed.length === 0) {
          G.targetWord.active = false;
          G.targetWord = null;
        }
      }
      updateInputDisplay();
    }
    e.preventDefault();
  }
  if (e.key === 'Escape') {
    // Cancel current word
    if (G.targetWord) { G.targetWord.active = false; G.targetWord.typed = 0; G.targetWord = null; }
    G.typed = '';
    updateInputDisplay();
  }
});

// Canvas tap → target word
canvas.addEventListener('click', e => {
  if (!G || G.phase !== 'playing') return;
  hiddenInput.focus({ preventScroll: true });
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  tapAt(mx, my);
});
canvas.addEventListener('touchstart', e => {
  if (!G || G.phase !== 'playing') return;
  e.preventDefault();
  hiddenInput.focus({ preventScroll: true });
  const rect = canvas.getBoundingClientRect();
  const t = e.changedTouches[0];
  tapAt(t.clientX - rect.left, t.clientY - rect.top);
}, { passive: false });

function tapAt(mx, my) {
  // Find closest word to tap
  let best = null, bestD = 80;
  for (const w of G.words) {
    if (w.dying) continue;
    const tw = measureWordWidth(w.text);
    const wx = w.x - tw / 2 - 12;
    const wy = w.y - 20;
    const ww = tw + 24;
    const wh = 36;
    if (mx >= wx && mx <= wx + ww && my >= wy && my <= wy + wh) {
      const d = Math.hypot(mx - w.x, my - (w.y));
      if (d < bestD) { bestD = d; best = w; }
    }
  }
  if (best) {
    // Switch target
    if (G.targetWord && G.targetWord !== best) {
      G.targetWord.active = false;
      G.targetWord.typed = 0;
    }
    G.targetWord = best;
    best.active = true;
    G.typed = '';
    best.typed = 0;
    updateInputDisplay();
  }
}

function handleChar(ch) {
  if (!ch || ch.trim() === '' && ch !== ' ') return;
  const lower = ch.toLowerCase();
  if (!/[a-z]/.test(lower)) return;

  // If we have a target, continue typing it
  if (G.targetWord) {
    const w = G.targetWord;
    const expected = w.text[w.typed];
    if (lower === expected) {
      w.typed++;
      G.typed += lower;
      G.totalChars++;
      if (w.typed === w.text.length) {
        destroyWord(w);
        return;
      }
    } else {
      // Wrong key — shake the word
      w.shakeX = 6;
    }
    updateInputDisplay();
    return;
  }

  // No target — find a word starting with this letter
  // Priority: words lowest on screen (most dangerous) that start with this char
  const candidates = G.words.filter(w => !w.dying && w.text[0] === lower);
  if (candidates.length === 0) {
    // No match — flash input
    flashInput();
    return;
  }
  // Pick the one furthest down
  candidates.sort((a, b) => b.y - a.y);
  const target = candidates[0];
  G.targetWord = target;
  target.active = true;
  target.typed = 1;
  G.typed = lower;
  G.totalChars++;
  if (target.typed === target.text.length) {
    destroyWord(target);
    return;
  }
  updateInputDisplay();
}

function updateInputDisplay() {
  if (!G) return;
  inputDisp.textContent = G.typed || '';
}

function flashInput() {
  inputDisp.style.color = 'var(--red)';
  setTimeout(() => { inputDisp.style.color = ''; }, 200);
}

/* ── Word destruction ────────────────────────────────────────────────────── */
function destroyWord(w) {
  w.dying = true;
  w.dieTimer = 0.45;
  G.words = G.words.filter(x => x !== w);

  // Score
  const d = getDiff(G.level - 1);
  const comboMult = Math.min(G.combo, 8);
  const mult = 1 + comboMult * 0.25;
  const pts = Math.round(d.scoreBase * w.text.length * mult);
  G.score += pts;

  // Combo
  G.combo++;
  G.comboTimer = 2.5;
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  G.wordsDestroyed++;

  // Reset target
  if (G.targetWord === w) { G.targetWord = null; }
  G.typed = '';
  updateInputDisplay();

  // Particles
  spawnExplosion(w.x, w.y, G.combo > 5 ? '#e8ff47' : '#88ccff', 16);
  if (G.combo > 3) spawnLightning(w.x, w.y);

  // Flash
  flashOverlay('gold');
  bumpScore();
  updateHUD();

  // Level up check
  const newLevel = 1 + Math.floor(G.score / 300);
  if (newLevel > G.level) {
    G.level = Math.min(newLevel, 15);
    updateHUD();
  }
}

/* ── Word missed ─────────────────────────────────────────────────────────── */
function wordMissed(w) {
  G.lives--;
  G.combo = 0;
  G.comboTimer = 0;
  G.wordsMissed++;
  if (G.targetWord === w) { G.targetWord = null; G.typed = ''; updateInputDisplay(); }
  G.words = G.words.filter(x => x !== w);
  flashOverlay('red');
  screenShake(8);
  updateHUD();
  updateLivesUI();
  if (G.lives <= 0) {
    G.lives = 0;
    setTimeout(() => gameOver(), 500);
  }
}

/* ── HUD ─────────────────────────────────────────────────────────────────── */
function updateHUD() {
  if (!G) return;
  $('hud-score').textContent = G.score.toLocaleString();
  $('hud-level').textContent = `LEVEL ${G.level}`;
  $('hud-combo').textContent = G.combo >= 2 ? `×${G.combo}` : '—';
}
function updateLivesUI() {
  for (let i = 1; i <= 3; i++) {
    const el = $(`life-${i}`);
    if (el) el.classList.toggle('lost', i > G.lives);
  }
}
function bumpScore() {
  const el = $('hud-score');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function flashOverlay(type) {
  const el = $('flash-overlay');
  el.className = '';
  void el.offsetWidth;
  el.className = type === 'red' ? 'flash-red' : 'flash-gold';
}

let shakeOffset = {x:0,y:0};
let shakeTimer = 0;
function screenShake(intensity) {
  shakeTimer = 0.28; shakeOffset = {x:0,y:0};
  // Applied in draw via canvas transform
  G.screenShake = intensity;
}

/* ── Particles ───────────────────────────────────────────────────────────── */
function spawnExplosion(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const speed = 60 + Math.random() * 140;
    G.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      r: 2 + Math.random() * 4,
      color: Math.random() < 0.3 ? '#ffffff' : color,
      life: 0.4 + Math.random() * 0.4,
      maxLife: 0.8,
      shape: Math.random() < 0.4 ? 'star' : 'circle',
    });
  }
}

function spawnLightning(x, y) {
  G.lightning.push({ x, y, life: 0.25, maxLife: 0.25 });
}

function tickParticles(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt;
    if (p.life <= 0) G.particles.splice(i, 1);
  }
  for (let i = G.lightning.length - 1; i >= 0; i--) {
    G.lightning[i].life -= dt;
    if (G.lightning[i].life <= 0) G.lightning.splice(i, 1);
  }
}

/* ── Rain ────────────────────────────────────────────────────────────────── */
function tickRain(dt) {
  if (!G.rain) return;
  for (const r of G.rain) {
    r.y += r.speed * dt;
    if (r.y > canvas.height) { r.y = -r.len; r.x = Math.random() * canvas.width; }
  }
}

/* ── Game over ───────────────────────────────────────────────────────────── */
function gameOver() {
  if (!G || G.phase === 'dead') return;
  G.phase = 'dead';
  stopGame();
  saveBest(G.score);
  updateTitleBest();
  $('over-score').textContent = G.score.toLocaleString();
  const best = getBest();
  $('over-best').textContent = G.score >= best ? '★ NEW BEST!' : `BEST: ${best.toLocaleString()}`;
  $('over-stats').innerHTML = [
    { v: G.wordsDestroyed, l: 'DESTROYED' },
    { v: G.maxCombo,       l: 'MAX COMBO' },
    { v: G.level,          l: 'LEVEL'     },
  ].map(s => `<div class="os-box"><div class="os-val">${s.v}</div><div class="os-lbl">${s.l}</div></div>`).join('');
  showScreen('screen-over');
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN LOOP
═══════════════════════════════════════════════════════════════════════════ */
function loop(ts) {
  animId = requestAnimationFrame(loop);
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  if (!G || G.phase === 'dead') return;
  update(dt);
  draw();
}

function update(dt) {
  const d = getDiff(G.level - 1);

  // Combo timer
  if (G.combo > 0) {
    G.comboTimer -= dt;
    if (G.comboTimer <= 0) { G.combo = 0; updateHUD(); }
  }

  // Screen shake
  if (G.screenShake > 0) G.screenShake = Math.max(0, G.screenShake - dt * 30);

  // Rain
  tickRain(dt);

  // Spawn
  G.spawnTimer += dt * 1000;
  if (G.spawnTimer >= d.spawnInterval && G.words.filter(w=>!w.dying).length < d.maxOnScreen) {
    G.spawnTimer = 0;
    G.nextSpawnIn = d.spawnInterval;
    spawnWord();
  }

  // Move words
  for (let i = G.words.length - 1; i >= 0; i--) {
    const w = G.words[i];
    if (w.dying) continue;
    w.y += w.speed * dt;

    // Danger shake near bottom
    const dangerY = canvas.height - 60;
    if (w.y > dangerY) {
      w.shakeX = (Math.random() - 0.5) * 6 * ((w.y - dangerY) / 60);
    } else if (w.shakeX !== 0) {
      w.shakeX *= 0.8;
    }

    // Missed
    if (w.y > canvas.height + 10) {
      wordMissed(w);
    }
  }

  // BG scroll
  G.bgScroll = (G.bgScroll + dt * 8) % canvas.height;

  // Particles
  tickParticles(dt);
}

/* ═══════════════════════════════════════════════════════════════════════════
   DRAW
═══════════════════════════════════════════════════════════════════════════ */
function draw() {
  const W = canvas.width, H = canvas.height;

  // Screen shake transform
  const sx = G.screenShake > 0 ? (Math.random() - 0.5) * G.screenShake : 0;
  const sy = G.screenShake > 0 ? (Math.random() - 0.5) * G.screenShake * 0.5 : 0;
  ctx.save();
  ctx.translate(sx, sy);

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#060a14');
  bg.addColorStop(1, '#0a1020');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Storm clouds (parallax stripes)
  drawClouds(W, H);

  // Rain
  drawRain(W, H);

  // Words
  for (const w of G.words) drawWord(w);

  // Lightning bolts
  drawLightning(W, H);

  // Particles
  drawParticles();

  ctx.restore();
}

function drawClouds(W, H) {
  // Dark rolling cloud bands
  ctx.fillStyle = 'rgba(10,16,32,.6)';
  for (let i = 0; i < 4; i++) {
    const y = ((G.bgScroll + i * H / 4) % H) - 40;
    const w = 120 + Math.sin(i * 2.3) * 60;
    ctx.beginPath();
    ctx.ellipse(W * 0.2 + i * W * 0.22, y, w, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(W * 0.5 + i * W * 0.15, y + 10, w * 0.8, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRain(W, H) {
  if (!G.rain) return;
  ctx.strokeStyle = C.rain;
  ctx.lineWidth = 1;
  for (const r of G.rain) {
    ctx.globalAlpha = r.opacity;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x - 2, r.y + r.len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function measureWordWidth(text) {
  ctx.font = '700 18px "Courier Prime", monospace';
  return ctx.measureText(text).width;
}

function drawWord(w) {
  const tw = measureWordWidth(w.text);
  const pad = 14;
  const bw = tw + pad * 2;
  const bh = 36;
  const bx = w.x - bw / 2 + w.shakeX;
  const by = w.y - bh / 2;

  const isDanger = w.y > canvas.height - 80;
  const isActive = w.active;

  // Tag background
  ctx.save();
  ctx.globalAlpha = w.opacity;
  ctx.fillStyle = isActive ? C.tagAct : C.tag;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 6);
  ctx.fill();

  // Tag border
  ctx.strokeStyle = isActive ? C.tagActB : isDanger ? C.danger : C.tagBord;
  ctx.lineWidth = isActive ? 2 : 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 6);
  ctx.stroke();

  // Danger glow
  if (isDanger) {
    ctx.strokeStyle = `rgba(255,51,68,${0.15 + Math.sin(Date.now() / 180) * 0.15})`;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(bx - 2, by - 2, bw + 4, bh + 4, 8);
    ctx.stroke();
  }

  // Word text — typed portion in electric yellow, remainder in white
  ctx.font = '700 18px "Courier Prime", monospace';
  ctx.textBaseline = 'middle';
  const ty = by + bh / 2 + 1;
  let cx2 = bx + pad;

  for (let i = 0; i < w.text.length; i++) {
    const ch = w.text[i];
    const chW = ctx.measureText(ch).width;
    ctx.fillStyle = i < w.typed ? C.typed : isDanger ? '#ff8888' : C.word;
    if (i < w.typed) {
      // Highlight box behind typed chars
      ctx.fillStyle = 'rgba(232,255,71,.12)';
      ctx.fillRect(cx2 - 1, by + 4, chW + 2, bh - 8);
      ctx.fillStyle = C.typed;
    }
    ctx.textAlign = 'left';
    ctx.fillText(ch, cx2, ty);
    cx2 += chW;
  }

  // Cursor after last typed char (if active)
  if (isActive && w.typed < w.text.length && Math.floor(Date.now() / 400) % 2 === 0) {
    const cursorX = bx + pad + ctx.measureText(w.text.slice(0, w.typed)).width;
    ctx.fillStyle = C.typed;
    ctx.fillRect(cursorX, by + 8, 2, bh - 16);
  }

  ctx.restore();

  // Speed indicator trail
  const trailAlpha = Math.min(0.5, (w.speed - 20) / 80);
  if (trailAlpha > 0) {
    const grad = ctx.createLinearGradient(w.x, w.y - 40, w.x, w.y - 5);
    grad.addColorStop(0, `rgba(100,140,255,0)`);
    grad.addColorStop(1, `rgba(100,140,255,${trailAlpha * 0.5})`);
    ctx.fillStyle = grad;
    ctx.fillRect(w.x - 1, w.y - 40, 2, 35);
  }
}

function drawLightning(W, H) {
  for (const bolt of G.lightning) {
    const a = bolt.life / bolt.maxLife;
    ctx.save();
    ctx.globalAlpha = a * 0.8;
    ctx.strokeStyle = '#88bbff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#88bbff';
    ctx.shadowBlur = 12;
    // Zigzag from top to bolt position
    ctx.beginPath();
    ctx.moveTo(bolt.x, 0);
    let ly = 0;
    while (ly < bolt.y) {
      const step = 20 + Math.random() * 30;
      ly = Math.min(ly + step, bolt.y);
      ctx.lineTo(bolt.x + (Math.random() - 0.5) * 40, ly);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of G.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    if (p.shape === 'star') {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.life * 10);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const r = i % 2 === 0 ? p.r : p.r * 0.4;
        if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
        else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.r * a), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ── Animated title canvas ───────────────────────────────────────────────── */
const titleCanvas = (() => {
  const tc = $('title-canvas');
  const tCtx = tc.getContext('2d');
  let rafId = null;
  let drops = [];

  function init() {
    tc.width  = window.innerWidth;
    tc.height = window.innerHeight;
    drops = Array.from({ length: 60 }, () => ({
      x: Math.random() * tc.width,
      y: Math.random() * tc.height,
      speed: 80 + Math.random() * 120,
      len: 10 + Math.random() * 20,
      opacity: 0.05 + Math.random() * 0.15,
    }));
  }

  let last = 0;
  function frame(ts) {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min((ts - last) / 1000, 0.05); last = ts;
    tCtx.clearRect(0, 0, tc.width, tc.height);
    tCtx.fillStyle = 'rgba(6,10,20,.85)';
    tCtx.fillRect(0, 0, tc.width, tc.height);

    // Cloud blobs
    tCtx.fillStyle = 'rgba(10,16,38,.7)';
    for (let i = 0; i < 5; i++) {
      tCtx.beginPath();
      tCtx.ellipse(tc.width * (i * 0.22 + 0.05), tc.height * 0.15 + Math.sin(ts/2000+i)*20,
        80+i*20, 30, 0, 0, Math.PI*2);
      tCtx.fill();
    }

    // Rain
    tCtx.strokeStyle = 'rgba(100,140,255,.18)';
    tCtx.lineWidth = 1;
    for (const d of drops) {
      d.y += d.speed * dt;
      if (d.y > tc.height) { d.y = -d.len; d.x = Math.random() * tc.width; }
      tCtx.globalAlpha = d.opacity;
      tCtx.beginPath();
      tCtx.moveTo(d.x, d.y);
      tCtx.lineTo(d.x - 2, d.y + d.len);
      tCtx.stroke();
    }

    // Random lightning flicker
    if (Math.random() < 0.003) {
      tCtx.globalAlpha = 0.12;
      tCtx.fillStyle = '#aaccff';
      tCtx.fillRect(0, 0, tc.width, tc.height);
    }
    tCtx.globalAlpha = 1;
  }

  return {
    start() { init(); if (!rafId) rafId = requestAnimationFrame(frame); },
    stop()  { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } },
  };
})();

window.addEventListener('load', () => {
  titleCanvas.start();
  updateTitleBest();
});
$('btn-start').addEventListener('click', () => titleCanvas.stop(), { once: true });
$('btn-retry').addEventListener('click', () => titleCanvas.stop(), { once: false });
