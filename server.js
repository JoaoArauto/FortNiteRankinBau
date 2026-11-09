const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const https = require('https');
const net = require('net');
const PORT = process.env.PORT || 3000;
const DISCOVERY_TOPIC = 'chestranking_thenutellas_v1';

// Publica a URL atual do túnel na nuvem para que o connectr.bat sempre descubra o link novo sozinho!
function publishUrlToCloud(url) {
  if (!url) return;
  try {
    const req = https.request(`https://ntfy.sh/${DISCOVERY_TOPIC}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
    req.on('error', () => {});
    req.write(url);
    req.end();
  } catch (e) {}
}
const DB_FILE = path.join(__dirname, 'ranking_db.json');
const LOCAL_CHEST_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'ChestCounter');

// Estado em memória + persistência em disco
let db = { players: {}, publicUrl: null, manualChecks: {}, treasureHourMode: 'auto' };
if (fs.existsSync(DB_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db = { players: {}, publicUrl: null, manualChecks: {}, treasureHourMode: 'auto', ...loaded };
  } catch (e) {
    console.error('Erro ao ler ranking_db.json, iniciando novo:', e.message);
  }
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('Erro ao salvar DB:', e.message);
  }
}

// Clientes SSE conectados para atualização em tempo real
const sseClients = new Set();

function broadcastUpdate() {
  const payload = JSON.stringify(getPublicState());
  for (const res of sseClients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch (e) {
      sseClients.delete(res);
    }
  }
}

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

function getPublicState() {
  const now = Date.now();
  const playersList = Object.values(db.players || {}).map(p => ({
    ...p,
    isOnline: (now - (p.lastUpdatedMs || 0)) < 120000 // online se enviou nos últimos 2 min
  }));

  return {
    updatedAt: new Date().toISOString(),
    publicUrl: db.publicUrl || null,
    localUrls: getLocalIPs().map(ip => `http://${ip}:${PORT}`),
    manualChecks: db.manualChecks || {},
    treasureHourMode: db.treasureHourMode || 'auto',
    players: playersList
  };
}

// Classifica automaticamente os tesouros encontrados pelo ChestCounter nas 7 categorias oficiais
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
    if (raw.includes('loading screen') || raw.includes('plunder in paradise') || raw.includes('dpid_item2')) {
      prizes.loadingScreen = true;
    } else if (raw.includes('music track') || raw.includes('jam track') || raw.includes('no trespassing') || raw.includes('dpid_item4')) {
      prizes.jamTrack = true;
    } else if (raw.includes('pickaxe') || raw.includes('gauntlet') || raw.includes('dpid_item1')) {
      prizes.pickaxe = true;
    } else if (raw.includes('vehicle') || raw.includes('mercedes') || raw.includes('dpid_item3')) {
      prizes.vehicle = true;
    } else if (raw.includes('pirate shop') || raw.includes('shop')) {
      prizes.pirateShop = true;
    } else if (raw.includes('gold outfit') || raw.includes('outfit') || raw.includes('skin')) {
      prizes.goldOutfit = true;
    } else {
      // Gizmos (Treasure gizmo, Golden firework, Extraction accelerator, etc.) podem repetir
      prizes.gizmosCount++;
    }
  }
  return prizes;
}

// Parser universal para dados vindos de matches.csv + overlay.html ou payload JSON direto
function parseChestCounterSubmission(body) {
  // Se o cliente enviou matchesCsv bruto (ex: script PowerShell ou upload)
  if (typeof body.matchesCsv === 'string') {
    const lines = body.matchesCsv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let player = body.player || '';
    let totalChests = 0;
    let totalAmmo = 0;
    let matchesCount = 0;
    let wins = 0;
    let bestMatch = 0;
    let treasuresCount = 0;
    const treasuresList = [];
    const matches = [];

    // Cabeçalho esperado: date;mode;player;placement;players;chests;ammo_boxes;treasures;file
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(';');
      if (parts.length < 6) continue;
      const [date, mode, pName, placementStr, playersStr, chestsStr, ammoStr, treasuresStr, replayFile] = parts;
      const chests = parseInt(chestsStr, 10) || 0;
      const ammo = parseInt(ammoStr, 10) || 0;
      const placement = parseInt(placementStr, 10) || 0;
      const totalPlayers = parseInt(playersStr, 10) || 0;

      if (pName && !player) player = pName;
      if (pName) player = pName; // pega sempre o nick mais recente

      totalChests += chests;
      totalAmmo += ammo;
      matchesCount++;
      if (placement === 1) wins++;
      if (chests > bestMatch) bestMatch = chests;

      if (treasuresStr && treasuresStr.trim()) {
        const items = treasuresStr.split(',').map(s => s.trim()).filter(Boolean);
        treasuresCount += items.length;
        items.forEach(item => treasuresList.push({ date, item }));
      }

      matches.push({
        date,
        mode,
        player: pName,
        placement,
        totalPlayers,
        chests,
        ammo,
        treasures: treasuresStr || '',
        file: replayFile || ''
      });
    }

    // Extrai estado ao vivo do overlay.html se disponível
    let inProgress = false;
    let sessionText = '';
    let overlayTotal = null;
    if (typeof body.overlayHtml === 'string' && body.overlayHtml) {
      inProgress = /MATCH IN PROGRESS/i.test(body.overlayHtml);
      const totMatch = body.overlayHtml.match(/class="big total">(\d+)</i);
      if (totMatch) overlayTotal = parseInt(totMatch[1], 10);
      const sessMatch = body.overlayHtml.match(/<span>Session<\/span><b>([^<]+)<small>([^<]+)<\/small><\/b>/i);
      if (sessMatch) sessionText = `${sessMatch[1].trim()} (${sessMatch[2].replace(/&#183;/g, '·').trim()})`;
    }

    if (!player) player = body.pcName || 'Jogador Desconhecido';

    const lastMatch = matches.length > 0 ? matches[matches.length - 1] : null;
    const avgChests = matchesCount > 0 ? +(totalChests / matchesCount).toFixed(1) : 0;

    // Calcula baús de hoje (baseado na data da última partida ou data atual)
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const todayChests = matches
      .filter(m => m.date && m.date.startsWith(todayPrefix))
      .reduce((sum, m) => sum + m.chests, 0);

    // Últimas 5 partidas (total de baús na sessão recente)
    const last5Chests = matches.slice(-5).reduce((sum, m) => sum + m.chests, 0);

    return {
      id: player.toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
      player,
      pcName: body.pcName || '',
      totalChests: overlayTotal !== null && overlayTotal > totalChests ? overlayTotal : totalChests,
      totalAmmo,
      matchesCount,
      wins,
      bestMatch,
      avgChests,
      todayChests,
      last5Chests,
      treasuresCount,
      treasuresList: treasuresList.slice(-25).reverse(),
      prizes: classifyPrizes(treasuresList),
      inProgress,
      sessionText,
      lastMatch,
      recentMatches: matches.slice(-15).reverse(),
      lastUpdated: new Date().toISOString(),
      lastUpdatedMs: Date.now()
    };
  }

  // Se enviou o data.json completo do ChestCounter
  if (body.Matches && Array.isArray(body.Matches)) {
    let player = body.player || '';
    let totalChests = 0;
    let totalAmmo = 0;
    let matchesCount = 0;
    let wins = 0;
    let bestMatch = 0;
    let treasuresCount = 0;
    const treasuresList = [];
    const matches = [];

    for (const m of body.Matches) {
      if (!m.IsBattleRoyale && m.ChestsOpened === 0) continue;
      const pName = m.PlayerName || '';
      if (pName) player = pName;
      const chests = m.ChestsOpened || 0;
      const ammo = m.AmmoBoxesOpened || 0;
      const placement = m.Placement || 0;
      const dateStr = (m.MatchStartUtc || '').replace('T', ' ').slice(0, 16);

      totalChests += chests;
      totalAmmo += ammo;
      matchesCount++;
      if (placement === 1) wins++;
      if (chests > bestMatch) bestMatch = chests;

      const tFinds = Array.isArray(m.TreasureFinds) ? m.TreasureFinds : [];
      treasuresCount += tFinds.length;
      const tNames = tFinds.map(t => t.ItemId || t.Kind || 'Treasure').join(', ');
      tFinds.forEach(t => treasuresList.push({ date: dateStr, item: t.ItemId || 'Treasure' }));

      matches.push({
        date: dateStr,
        mode: m.Playlist || 'Battle Royale',
        player: pName,
        placement,
        totalPlayers: m.TotalPlayers || 80,
        chests,
        ammo,
        treasures: tNames,
        file: m.ReplayFile || ''
      });
    }

    if (!player) player = body.pcName || 'Jogador Desconhecido';
    const lastMatch = matches.length > 0 ? matches[matches.length - 1] : null;
    const avgChests = matchesCount > 0 ? +(totalChests / matchesCount).toFixed(1) : 0;
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const todayChests = matches
      .filter(m => m.date && m.date.startsWith(todayPrefix))
      .reduce((sum, m) => sum + m.chests, 0);
    const last5Chests = matches.slice(-5).reduce((sum, m) => sum + m.chests, 0);

    return {
      id: player.toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
      player,
      pcName: body.pcName || '',
      totalChests,
      totalAmmo,
      matchesCount,
      wins,
      bestMatch,
      avgChests,
      todayChests,
      last5Chests,
      treasuresCount,
      treasuresList: treasuresList.slice(-25).reverse(),
      prizes: classifyPrizes(treasuresList),
      inProgress: false,
      sessionText: '',
      lastMatch,
      recentMatches: matches.slice(-15).reverse(),
      lastUpdated: new Date().toISOString(),
      lastUpdatedMs: Date.now()
    };
  }

  return null;
}

// Leitura automática do próprio PC onde o servidor está rodando
function syncLocalHostChestCounter() {
  try {
    const csvPath = path.join(LOCAL_CHEST_DIR, 'matches.csv');
    if (!fs.existsSync(csvPath)) return;

    const matchesCsv = fs.readFileSync(csvPath, 'utf8');
    let overlayHtml = '';
    const overlayPath = path.join(LOCAL_CHEST_DIR, 'overlay.html');
    if (fs.existsSync(overlayPath)) {
      overlayHtml = fs.readFileSync(overlayPath, 'utf8');
    }

    const parsed = parseChestCounterSubmission({
      matchesCsv,
      overlayHtml,
      pcName: os.hostname() + ' (Host)'
    });

    if (parsed && parsed.player) {
      const prev = db.players[parsed.id];
      const changed = !prev ||
        prev.totalChests !== parsed.totalChests ||
        prev.matchesCount !== parsed.matchesCount ||
        prev.inProgress !== parsed.inProgress;

      db.players[parsed.id] = parsed;
      if (changed) {
        saveDb();
      }
      broadcastUpdate();
    }
  } catch (e) {
    // ignora silenciosamente caso o arquivo esteja sendo escrito no exato milissegundo
  }
}

// Monitora o próprio PC a cada 5 segundos
syncLocalHostChestCounter();
setInterval(syncLocalHostChestCounter, 5000);

// Gera o conteúdo do script .bat (connectr.bat) IMORTAL (descobre o link novo sozinho na nuvem!)
function generateFriendBatScript(serverUrl) {
  const radminIp = getLocalIPs().find(ip => ip.startsWith('26.')) || '';
  const fallbackLocalUrl = radminIp ? `http://${radminIp}:${PORT}` : `http://localhost:${PORT}`;

  const psScript = `
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$topic = '${DISCOVERY_TOPIC}'
$cachedCloudUrl = '${serverUrl || ''}'.TrimEnd('/')
$localFallback = '${fallbackLocalUrl}'
$ccDir = Join-Path $env:APPDATA 'ChestCounter'
$csvFile = Join-Path $ccDir 'matches.csv'
$ovlFile = Join-Path $ccDir 'overlay.html'
$exeInDownloads = Join-Path $env:USERPROFILE 'Downloads\\ChestCounter.exe'

function Get-LatestCloudUrl {
  try {
    $raw = Invoke-RestMethod -Uri "https://ntfy.sh/$topic/raw?poll=1&since=24h" -TimeoutSec 5
    if ($raw) {
      $lines = @(($raw -split "\\r?\\n") | Where-Object { $_ -match '^https?://' })
      if ($lines.Count -gt 0) {
        return ([string]$lines[-1]).Trim().TrimEnd('/')
      }
    }
  } catch {}
  return $null
}

$cloudDiscovered = Get-LatestCloudUrl
if ($cloudDiscovered) {
  $cachedCloudUrl = $cloudDiscovered
  Write-Host "[*] Link atual do Ranking descoberto automaticamente: $cachedCloudUrl" -ForegroundColor Cyan
  Start-Process $cachedCloudUrl
} elseif ($cachedCloudUrl) {
  Start-Process $cachedCloudUrl
}

# Se o ChestCounter.exe ainda nao existir nos Downloads do amigo, baixa automaticamente do servidor!
if (-not (Test-Path $exeInDownloads)) {
  $dlUrls = @($cachedCloudUrl, $localFallback, 'http://localhost:${PORT}') | Where-Object { $_ } | Select-Object -Unique
  foreach ($u in $dlUrls) {
    try {
      Write-Host "[*] Baixando ChestCounter.exe automaticamente para seus Downloads (aguarde ~10s)..." -ForegroundColor Yellow
      Invoke-WebRequest -Uri "$u/api/download-exe" -OutFile $exeInDownloads -TimeoutSec 120
      if ((Test-Path $exeInDownloads) -and ((Get-Item $exeInDownloads).Length -gt 1000000)) {
        Write-Host "[+] ChestCounter.exe baixado com sucesso em $exeInDownloads!" -ForegroundColor Green
        break
      } else {
        Remove-Item $exeInDownloads -Force -ErrorAction SilentlyContinue
      }
    } catch {
      Remove-Item $exeInDownloads -Force -ErrorAction SilentlyContinue
    }
  }
}

# Inicia o ChestCounter.exe se ainda nao estiver aberto
if (-not (Get-Process -Name 'ChestCounter' -ErrorAction SilentlyContinue)) {
  if (Test-Path $exeInDownloads) {
    Write-Host '[*] Abrindo ChestCounter.exe...' -ForegroundColor Yellow
    Start-Process $exeInDownloads
    Start-Sleep -Seconds 4
  }
}

while ($true) {
  if (Test-Path $csvFile) {
    $csv = [System.IO.File]::ReadAllText($csvFile, [System.Text.Encoding]::UTF8)
    $ovl = if (Test-Path $ovlFile) { [System.IO.File]::ReadAllText($ovlFile, [System.Text.Encoding]::UTF8) } else { '' }
    $payload = @{ matchesCsv = $csv; overlayHtml = $ovl; pcName = $env:COMPUTERNAME } | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)

    $urls = @($cachedCloudUrl, $localFallback, 'http://localhost:${PORT}') | Where-Object { $_ } | Select-Object -Unique
    $sent = $false
    $lastErr = ''

    foreach ($u in $urls) {
      try {
        $resp = Invoke-RestMethod -Uri "$u/api/submit" -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 7
        $time = Get-Date -Format 'HH:mm:ss'
        Write-Host "[$time] Sincronizado! Nick: $($resp.player) | Total de Baus: $($resp.totalChests) | Partidas: $($resp.matchesCount)" -ForegroundColor Green
        $sent = $true
        break
      } catch {
        $lastErr = $_.Exception.Message
      }
    }

    if (-not $sent) {
      $newUrl = Get-LatestCloudUrl
      if ($newUrl -and ($newUrl -ne $cachedCloudUrl)) {
        $cachedCloudUrl = $newUrl
        Write-Host "[*] Novo link do servidor detectado automaticamente: $cachedCloudUrl" -ForegroundColor Cyan
        try {
          $resp = Invoke-RestMethod -Uri "$cachedCloudUrl/api/submit" -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 7
          $time = Get-Date -Format 'HH:mm:ss'
          Write-Host "[$time] Sincronizado! Nick: $($resp.player) | Total de Baus: $($resp.totalChests) | Partidas: $($resp.matchesCount)" -ForegroundColor Green
          $sent = $true
        } catch {}
      }
    }

    if (-not $sent) {
      $time = Get-Date -Format 'HH:mm:ss'
      Write-Host "[$time] Aguardando servidor ficar online... ($lastErr)" -ForegroundColor Red
    }
  } else {
    if (-not (Get-Process -Name 'ChestCounter' -ErrorAction SilentlyContinue)) {
      if (-not (Test-Path $exeInDownloads)) {
        try {
          Write-Host "[*] Baixando ChestCounter.exe automaticamente..." -ForegroundColor Yellow
          Invoke-WebRequest -Uri "$cachedCloudUrl/api/download-exe" -OutFile $exeInDownloads -TimeoutSec 120
        } catch {}
      }
      if (Test-Path $exeInDownloads) {
        Write-Host "[*] Abrindo ChestCounter.exe..." -ForegroundColor Yellow
        Start-Process $exeInDownloads
      }
    }
    Write-Host "[!] Aguardando o ChestCounter.exe analisar seus replays..." -ForegroundColor Yellow
  }
  Start-Sleep -Seconds 10
}
`.trim();

  // Codifica em UTF-16LE Base64 para o -EncodedCommand do PowerShell (zero problemas de aspas no .bat!)
  const encodedPs = Buffer.from(psScript, 'utf16le').toString('base64');

  return `@echo off
set "PATH=%SystemRoot%\\system32;%SystemRoot%;%SystemRoot%\\System32\\Wbem;%SystemRoot%\\System32\\WindowsPowerShell\\v1.0"
title Fortnite ChestCounter - connectr (Auto-Link)
color 0B

echo ========================================================
echo    FORTNITE CHEST COUNTER - RANKING AO VIVO (connectr)
echo ========================================================
echo.
echo [AUTO-DISCOVERY ATIVO] Este connectr.bat descobre o link
echo novo do servidor sozinho sempre que ele mudar!
echo Monitorando seus baus abertos no ChestCounter.exe...
echo Mantenha esta janela aberta enquanto joga!
echo.

"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedPs}

echo.
echo [!] O script foi encerrado.
pause
`;
}

// Servidor HTTP
const server = http.createServer((req, res) => {
  // CORS liberado para facilitar qualquer origem
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // SSE stream para atualização em tempo real no navegador
  if (req.method === 'GET' && pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`data: ${JSON.stringify(getPublicState())}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // Estado atual do ranking (JSON)
  if (req.method === 'GET' && pathname === '/api/ranking') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(getPublicState()));
  }

  // Download direto do ChestCounter.exe para os amigos que ainda não têm!
  if (req.method === 'GET' && pathname === '/api/download-exe') {
    const exeCandidates = [
      path.join(__dirname, 'ChestCounter.exe'),
      path.join(os.homedir(), 'Downloads', 'ChestCounter.exe')
    ];
    const exePath = exeCandidates.find(p => fs.existsSync(p));
    if (!exePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('ChestCounter.exe nao encontrado no servidor.');
    }
    const stat = fs.statSync(exePath);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="ChestCounter.exe"',
      'Content-Length': stat.size
    });
    const stream = fs.createReadStream(exePath);
    stream.pipe(res);
    return;
  }

  // Download direto do .bat já configurado com a URL que o amigo acessou!
  if (req.method === 'GET' && pathname === '/api/download-client') {
    const customHost = parsedUrl.searchParams.get('server') || db.publicUrl || `${parsedUrl.protocol}//${req.headers.host}`;
    const cleanServerUrl = customHost.replace(/\/+$/, '');
    const batContent = generateFriendBatScript(cleanServerUrl);

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="connectr.bat"'
    });
    return res.end(batContent.replace(/\r?\n/g, '\r\n'), 'utf8');
  }

  // Receber dados de um PC (via script .bat ou upload manual na web)
  if (req.method === 'POST' && pathname === '/api/submit') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString('utf8');
      if (body.length > 15 * 1024 * 1024) req.destroy(); // limite 15MB
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const parsed = parseChestCounterSubmission(data);
        if (!parsed || !parsed.player) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Formato inválido ou sem partidas registradas.' }));
        }

        db.players[parsed.id] = parsed;
        saveDb();
        broadcastUpdate();

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: true,
          player: parsed.player,
          totalChests: parsed.totalChests,
          matchesCount: parsed.matchesCount
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Atualizar checklist manual ou modo Treasure Hour
  if (req.method === 'POST' && pathname === '/api/checklist') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString('utf8'); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (typeof data.treasureHourMode === 'string') {
          db.treasureHourMode = data.treasureHourMode;
        }
        if (data.prizeKey && typeof data.checked === 'boolean') {
          const targetId = data.playerId || 'global';
          if (!db.manualChecks) db.manualChecks = {};
          if (!db.manualChecks[targetId]) db.manualChecks[targetId] = {};
          db.manualChecks[targetId][data.prizeKey] = data.checked;
        }
        saveDb();
        broadcastUpdate();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Remover um jogador do ranking
  if (req.method === 'DELETE' && pathname.startsWith('/api/player/')) {
    const id = decodeURIComponent(pathname.replace('/api/player/', ''));
    if (db.players[id]) {
      delete db.players[id];
      saveDb();
      broadcastUpdate();
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // Servir a interface web principal
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(htmlPath, 'utf8'));
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Não encontrado');
});

// Inicia túnel público gratuito na internet via Cloudflare Tunnel (cloudflared.exe)
function startPublicTunnel() {
  const cfPath = path.join(__dirname, 'cloudflared.exe');
  if (fs.existsSync(cfPath)) {
    console.log('[*] Criando link publico estavel na internet (via Cloudflare Tunnel)...');
    const cf = spawn(cfPath, ['tunnel', '--url', `http://127.0.0.1:${PORT}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const handleCfOutput = (data) => {
      const text = data.toString('utf8');
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && match[0]) {
        if (db.publicUrl !== match[0]) {
          db.publicUrl = match[0];
          publishUrlToCloud(db.publicUrl);
          console.log(`\n========================================================`);
          console.log(`  LINK PUBLICO (INTERNET): ${db.publicUrl}`);
          console.log(`  (Sincronizado automaticamente com todos os connectr.bat!)`);
          console.log(`========================================================\n`);
          try {
            fs.writeFileSync(path.join(__dirname, 'connectr.bat'), generateFriendBatScript(db.publicUrl).replace(/\r?\n/g, '\r\n'), 'utf8');
          } catch (e) {}
          broadcastUpdate();
        }
      }
    };

    cf.stdout.on('data', handleCfOutput);
    cf.stderr.on('data', handleCfOutput);

    cf.on('close', () => {
      db.publicUrl = null;
      broadcastUpdate();
      setTimeout(startPublicTunnel, 5000);
    });
    return;
  }

  console.log('[*] Criando link publico na internet (via localhost.run)...');
  const sshBin = fs.existsSync('C:\\Windows\\System32\\OpenSSH\\ssh.exe')
    ? 'C:\\Windows\\System32\\OpenSSH\\ssh.exe'
    : 'ssh';
  const ssh = spawn(sshBin, [
    '-T',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ExitOnForwardFailure=yes',
    '-R', `80:127.0.0.1:${PORT}`,
    'nokey@localhost.run'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const handleOutput = (data) => {
    const text = data.toString('utf8');
    const match = text.match(/https:\/\/[a-zA-Z0-9.-]+\.lhr\.life/);
    if (match && match[0]) {
      if (db.publicUrl !== match[0]) {
        db.publicUrl = match[0];
        publishUrlToCloud(db.publicUrl);
        console.log(`\n========================================================`);
        console.log(`  LINK PUBLICO (INTERNET): ${db.publicUrl}`);
        console.log(`  Envie esse link para seus amigos!`);
        console.log(`========================================================\n`);
        broadcastUpdate();
      }
    }
  };

  ssh.stdout.on('data', handleOutput);
  ssh.stderr.on('data', handleOutput);

  ssh.on('close', () => {
    db.publicUrl = null;
    broadcastUpdate();
    setTimeout(startPublicTunnel, 5000);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n========================================================`);
    console.log(`  O SERVIDOR JA ESTA RODANDO EM SEGUNDO PLANO!`);
    console.log(`  Painel Web: http://localhost:${PORT}`);
    console.log(`========================================================\n`);
    process.exit(0);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================================`);
  console.log(`  RANKING AO VIVO DE BAUS DO FORTNITE INICIADO!`);
  console.log(`  Acesse no seu PC: http://localhost:${PORT}`);
  const ips = getLocalIPs();
  if (ips.length) {
    console.log(`  Na mesma rede Wi-Fi: http://${ips[0]}:${PORT}`);
  }
  console.log(`========================================================\n`);

  if (process.env.NO_TUNNEL !== '1') {
    startPublicTunnel();
  }
});
