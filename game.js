'use strict';
// ═══════════════════════════════════════════════════════════════════════════════
// WORD STORM  ·  game.js  (Spreadsheet Edition)
// ═══════════════════════════════════════════════════════════════════════════════

/* ── DOM ─────────────────────────────────────────────────────────────────── */
const $           = id => document.getElementById(id);
const canvas      = $('gameCanvas');
const ctx         = canvas.getContext('2d');
const hiddenInput = $('hidden-input');
const inputDisp   = $('input-display');

/* ── Screens ─────────────────────────────────────────────────────────────── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  if (id === 'screen-game') hiddenInput.focus({ preventScroll:true });
}

/* ── Word lists ──────────────────────────────────────────────────────────── */
const WORDS = {
  easy: [
    'cat','dog','run','sun','map','top','bit','cup','fog','hat',
    'ice','jam','key','log','mud','net','oak','pen','rat','sky',
    'tap','van','web','zip','ant','bat','can','den','egg','fan',
    'gap','hub','ink','jet','kit','lip','mop','nap','orb','pat',
    'rid','sob','tab','urn','vat','wax','yak','arc','bay','cod',
    'dip','elk','fir','gem','hop','ivy','jot','keg','lag','fin',
  ],
  medium: [
    'storm','flame','frost','blade','ghost','crane','plant','track',
    'swift','brush','cliff','draft','eagle','flank','grind','haven',
    'ivory','joust','kneel','lance','marsh','night','orbit','pivot',
    'quake','ridge','shade','thorn','ultra','valor','wrath','xenon',
    'yield','zebra','abyss','blaze','crypt','drift','ember','flint',
    'glare','haste','input','jumbo','karma','lunar','magic','noble',
    'ocean','prism','quest','realm','sword','tiger','unify','vivid',
    'waste','exact','yacht','angel','brave','chess','depth','fence',
  ],
  hard: [
    'thunder','cascade','eclipse','phantom','scatter','tremble','voltage',
    'warlock','alchemy','bravado','circuit','dazzle','enforce','frantic',
    'gravity','harvest','impulse','justice','kinetic','luster','machine',
    'natural','octagon','pension','quarrel','raccoon','silence','tactics',
    'urgency','version','warrior','ancient','banquet','crystal','diagram',
    'endemic','faction','glamour','hostile','iceberg','journal','kingdom',
    'lantern','mention','nucleus','outrage','peptide','quantum','renewal',
    'serpent','texture','uranium','viscous','chapter','flanking','dynamic',
  ],
  expert: [
    'atmosphere','bankruptcy','carefully','dangerous','elaborate','fantastic',
    'gradually','hurricane','identical','judiciary','knowledge','lightning',
    'machinery','notorious','objective','potential','qualified','ruthless',
    'strategic','turbulent','unlimited','venomous','whirlpool','extension',
    'byzantine','clockwork','dimension','fortitude','gladiator','hypnotic',
    'intensity','labyrinth','magnitude','nightmare','perimeter','quicksand',
    'ravishing','scattered','threshold','vigilance','whirlwind','acrobatic',
    'broadcast','devastate','eliminate','framework','graphical','polarized',
  ],
};

/* ── Spreadsheet visual constants ────────────────────────────────────────── */
const ROW_H    = 22;   // px per row
const COL_NUM_W= 42;   // row-number column width
const CELL_FONT= '12px -apple-system,"Segoe UI",Arial,sans-serif';
const MONO_FONT= '12px "Courier New",monospace';
const COLS     = ['A','B','C','D','E','F','G','H','I','J','K','L'];
const COL_HDR_H= 20;   // column header height
// Fixed column widths
const COL_WIDTHS = [80,100,90,70,110,80,95,70,85,100,75,90];

// Palette — spreadsheet look, but falling words clearly pop
const XL = {
  white:   '#ffffff',
  sheet:   '#ffffff',
  border:  '#d0d0d0',
  border2: '#e8e8e8',
  hdr:     '#f2f2f2',
  hdr2:    '#e8e8e8',
  hdrText: '#424242',
  rowNum:  '#616161',
  // Falling word cells — distinct Excel-style highlight colours
  wordBg:     '#fffde7',           // light yellow — Excel "highlight" colour
  wordBgAct:  '#e3f2fd',           // light blue — Excel selection
  wordBgDngr: '#fce4d6',           // light orange-red — Excel error/warning
  wordBord:   '#f9a825',           // amber border — makes cells pop
  wordBordAct:'#1e6fcc',           // Excel blue for active
  wordBordDngr:'#c00000',          // red for danger
  selBg:   'rgba(30,111,204,.12)',
  selBord: '#1e6fcc',
  text:    '#1a1a1a',              // near-black — max contrast
  dim:     '#9e9e9e',
  typed:   '#1565c0',              // darker Excel blue for typed portion
  active:  '#1e6fcc',
  danger:  '#c00000',
  dangerBg:'rgba(192,0,0,.06)',
  combo:   '#217346',
  complete:'rgba(33,115,70,.18)',
  miss:    'rgba(192,0,0,.15)',
};

/* ── Difficulty config ───────────────────────────────────────────────────── */
let selectedDifficulty = 'easy';

const DIFF_BASE = {
  easy:   { base:0, maxStart:3, spawnStart:2200, spdMin:18, spdMax:32, scoreBase:10, lvPts:150 },
  medium: { base:4, maxStart:5, spawnStart:1500, spdMin:28, spdMax:50, scoreBase:20, lvPts:200 },
  hard:   { base:8, maxStart:7, spawnStart:1000, spdMin:40, spdMax:70, scoreBase:35, lvPts:250 },
};

function getDiff(level) {
  const cfg = DIFF_BASE[selectedDifficulty] || DIFF_BASE.easy;
  const l = Math.min(cfg.base + level, 18);
  return {
    spawnInterval: Math.max(600, cfg.spawnStart - l * 80),
    maxOnScreen:   Math.min(10, cfg.maxStart + Math.floor(l / 2)),
    speedMin:      cfg.spdMin + l * 3,
    speedMax:      cfg.spdMax + l * 4,
    tier:          l < 3 ? 'easy' : l < 7 ? 'medium' : l < 12 ? 'hard' : 'expert',
    scoreBase:     cfg.scoreBase,
    lvUpPts:       cfg.lvPts,
  };
}

/* ── State ───────────────────────────────────────────────────────────────── */
let G = null, animId = null, lastTs = 0;

// Build cumulative column x-positions
let colX = [];
function buildColX() {
  colX = [COL_NUM_W];
  for (let i = 0; i < COLS.length; i++) colX.push(colX[i] + COL_WIDTHS[i]);
}

function freshState() {
  return {
    phase: 'playing',
    score:0, lives:3, level:1,
    combo:0, comboTimer:0, maxCombo:0,
    wordsDestroyed:0, wordsMissed:0,
    totalCharsTyped:0,   // every correct keystroke
    startTime: Date.now(), // for WPM calculation
    typed:'', targetWord:null,
    words:[],
    particles:[],   // subtle cell flash particles
    spawnTimer:0,
    usedWords: new Set(),
    screenShake:0,
    // Fake "data" already in spreadsheet rows (static decorative)
    bgData: generateBgData(),
  };
}

/* ── Generate fake background spreadsheet data ───────────────────────────── */
const FAKE_LABELS = [
  'Revenue','Expenses','Net Income','Q1 Budget','Q2 Budget','Q3 Actual',
  'Q4 Forecast','Variance','Headcount','Dept Total','Travel','Marketing',
  'Software','Salaries','Benefits','Overhead','Contingency','TOTAL',
];
const FAKE_CATS = ['Operations','Finance','HR','IT','Legal','Sales','Support'];

function generateBgData() {
  const rows = [];
  for (let r = 0; r < 60; r++) {
    const cols = [];
    for (let c = 0; c < COLS.length; c++) {
      let val = '';
      if (r === 0) {
        // Header row
        val = c === 0 ? 'Category' : c === 1 ? 'Description' : `Q${c} ${2024}`;
      } else if (c === 0) {
        val = FAKE_CATS[r % FAKE_CATS.length];
      } else if (c === 1) {
        val = FAKE_LABELS[r % FAKE_LABELS.length];
      } else {
        // Numeric data
        const base = Math.floor(Math.random() * 999000) + 1000;
        val = r % 5 === 0 ? `=SUM(${COLS[c]}2:${COLS[c]}${r})` :
              `${(base).toLocaleString()}`;
      }
      cols.push(val);
    }
    rows.push(cols);
  }
  return rows;
}

/* ── Falling word (positioned to a spreadsheet cell) ────────────────────── */
let wordId = 0;
function spawnWord() {
  const d  = getDiff(G.level - 1);
  const pool = WORDS[d.tier];
  let word, tries = 0;
  do {
    word = pool[Math.floor(Math.random() * pool.length)];
    tries++;
  } while (G.usedWords.has(word) && tries < 30);
  G.usedWords.add(word);
  if (G.usedWords.size > pool.length * 0.7) G.usedWords.clear();

  // Pick a random column (avoid col 0 which is narrow)
  const colIdx = 1 + Math.floor(Math.random() * (COLS.length - 1));
  const speed  = d.speedMin + Math.random() * (d.speedMax - d.speedMin);

  G.words.push({
    id: ++wordId,
    text: word,
    colIdx,               // which column it falls in
    y: -ROW_H,            // canvas y position
    speed,
    typed: 0,
    active: false,
    dying: false,
    dieTimer: 0,
    flashTimer: 0,        // cell flash on complete
    flashColor: XL.complete,
  });
}

/* ── Layout ──────────────────────────────────────────────────────────────── */
const TOTAL_FIXED = 30 + 28 + 26 + 26; // titlebar + ribbon + formulabar + tabs

function resize() {
  buildColX();
  const W = window.innerWidth;
  const H = window.innerHeight - TOTAL_FIXED;
  canvas.width  = W;
  canvas.height = Math.max(H, 100);
  canvas.style.top  = '0px';
  canvas.style.left = '0px';
}
window.addEventListener('resize', resize);

/* ── Persistence ─────────────────────────────────────────────────────────── */
const getBest  = () => parseInt(localStorage.getItem('ws_best') || '0');
const saveBest = s  => { if (s > getBest()) localStorage.setItem('ws_best', s); };
function updateTitleBest() {
  const b = getBest();
  $('title-best').textContent = b > 0 ? `Personal Best: ${b.toLocaleString()} pts` : '';
}
updateTitleBest();

/* ── Buttons ─────────────────────────────────────────────────────────────── */
['btn-easy','btn-medium','btn-hard'].forEach(id => {
  const diff = id.replace('btn-','');
  $(id).onclick = () => launchGame(diff);
  $(id).addEventListener('touchstart', e => { e.preventDefault(); launchGame(diff); }, {passive:false});
});
$('btn-retry').onclick = () => launchGame(selectedDifficulty);
$('btn-menu').onclick  = () => { stopGame(); showScreen('screen-title'); };

function launchGame(diff) {
  selectedDifficulty = diff;
  // Update fake filename in titlebar
  const names = { easy:'DataEntry_Trainee.xlsx', medium:'Q4_Budget_Reconciliation.xlsx', hard:'URGENT_AuditReport_FINAL_v3.xlsx' };
  $('xl-filename').textContent = `${names[diff]} — Microsoft Excel`;
  $('sheet-tab-name').textContent = diff === 'easy' ? 'DataEntry' : diff === 'medium' ? 'Q4_Budget' : 'AuditReport';
  startGame();
}

/* ── Start / Stop ─────────────────────────────────────────────────────────── */
function startGame() {
  stopGame();
  G = freshState();
  buildColX();
  resize();
  showScreen('screen-game');
  $('mobile-focus-btn').style.display = isMobile() ? 'block' : 'none';
  updateHUD();
  hiddenInput.value = '';
  hiddenInput.focus({ preventScroll:true });
  lastTs = performance.now();
  animId = requestAnimationFrame(loop);
}
function stopGame() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
}
function isMobile() { return 'ontouchstart' in window || window.innerWidth <= 700; }

/* ── Input ───────────────────────────────────────────────────────────────── */
hiddenInput.addEventListener('input', () => {
  if (!G || G.phase !== 'playing') return;
  const raw = hiddenInput.value; hiddenInput.value = '';
  for (const ch of raw) handleChar(ch);
});
hiddenInput.addEventListener('keydown', e => {
  if (!G || G.phase !== 'playing') return;
  if (e.key === 'Backspace') {
    if (G.typed.length > 0) {
      G.typed = G.typed.slice(0,-1);
      if (G.targetWord) {
        G.targetWord.typed = G.typed.length;
        if (!G.typed.length) { G.targetWord.active=false; G.targetWord=null; }
      }
      updateInputDisplay();
    }
    e.preventDefault();
  }
  if (e.key === 'Escape') {
    if (G.targetWord) { G.targetWord.active=false; G.targetWord.typed=0; G.targetWord=null; }
    G.typed=''; updateInputDisplay();
  }
});

canvas.addEventListener('click', e => {
  if (!G || G.phase !== 'playing') return;
  hiddenInput.focus({preventScroll:true});
  const rect = canvas.getBoundingClientRect();
  tapAt(e.clientX-rect.left, e.clientY-rect.top);
});
canvas.addEventListener('touchstart', e => {
  if (!G || G.phase !== 'playing') return;
  e.preventDefault(); hiddenInput.focus({preventScroll:true});
  const rect=canvas.getBoundingClientRect(),t=e.changedTouches[0];
  tapAt(t.clientX-rect.left, t.clientY-rect.top);
},{passive:false});

function tapAt(mx,my) {
  let best=null, bestD=60;
  for (const w of G.words) {
    if (w.dying) continue;
    const wx = colX[w.colIdx];
    const cellY = w.y + COL_HDR_H;
    if (mx >= wx && mx <= wx + COL_WIDTHS[w.colIdx] && my >= cellY-4 && my <= cellY+ROW_H+4) {
      const d = Math.abs(my - (cellY + ROW_H/2));
      if (d < bestD) { bestD=d; best=w; }
    }
  }
  if (best) {
    if (G.targetWord && G.targetWord!==best) { G.targetWord.active=false; G.targetWord.typed=0; }
    G.targetWord=best; best.active=true; G.typed=''; best.typed=0;
    updateInputDisplay();
  }
}

function handleChar(ch) {
  if (!ch) return;
  const lower = ch.toLowerCase();
  if (!/[a-z]/.test(lower)) return;

  if (G.targetWord) {
    const w = G.targetWord;
    if (lower === w.text[w.typed]) {
      w.typed++; G.typed+=lower;
      G.totalCharsTyped++;   // count correct keystrokes for WPM
      if (w.typed === w.text.length) { destroyWord(w); return; }
    } else {
      // Wrong char — briefly redden the cell
      w.flashColor = XL.miss; w.flashTimer = 0.18;
    }
    updateInputDisplay(); return;
  }

  // Auto-target: pick word starting with this char, lowest on screen
  const candidates = G.words.filter(w => !w.dying && w.text[0]===lower);
  if (!candidates.length) { flashFormula(); return; }
  candidates.sort((a,b) => b.y-a.y);
  const t = candidates[0];
  G.targetWord=t; t.active=true; t.typed=1; G.typed=lower;
  G.totalCharsTyped++;  // first char counts too
  if (t.typed===t.text.length) { destroyWord(t); return; }
  updateInputDisplay();
}

function updateInputDisplay() {
  if (!G) return;
  // Show like an Excel formula
  const prefix = G.targetWord ? `="${G.typed}` : G.typed ? `="${G.typed}` : '';
  inputDisp.textContent = prefix;
  // Update cell reference
  if (G.targetWord) {
    const col = COLS[G.targetWord.colIdx] || 'A';
    const row = Math.max(1, Math.floor(G.targetWord.y / ROW_H) + 1);
    $('cell-ref').textContent = `${col}${row}`;
  } else {
    $('cell-ref').textContent = 'A1';
  }
}

function flashFormula() {
  inputDisp.style.color = '#c00000';
  setTimeout(()=>{ inputDisp.style.color=''; }, 200);
}

/* ── Destroy word ────────────────────────────────────────────────────────── */
function destroyWord(w) {
  w.dying=true; w.dieTimer=0.3;
  w.flashColor=XL.complete; w.flashTimer=0.3;
  G.words=G.words.filter(x=>x!==w);

  const d=getDiff(G.level-1);
  const mult=1+Math.min(G.combo,8)*0.25;
  G.score+=Math.round(d.scoreBase*w.text.length*mult);
  G.combo++; G.comboTimer=2.5; G.maxCombo=Math.max(G.maxCombo,G.combo);
  G.wordsDestroyed++;

  if (G.targetWord===w) { G.targetWord=null; }
  G.typed=''; updateInputDisplay();

  // Subtle green cell ripple particle
  spawnCellFlash(w.colIdx, w.y, XL.complete);
  flashOverlay('gold');
  bumpScore();
  updateHUD();

  const newLevel = 1+Math.floor(G.score/getDiff(G.level-1).lvUpPts);
  if (newLevel>G.level) { G.level=Math.min(newLevel,20); updateHUD(); }
}

/* ── Word missed ─────────────────────────────────────────────────────────── */
function wordMissed(w) {
  G.lives--; G.combo=0; G.comboTimer=0; G.wordsMissed++;
  if (G.targetWord===w) { G.targetWord=null; G.typed=''; updateInputDisplay(); }
  G.words=G.words.filter(x=>x!==w);
  flashOverlay('red');
  G.screenShake=5;
  updateHUD();
  if (G.lives<=0) { G.lives=0; setTimeout(()=>gameOver(),500); }
}

/* ── HUD ─────────────────────────────────────────────────────────────────── */
function updateHUD() {
  if (!G) return;
  // Ribbon stats
  $('ribbon-score').textContent = G.score.toLocaleString();
  $('ribbon-level').textContent = G.level;
  $('ribbon-errors').textContent= G.wordsMissed;
  // Status bar
  const lifeStr = '●'.repeat(G.lives) + '○'.repeat(3-G.lives);
  $('statusbar-lives').textContent = lifeStr;
  $('statusbar-lives').style.color = G.lives>1?'#217346':G.lives===1?'#c55a11':'#c00000';
  $('statusbar-text').textContent  = G.phase==='playing' ? 'Ready' : 'Calculating...';
  $('statusbar-combo').textContent = G.combo>=2 ? `Streak: ${G.combo}` : '';
}

function bumpScore() {
  const el=$('ribbon-score');
  el.style.fontWeight='900'; el.style.color='#1a5c38';
  setTimeout(()=>{ el.style.fontWeight=''; el.style.color=''; },200);
}
function flashOverlay(type) {
  const el=$('flash-overlay');
  el.className=''; void el.offsetWidth;
  el.className=type==='red'?'flash-red':'flash-gold';
}

/* ── Cell flash particles ────────────────────────────────────────────────── */
function spawnCellFlash(colIdx, y, color) {
  G.particles.push({ colIdx, y, color, life:0.4, maxLife:0.4 });
}
function tickParticles(dt) {
  for (let i=G.particles.length-1;i>=0;i--) {
    G.particles[i].life-=dt;
    if (G.particles[i].life<=0) G.particles.splice(i,1);
  }
}

/* ── Game over ───────────────────────────────────────────────────────────── */
function gameOver() {
  if (!G||G.phase==='dead') return;
  G.phase='dead'; stopGame(); saveBest(G.score); updateTitleBest();

  // WPM: standard definition = (chars typed / 5) / minutes elapsed
  const elapsedMin = Math.max(0.05, (Date.now() - G.startTime) / 60000);
  const wpm = Math.round((G.totalCharsTyped / 5) / elapsedMin);

  $('over-score').textContent = G.score.toLocaleString();
  const best=getBest();
  $('over-best').textContent = G.score>=best?'★ New personal best!':'Best: '+best.toLocaleString()+' pts';
  const diffNames={easy:'Easy — DataEntry Trainee',medium:'Medium — Q4 Budget',hard:'Hard — Audit Report FINAL'};
  $('over-diff-text').textContent = diffNames[selectedDifficulty]||'';
  $('over-icon').textContent = G.score>2000?'✅':G.score>800?'📋':'⚠';
  $('over-title').textContent = G.score>2000?'Excellent Work!':G.score>800?'Session Complete':'Data Entry Failed';
  $('over-stats').innerHTML=[
    {v:G.wordsDestroyed, l:'Entries'},
    {v:G.maxCombo,       l:'Max Streak'},
    {v:wpm + ' WPM',     l:'Typing Speed'},
    {v:G.level,          l:'Level Reached'},
    {v:G.wordsMissed,    l:'Errors'},
    {v:Math.round(elapsedMin*60)+'s', l:'Time'},
  ].map(s=>`<div class="es-box"><div class="es-val">${s.v}</div><div class="es-lbl">${s.l}</div></div>`).join('');
  showScreen('screen-over');
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN LOOP
═══════════════════════════════════════════════════════════════════════════ */
function loop(ts) {
  animId=requestAnimationFrame(loop);
  const dt=Math.min((ts-lastTs)/1000,.05); lastTs=ts;
  if (!G||G.phase==='dead') return;
  update(dt); draw();
}

function update(dt) {
  const d=getDiff(G.level-1);
  if (G.combo>0) { G.comboTimer-=dt; if(G.comboTimer<=0){G.combo=0;updateHUD();} }
  G.screenShake=Math.max(0,G.screenShake-dt*25);

  // Spawn
  G.spawnTimer+=dt*1000;
  if (G.spawnTimer>=d.spawnInterval && G.words.filter(w=>!w.dying).length<d.maxOnScreen) {
    G.spawnTimer=0; spawnWord();
  }

  // Move words
  for (let i=G.words.length-1;i>=0;i--) {
    const w=G.words[i]; if (w.dying) continue;
    w.y+=w.speed*dt;
    if (w.flashTimer>0) w.flashTimer=Math.max(0,w.flashTimer-dt);
    if (w.y>canvas.height-COL_HDR_H) wordMissed(w);
  }

  tickParticles(dt);
}

/* ═══════════════════════════════════════════════════════════════════════════
   DRAW — Spreadsheet
═══════════════════════════════════════════════════════════════════════════ */
function draw() {
  const W=canvas.width, H=canvas.height;
  const sx=G.screenShake>0?(Math.random()-.5)*G.screenShake:0;
  const sy=G.screenShake>0?(Math.random()-.5)*G.screenShake*.4:0;
  ctx.save();
  ctx.translate(sx,sy);

  // White sheet background
  ctx.fillStyle=XL.sheet; ctx.fillRect(0,0,W,H);

  // Draw static background data (fake spreadsheet content)
  drawBgData(W,H);

  // Column header row
  drawColHeaders(W);

  // Cell flash particles (subtle background highlight)
  drawParticles();

  // Falling word cells
  for (const w of G.words) drawWordCell(w);

  // Row numbers (drawn on top of everything, left column)
  drawRowNumbers(H);

  ctx.restore();
}

/* ── Background data (static, scrolls with the game for ambiance) ────────── */
function drawBgData(W, H) {
  ctx.font=CELL_FONT;
  ctx.textBaseline='middle';

  const visRows=Math.ceil(H/ROW_H)+2;
  for (let r=0;r<Math.min(visRows,G.bgData.length);r++) {
    const ry=COL_HDR_H+r*ROW_H;

    // Row stripe
    if (r%2===0) { ctx.fillStyle='#fafafa'; ctx.fillRect(COL_NUM_W,ry,W-COL_NUM_W,ROW_H); }

    // Horizontal grid line
    ctx.strokeStyle=XL.border2; ctx.lineWidth=.5;
    ctx.beginPath(); ctx.moveTo(0,ry+ROW_H); ctx.lineTo(W,ry+ROW_H); ctx.stroke();

    // Row data
    const row=G.bgData[r]||[];
    for (let c=0;c<COLS.length;c++) {
      const cx=colX[c], cw=COL_WIDTHS[c];
      // Vertical line
      ctx.strokeStyle=XL.border2;
      ctx.beginPath(); ctx.moveTo(cx,ry); ctx.lineTo(cx,ry+ROW_H); ctx.stroke();

      const val=String(row[c]||'');
      const isHeader=r===0;
      const isNum=!isNaN(val.replace(/,/g,''))&&val.length>0&&!val.startsWith('=');
      const isFormula=val.startsWith('=');

      ctx.fillStyle=isHeader?XL.hdrText:isFormula?'#1e6fcc':isNum?XL.text:XL.dim;
      if (isHeader) ctx.font='bold 11px -apple-system,"Segoe UI",Arial,sans-serif';
      else ctx.font=CELL_FONT;

      // Clip and draw
      ctx.save();
      ctx.rect(cx+2,ry,cw-4,ROW_H); ctx.clip();
      const tx=isNum||isFormula?cx+cw-4:cx+4;
      ctx.textAlign=isNum||isFormula?'right':'left';
      ctx.globalAlpha=isHeader?0.75:0.35;
      ctx.fillText(val, tx, ry+ROW_H/2+1);
      ctx.restore();
      ctx.globalAlpha=1;
    }
  }
}

/* ── Column header row ───────────────────────────────────────────────────── */
function drawColHeaders(W) {
  // Header background
  ctx.fillStyle=XL.hdr; ctx.fillRect(0,0,W,COL_HDR_H);
  ctx.strokeStyle=XL.border; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,COL_HDR_H); ctx.lineTo(W,COL_HDR_H); ctx.stroke();

  // Row-number corner
  ctx.fillStyle=XL.hdr2; ctx.fillRect(0,0,COL_NUM_W,COL_HDR_H);
  ctx.strokeStyle=XL.border;
  ctx.beginPath(); ctx.moveTo(COL_NUM_W,0); ctx.lineTo(COL_NUM_W,COL_HDR_H); ctx.stroke();

  // Column letters
  ctx.font=`bold 11px -apple-system,"Segoe UI",Arial,sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  for (let c=0;c<COLS.length;c++) {
    const cx=colX[c], cw=COL_WIDTHS[c];
    // Highlight column of active word
    if (G&&G.targetWord&&G.targetWord.colIdx===c) {
      ctx.fillStyle=XL.selBg; ctx.fillRect(cx,0,cw,COL_HDR_H);
      ctx.fillStyle=XL.selBord;
    } else {
      ctx.fillStyle=XL.hdrText;
    }
    ctx.fillText(COLS[c], cx+cw/2, COL_HDR_H/2+1);
    ctx.strokeStyle=XL.border; ctx.lineWidth=.5;
    ctx.beginPath(); ctx.moveTo(cx+cw,0); ctx.lineTo(cx+cw,COL_HDR_H); ctx.stroke();
  }
}

/* ── Row numbers (left gutter) ───────────────────────────────────────────── */
function drawRowNumbers(H) {
  ctx.fillStyle=XL.hdr;
  ctx.fillRect(0,COL_HDR_H,COL_NUM_W,H-COL_HDR_H);
  ctx.strokeStyle=XL.border; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(COL_NUM_W,COL_HDR_H); ctx.lineTo(COL_NUM_W,H); ctx.stroke();

  ctx.font=CELL_FONT;
  ctx.textAlign='right'; ctx.textBaseline='middle';
  const visRows=Math.ceil(H/ROW_H)+2;
  for (let r=0;r<visRows;r++) {
    const ry=COL_HDR_H+r*ROW_H;
    // Highlight row of active word
    if (G&&G.targetWord) {
      const tRow=Math.floor(G.targetWord.y/ROW_H);
      if (r===tRow) { ctx.fillStyle=XL.selBg; ctx.fillRect(0,ry,COL_NUM_W,ROW_H); }
    }
    ctx.fillStyle=XL.rowNum;
    ctx.fillText(r+1, COL_NUM_W-4, ry+ROW_H/2+1);
    ctx.strokeStyle=XL.border2; ctx.lineWidth=.5;
    ctx.beginPath(); ctx.moveTo(0,ry+ROW_H); ctx.lineTo(COL_NUM_W,ry+ROW_H); ctx.stroke();
  }
}

/* ── Draw a falling word inside a spreadsheet cell ───────────────────────── */
function drawWordCell(w) {
  const cx  = colX[w.colIdx];
  const cw  = COL_WIDTHS[w.colIdx];
  const cy  = w.y + COL_HDR_H;
  const isDanger = w.y > canvas.height - COL_HDR_H - ROW_H * 3;
  const isActive = w.active;

  // ── Drop shadow — lifts the cell off the sheet background ──
  ctx.save();
  ctx.shadowColor = isDanger ? 'rgba(192,0,0,.22)' : isActive ? 'rgba(30,111,204,.2)' : 'rgba(0,0,0,.14)';
  ctx.shadowBlur  = 6;
  ctx.shadowOffsetY = 2;

  // ── Cell background — tinted so it clearly differs from the white sheet ──
  let bg;
  if (w.flashTimer > 0)     bg = w.flashColor;
  else if (isActive)        bg = XL.wordBgAct;
  else if (isDanger)        bg = XL.wordBgDngr;
  else                      bg = XL.wordBg;   // light yellow — always visible

  ctx.fillStyle = bg;
  ctx.fillRect(cx, cy, cw, ROW_H);
  ctx.shadowColor = 'transparent'; // reset shadow before drawing borders
  ctx.restore();

  // ── Cell border — thicker and coloured, not just a hairline ──
  const bCol = isActive ? XL.wordBordAct : isDanger ? XL.wordBordDngr : XL.wordBord;
  ctx.strokeStyle = bCol;
  ctx.lineWidth   = isActive || isDanger ? 2 : 1.5;
  ctx.strokeRect(cx + .5, cy + .5, cw - 1, ROW_H - 1);

  // ── Danger left accent bar ──
  if (isDanger) {
    ctx.fillStyle = XL.danger;
    ctx.fillRect(cx, cy, 3, ROW_H);
  }

  // ── Active column header highlight ──
  if (isActive) {
    ctx.fillStyle = 'rgba(30,111,204,.08)';
    ctx.fillRect(cx, 0, cw, COL_HDR_H);
    ctx.strokeStyle = XL.wordBordAct; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, COL_HDR_H);
    ctx.moveTo(cx + cw, 0); ctx.lineTo(cx + cw, COL_HDR_H);
    ctx.stroke();
  }

  // ── Word text — typed chars in bold blue, remaining in near-black ──
  ctx.save();
  ctx.rect(cx + 3, cy, cw - 6, ROW_H); ctx.clip();
  const textY = cy + ROW_H / 2 + 1;
  let tx = cx + 5;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';

  for (let i = 0; i < w.text.length; i++) {
    const ch = w.text[i];
    if (i < w.typed) {
      ctx.font      = 'bold 13px "Courier New",monospace';
      ctx.fillStyle = XL.typed;
    } else {
      ctx.font      = '13px "Courier New",monospace';
      ctx.fillStyle = isDanger ? XL.danger : XL.text;
    }
    ctx.fillText(ch, tx, textY);
    tx += ctx.measureText(ch).width;
  }

  // Blinking cursor after typed portion
  if (isActive && w.typed < w.text.length && Math.floor(Date.now() / 400) % 2 === 0) {
    ctx.save();
    ctx.font = 'bold 13px "Courier New",monospace';
    const cursorX = cx + 5 + ctx.measureText(w.text.slice(0, w.typed)).width;
    ctx.fillStyle = XL.wordBordAct;
    ctx.fillRect(cursorX, cy + 4, 2, ROW_H - 8);
    ctx.restore();
  }
  ctx.restore();

  // ── Progress bar at cell bottom — fills red as word nears bottom ──
  const dangerDepth = Math.min(1, Math.max(0, (w.y - (canvas.height - COL_HDR_H - ROW_H * 6)) / (ROW_H * 4)));
  if (dangerDepth > 0) {
    ctx.fillStyle = `rgba(192,0,0,${dangerDepth * 0.7})`;
    ctx.fillRect(cx, cy + ROW_H - 2, cw * dangerDepth, 2);
  }
}

/* ── Cell flash particles ────────────────────────────────────────────────── */
function drawParticles() {
  for (const p of G.particles) {
    const a=p.life/p.maxLife;
    const cx=colX[p.colIdx], cw=COL_WIDTHS[p.colIdx];
    const cy=p.y+COL_HDR_H;
    ctx.fillStyle=p.color; ctx.globalAlpha=a*0.5;
    ctx.fillRect(cx, cy, cw, ROW_H);
    ctx.globalAlpha=1;
  }
}

window.addEventListener('load', () => { updateTitleBest(); });
