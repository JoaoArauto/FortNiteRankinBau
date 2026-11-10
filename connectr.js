const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execSync, spawn } = require('child_process');

console.log('========================================================');
console.log('  FORTNITE CHEST RANKING - CONNECTR (GITHUB PAGES)');
console.log('========================================================\n');

// Detecta o diretório do repositório
const possibleRepoDirs = [
  __dirname,
  path.join(os.homedir(), 'Documents', 'ChestRanking'),
  path.join(os.homedir(), 'Downloads', 'ChestRanking')
];
const repoDir = possibleRepoDirs.find(d => fs.existsSync(path.join(d, 'ranking_db.json')) || fs.existsSync(path.join(d, '.git'))) || __dirname;
const DB_FILE = path.join(repoDir, 'ranking_db.json');
const LOCAL_CHEST_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'ChestCounter');

// 1. Procura e inicia o ChestCounter / ChestTracker se ainda não estiver aberto
function launchChestTracker() {
  try {
    const tasklist = execSync('tasklist', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (/chestcounter|chesttracker/i.test(tasklist)) {
      console.log('[+] ChestCounter / ChestTracker ja esta aberto e rodando!');
      return;
    }
  } catch (e) {}

  const candidates = [
    path.join(os.homedir(), 'Downloads', 'ChestCounter.exe'),
    path.join(os.homedir(), 'Downloads', 'ChestTracker.exe'),
    path.join(os.homedir(), 'Desktop', 'ChestCounter.exe'),
    path.join(os.homedir(), 'Desktop', 'ChestTracker.exe'),
    path.join(__dirname, 'ChestCounter.exe'),
    path.join(__dirname, 'ChestTracker.exe')
  ];

  const found = candidates.find(p => fs.existsSync(p));
  if (found) {
    console.log(`[*] Abrindo ${path.basename(found)} automaticamente (${found})...`);
    try {
      const child = spawn(found, [], { detached: true, stdio: 'ignore' });
      child.unref();
      console.log('[+] ChestCounter iniciado com sucesso!\n');
    } catch (err) {
      console.error('[!] Erro ao iniciar ChestCounter:', err.message);
    }
  } else {
    console.log('[!] ChestCounter.exe nao foi encontrado nas pastas comuns. Por favor, abra-o manualmente se for jogar.\n');
  }
}

launchChestTracker();

// 2. Classificação dos prêmios oficiais da Caça à Loja Pirata
function classifyPrizes(treasuresList) {
  const prizes = {
    goldOutfit: false,
    pirateShop: false,
    vehicle: false,
    pickaxe: false,
    jamTrack: false,
    loadingScreen: false,
    gizmosCount: 0
  };
  for (const t of (treasuresList || [])) {
    const raw = (typeof t === 'string' ? t : (t.item || '')).toLowerCase();
    if (!raw) continue;
    if (raw.includes('loading screen') || raw.includes('plunder in paradise') || raw.includes('so kawaii') || raw.includes('dpid_item2') || raw.includes('dpid_item17')) {
      prizes.loadingScreen = true;
    } else if (raw.includes('music track') || raw.includes('jam track') || raw.includes('no trespassing') || raw.includes('london') || raw.includes('dpid_item4') || raw.includes('dpid_item16')) {
      prizes.jamTrack = true;
    } else if (raw.includes('pickaxe') || raw.includes('gauntlet') || raw.includes('dpid_item1')) {
      prizes.pickaxe = true;
    } else if (raw.includes('vehicle') || raw.includes('mercedes') || raw.includes('cadillac') || raw.includes('dpid_item3') || raw.includes('dpid_item15')) {
      prizes.vehicle = true;
    } else if (raw.includes('pirate shop') || raw.includes('shop')) {
      prizes.pirateShop = true;
    } else if (raw.includes('gold outfit') || raw.includes('outfit') || raw.includes('skin') || raw.includes('uzi')) {
      prizes.goldOutfit = true;
    } else {
      prizes.gizmosCount++;
    }
  }
  return prizes;
}

// 3. Monta resumo do jogador
function buildPlayerSummary({ player, pcName, matches, treasuresList, overlayTotal, inProgress, sessionText }) {
  let totalChests = 0;
  let totalAmmo = 0;
  let wins = 0;
  let bestMatch = 0;

  for (const m of matches) {
    totalChests += m.chests;
    totalAmmo += m.ammo;
    if (m.placement === 1) wins++;
    if (m.chests > bestMatch) bestMatch = m.chests;
  }

  const matchesCount = matches.length;
  const avgChests = matchesCount > 0 ? +(totalChests / matchesCount).toFixed(1) : 0;
  const todayPrefix = new Date().toISOString().slice(0, 10);
  const todayChests = matches
    .filter(m => m.date && m.date.startsWith(todayPrefix))
    .reduce((sum, m) => sum + m.chests, 0);
  const last5Chests = matches.slice(-5).reduce((sum, m) => sum + m.chests, 0);

  return {
    id: player.toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
    player,
    pcName: pcName || '',
    totalChests: overlayTotal !== null && overlayTotal > totalChests ? overlayTotal : totalChests,
    totalAmmo,
    matchesCount,
    wins,
    bestMatch,
    avgChests,
    todayChests,
    last5Chests,
    treasuresCount: treasuresList.length,
    treasuresList: treasuresList.slice(-25).reverse(),
    prizes: classifyPrizes(treasuresList),
    inProgress: !!inProgress,
    sessionText: sessionText || '',
    lastMatch: matchesCount > 0 ? matches[matchesCount - 1] : null,
    recentMatches: matches.slice(-15).reverse(),
    lastUpdated: new Date().toISOString(),
    lastUpdatedMs: Date.now()
  };
}

function broadcastToCloud(summary) {
  try {
    const req = https.request('https://ntfy.sh/fortnite_chestranking_nutellas_data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
    req.on('error', () => {});
    req.write(JSON.stringify(summary));
    req.end();
  } catch (e) {}
}

let lastCsvHash = '';
let isSyncing = false;

async function syncData() {
  if (isSyncing) return;
  const csvPath = path.join(LOCAL_CHEST_DIR, 'matches.csv');
  if (!fs.existsSync(csvPath)) {
    console.log('[!] matches.csv ainda nao encontrado em ' + LOCAL_CHEST_DIR + '. Jogue uma partida com ChestCounter aberto!');
    return;
  }

  let csvContent = '';
  try {
    csvContent = fs.readFileSync(csvPath, 'utf8');
  } catch (e) {
    return;
  }

  let overlayHtml = '';
  const overlayPath = path.join(LOCAL_CHEST_DIR, 'overlay.html');
  if (fs.existsSync(overlayPath)) {
    try { overlayHtml = fs.readFileSync(overlayPath, 'utf8'); } catch (e) {}
  }

  const currentHash = `${csvContent.length}_${csvContent.slice(-120)}_${overlayHtml.slice(0, 100)}`;
  if (currentHash === lastCsvHash) {
    return; // Sem alterações
  }

  isSyncing = true;
  try {
    const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let player = 'Jogador';
    const matches = [];
    const treasuresList = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(';');
      if (parts.length < 6) continue;
      const [date, mode, pName, placementStr, playersStr, chestsStr, ammoStr, treasuresStr, replayFile] = parts;
      if (pName) player = pName;

      if (treasuresStr && treasuresStr.trim()) {
        treasuresStr.split(',').map(s => s.trim()).filter(Boolean).forEach(item => {
          treasuresList.push({ date, item });
        });
      }

      matches.push({
        date,
        mode,
        player: pName,
        placement: parseInt(placementStr, 10) || 0,
        totalPlayers: parseInt(playersStr, 10) || 0,
        chests: parseInt(chestsStr, 10) || 0,
        ammo: parseInt(ammoStr, 10) || 0,
        treasures: treasuresStr || '',
        file: replayFile || ''
      });
    }

    let inProgress = false;
    let sessionText = '';
    let overlayTotal = null;
    if (overlayHtml) {
      inProgress = /MATCH IN PROGRESS/i.test(overlayHtml);
      const totMatch = overlayHtml.match(/class="big total">([0-9.,]+)</i);
      if (totMatch) overlayTotal = parseInt(totMatch[1].replace(/[,.]/g, ''), 10);
      const sessMatch = overlayHtml.match(/<span>Session<\/span><b>([^<]+)<small>([^<]+)<\/small><\/b>/i);
      if (sessMatch) sessionText = `${sessMatch[1].trim()} (${sessMatch[2].replace(/&#183;/g, '·').trim()})`;
    }

    const summary = buildPlayerSummary({
      player,
      pcName: os.hostname(),
      matches,
      treasuresList,
      overlayTotal,
      inProgress,
      sessionText
    });

    // 1. Atualiza ranking_db.json no repositório
    let db = { players: {}, publicUrl: null, manualChecks: {}, treasureHourMode: 'auto' };
    if (fs.existsSync(DB_FILE)) {
      try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) {}
    }
    if (!db.players) db.players = {};
    db.players[summary.id] = summary;
    db.updatedAt = new Date().toISOString();

    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {}

    const nowStr = new Date().toLocaleTimeString('pt-BR');
    console.log(`[${nowStr}] Partidas processadas! Nick: ${summary.player} | Baus: ${summary.totalChests} | Partidas: ${summary.matchesCount}`);

    // 2. Broadcast instantâneo para a nuvem (GitHub Pages e OBS recebem em 0.5s)
    broadcastToCloud(summary);

    // 3. Push para o repositório GitHub se o Git estiver disponível
    try {
      if (fs.existsSync(path.join(repoDir, '.git'))) {
        execSync('git add ranking_db.json index.html public/index.html', { cwd: repoDir, stdio: 'ignore' });
        const status = execSync('git status --porcelain', { cwd: repoDir, encoding: 'utf8' });
        if (status.includes('ranking_db.json')) {
          execSync(`git commit -m "sync: ${summary.player} (${summary.totalChests} baus)"`, { cwd: repoDir, stdio: 'ignore' });
          console.log(`[*] Enviando estatisticas para o GitHub...`);
          execSync('git push origin main', { cwd: repoDir, stdio: 'ignore' });
          console.log(`[+] SINCRONIZADO COM GITHUB COM SUCESSO! Site e OBS atualizados ao vivo!\n`);
        }
      }
    } catch (gitErr) {}

    lastCsvHash = currentHash;
  } catch (err) {
    console.error('[!] Erro ao processar:', err.message);
  } finally {
    isSyncing = false;
  }
}

console.log('[*] Monitorando seus baus em tempo real... Mantenha esta janela aberta!\n');
syncData();
setInterval(syncData, 5000);
