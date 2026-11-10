[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Continue'

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  FORTNITE CHEST RANKING - CONNECTR (POWERSHELL NATIVO)" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# 1. Procura e inicia o ChestCounter / ChestTracker se ainda não estiver aberto
function Launch-ChestTracker {
    $running = Get-Process -Name 'ChestCounter', 'ChestTracker' -ErrorAction SilentlyContinue
    if ($running) {
        Write-Host "[+] ChestCounter / ChestTracker ja esta aberto e rodando!" -ForegroundColor Green
        return
    }

    $candidates = @(
        (Join-Path $env:USERPROFILE 'Downloads\ChestCounter.exe'),
        (Join-Path $env:USERPROFILE 'Downloads\ChestTracker.exe'),
        (Join-Path $env:USERPROFILE 'Desktop\ChestCounter.exe'),
        (Join-Path $env:USERPROFILE 'Desktop\ChestTracker.exe'),
        (Join-Path $PSScriptRoot 'ChestCounter.exe'),
        (Join-Path $PSScriptRoot 'ChestTracker.exe')
    )

    $found = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($found) {
        Write-Host "[*] Abrindo $(Split-Path $found -Leaf) automaticamente ($found)..." -ForegroundColor Yellow
        try {
            Start-Process -FilePath $found
            Start-Sleep -Seconds 3
            Write-Host "[+] ChestCounter iniciado com sucesso!`n" -ForegroundColor Green
        } catch {
            Write-Host "[!] Erro ao iniciar ChestCounter: $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "[!] ChestCounter.exe nao foi encontrado nas pastas comuns. Por favor, abra-o manualmente se for jogar.`n" -ForegroundColor Yellow
    }
}

Launch-ChestTracker

# 2. Localização das pastas de dados e repositório
$localChestDir = Join-Path $env:APPDATA 'ChestCounter'
$csvFile = Join-Path $localChestDir 'matches.csv'
$ovlFile = Join-Path $localChestDir 'overlay.html'

$possibleRepoDirs = @(
    $PSScriptRoot,
    (Join-Path $env:USERPROFILE 'Documents\ChestRanking'),
    (Join-Path $env:USERPROFILE 'Downloads\ChestRanking')
)
$repoDir = $possibleRepoDirs | Where-Object { (Test-Path (Join-Path $_ 'ranking_db.json')) -or (Test-Path (Join-Path $_ '.git')) } | Select-Object -First 1
$dbFile = if ($repoDir) { Join-Path $repoDir 'ranking_db.json' } else { $null }

# 3. Classificação de prêmios nas 7 categorias oficiais
function Classify-Prizes($treasuresList) {
    $prizes = [PSCustomObject]@{
        goldOutfit = $false
        pirateShop = $false
        vehicle = $false
        pickaxe = $false
        jamTrack = $false
        loadingScreen = $false
        gizmosCount = 0
    }

    foreach ($t in $treasuresList) {
        $raw = "$($t.item)".ToLower()
        if (-not $raw) { continue }
        if ($raw -match 'loading screen|plunder in paradise|so kawaii|dpid_item2|dpid_item17') { $prizes.loadingScreen = $true }
        elseif ($raw -match 'music track|jam track|no trespassing|london|dpid_item4|dpid_item16') { $prizes.jamTrack = $true }
        elseif ($raw -match 'pickaxe|gauntlet|dpid_item1') { $prizes.pickaxe = $true }
        elseif ($raw -match 'vehicle|mercedes|cadillac|dpid_item3|dpid_item15') { $prizes.vehicle = $true }
        elseif ($raw -match 'pirate shop|shop') { $prizes.pirateShop = $true }
        elseif ($raw -match 'gold outfit|outfit|skin|uzi') { $prizes.goldOutfit = $true }
        else { $prizes.gizmosCount++ }
    }
    return $prizes
}

$lastHash = ''
$isSyncing = $false

function Sync-ChestData {
    if ($script:isSyncing) { return }
    if (-not (Test-Path $csvFile)) {
        Write-Host "[!] matches.csv ainda nao encontrado em $localChestDir. Jogue uma partida com ChestCounter aberto!" -ForegroundColor Yellow
        return
    }

    $csvContent = ''
    try {
        $csvContent = [System.IO.File]::ReadAllText($csvFile, [System.Text.Encoding]::UTF8)
    } catch { return }

    $overlayHtml = ''
    if (Test-Path $ovlFile) {
        try { $overlayHtml = [System.IO.File]::ReadAllText($ovlFile, [System.Text.Encoding]::UTF8) } catch {}
    }

    $currentHash = "$($csvContent.Length)_$($csvContent.Substring([Math]::Max(0, $csvContent.Length - 120)))_$($overlayHtml.GetHashCode())"
    $hasLocalChange = ($currentHash -ne $script:lastHash)
    if (-not $hasLocalChange -and (-not $dbFile -or -not (Test-Path (Join-Path $repoDir '.git')))) {
        return
    }

    $script:isSyncing = $true
    try {
        $lines = @($csvContent -split "`r?`n") | Where-Object { $_.Trim() -ne '' }
        $player = 'Jogador'
        $matchList = [System.Collections.ArrayList]::new()
        $treasuresList = [System.Collections.ArrayList]::new()
        $totalChests = 0
        $totalAmmo = 0
        $wins = 0
        $bestMatch = 0
        $todayPrefix = (Get-Date).ToString('yyyy-MM-dd')
        $todayChests = 0

        for ($i = 1; $i -lt $lines.Count; $i++) {
            $parts = $lines[$i].Split(';')
            if ($parts.Length -lt 6) { continue }
            $date = $parts[0]
            $mode = $parts[1]
            $pName = $parts[2]
            $placement = 0; [int]::TryParse($parts[3], [ref]$placement) | Out-Null
            $totalPlayers = 0; [int]::TryParse($parts[4], [ref]$totalPlayers) | Out-Null
            $chests = 0; [int]::TryParse($parts[5], [ref]$chests) | Out-Null
            $ammo = 0; if ($parts.Length -gt 6) { [int]::TryParse($parts[6], [ref]$ammo) | Out-Null }
            $treasures = if ($parts.Length -gt 7) { $parts[7] } else { '' }
            $replayFile = if ($parts.Length -gt 8) { $parts[8] } else { '' }

            if ($pName) { $player = $pName }
            $totalChests += $chests
            $totalAmmo += $ammo
            if ($placement -eq 1) { $wins++ }
            if ($chests -gt $bestMatch) { $bestMatch = $chests }
            if ($date.StartsWith($todayPrefix)) { $todayChests += $chests }

            if ($treasures.Trim()) {
                foreach ($t in ($treasures -split ',')) {
                    $item = $t.Trim()
                    if ($item) { $treasuresList.Add([PSCustomObject]@{ date = $date; item = $item }) | Out-Null }
                }
            }

            $matchList.Add([PSCustomObject]@{
                date = $date
                mode = $mode
                player = $pName
                placement = $placement
                totalPlayers = $totalPlayers
                chests = $chests
                ammo = $ammo
                treasures = $treasures
                file = $replayFile
            }) | Out-Null
        }

        $inProgress = $false
        $sessionText = ''
        $overlayTotal = $null
        if ($overlayHtml) {
            if ($overlayHtml -match 'MATCH IN PROGRESS') { $inProgress = $true }
            if ($overlayHtml -match 'class="big total">([0-9.,]+)<') {
                $overlayTotal = [int]($Matches[1] -replace '[,.]', '')
            }
            if ($overlayHtml -match '<span>Session</span><b>([^<]+)<small>([^<]+)</small></b>') {
                $sessionText = "$($Matches[1].Trim()) ($($Matches[2].Replace('&#183;', '·').Trim()))"
            }
        }

        $finalChests = if ($overlayTotal -and $overlayTotal -gt $totalChests) { $overlayTotal } else { $totalChests }
        $matchesCount = $matchList.Count
        $avgChests = if ($matchesCount -gt 0) { [math]::Round($finalChests / $matchesCount, 1) } else { 0 }
        $last5Chests = 0
        if ($matchList.Count -gt 0) {
            $last5Start = [Math]::Max(0, $matchList.Count - 5)
            for ($k = $last5Start; $k -lt $matchList.Count; $k++) { $last5Chests += $matchList[$k].chests }
        }

        $prizes = Classify-Prizes $treasuresList
        $recent = if ($matchList.Count -gt 15) { @($matchList[($matchList.Count - 15)..($matchList.Count - 1)]) } else { $matchList.ToArray() }
        [array]::Reverse($recent)
        $lastMatch = if ($matchList.Count -gt 0) { $matchList[$matchList.Count - 1] } else { $null }

        $playerId = ($player.ToLower() -replace '[^a-z0-9_-]', '_')

        $summary = [PSCustomObject]@{
            id = $playerId
            player = $player
            pcName = $env:COMPUTERNAME
            totalChests = $finalChests
            totalAmmo = $totalAmmo
            matchesCount = $matchesCount
            wins = $wins
            bestMatch = $bestMatch
            avgChests = $avgChests
            todayChests = $todayChests
            last5Chests = $last5Chests
            treasuresCount = $treasuresList.Count
            treasuresList = if ($treasuresList.Count -gt 25) { @($treasuresList[($treasuresList.Count - 25)..($treasuresList.Count - 1)]) } else { @($treasuresList) }
            prizes = $prizes
            inProgress = $inProgress
            sessionText = $sessionText
            lastMatch = $lastMatch
            recentMatches = $recent
            lastUpdated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
            lastUpdatedMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        }

        $summaryJson = $summary | ConvertTo-Json -Depth 6 -Compress

        $timeStr = (Get-Date).ToString('HH:mm:ss')
        Write-Host "[$timeStr] Partidas processadas! Nick: $player | Baus: $finalChests | Partidas: $matchesCount | Vitorias: $wins" -ForegroundColor Green

        # 1. Envia instantaneamente para o Firebase Realtime Database (Nuvem em tempo real independente do GitHub)
        try {
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($summaryJson)
            Invoke-RestMethod -Uri "https://fortnite-ranking-ac8c4-default-rtdb.firebaseio.com/players/$playerId.json" -Method Put -Body $bytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 5 | Out-Null
        } catch {
            Write-Host "[!] Erro ao enviar para o Firebase: $($_.Exception.Message)" -ForegroundColor Yellow
        }

        # 2. Se o servidor local estiver rodando, envia via API local
        try {
            Invoke-RestMethod -Uri "http://localhost:3000/api/submit" -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 2 | Out-Null
        } catch {}

        # 3. Mantem copia de backup no ranking_db.json local (sem tocar no Git)
        if ($dbFile -and (Test-Path $dbFile)) {
            try {
                $dbObj = Get-Content $dbFile -Raw -Encoding UTF8 | ConvertFrom-Json
                if (-not $dbObj.players) { $dbObj | Add-Member -MemberType NoteProperty -Name 'players' -Value ([PSCustomObject]@{}) }
                $dbObj.players | Add-Member -MemberType NoteProperty -Name $playerId -Value ($summaryJson | ConvertFrom-Json) -Force
                $dbObj.updatedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
                $dbObj | ConvertTo-Json -Depth 8 | Set-Content $dbFile -Encoding UTF8
            } catch {}
        }
        $script:lastHash = $currentHash
    } catch {
        Write-Host "[!] Erro: $($_.Exception.Message) na linha $($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor Red
    } finally {
        $script:isSyncing = $false
    }
}

Write-Host "[*] Monitorando seus baus em tempo real... Mantenha esta janela aberta!`n" -ForegroundColor Cyan
Sync-ChestData

while ($true) {
    Start-Sleep -Seconds 1
    Sync-ChestData
}
