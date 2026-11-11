[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Continue'

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "     FORTNITE CHEST RANKING - CONNECTR" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  * Engine de Replay : ChestCounter (por LED-N)" -ForegroundColor Gray
Write-Host "  * Sincronizacao    : Firebase Realtime Database" -ForegroundColor Gray
Write-Host "  * Intervalo        : A cada 2 min (somente com alteracoes)" -ForegroundColor Gray
Write-Host "========================================================`n" -ForegroundColor Cyan

# 1. Procura, baixa (se necessario) e inicia o ChestCounter
function Launch-ChestTracker {
    $running = Get-Process -Name 'ChestCounter', 'ChestTracker' -ErrorAction SilentlyContinue
    if ($running) {
        Write-Host "[+] ChestCounter ja esta aberto e rodando em segundo plano!" -ForegroundColor Green
        return
    }

    $candidates = @(
        (Join-Path $PSScriptRoot 'ChestCounter.exe'),
        (Join-Path $PSScriptRoot 'ChestTracker.exe'),
        (Join-Path $env:USERPROFILE 'Downloads\ChestCounter.exe'),
        (Join-Path $env:USERPROFILE 'Downloads\ChestTracker.exe'),
        (Join-Path $env:USERPROFILE 'Desktop\ChestCounter.exe'),
        (Join-Path $env:USERPROFILE 'Desktop\ChestTracker.exe')
    )

    $found = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

    # Se nao encontrou em nenhuma pasta comum, baixa direto do repositorio oficial do LED-N!
    if (-not $found) {
        Write-Host "[*] ChestCounter.exe nao foi encontrado no seu computador." -ForegroundColor Yellow
        Write-Host "[*] Baixando automaticamente do repositorio oficial (LED-N/Fortnite-ChestCounter)..." -ForegroundColor Cyan

        $downloadDest = Join-Path $PSScriptRoot 'ChestCounter.exe'
        $primaryUrl = 'https://github.com/LED-N/Fortnite-ChestCounter/releases/latest/download/ChestCounter.exe'
        $fallbackUrl = 'https://github.com/LED-N/Fortnite-ChestCounter/releases/download/v1.4.0/ChestCounter.exe'

        $downloadOk = $false
        try {
            $wc = New-Object System.Net.WebClient
            $wc.Headers.Add('User-Agent', 'PowerShell-ChestRanking')
            $wc.DownloadFile($primaryUrl, $downloadDest)
            if ((Test-Path $downloadDest) -and ((Get-Item $downloadDest).Length -gt 10000000)) {
                $downloadOk = $true
            }
        } catch {
            try {
                $wc = New-Object System.Net.WebClient
                $wc.Headers.Add('User-Agent', 'PowerShell-ChestRanking')
                $wc.DownloadFile($fallbackUrl, $downloadDest)
                if ((Test-Path $downloadDest) -and ((Get-Item $downloadDest).Length -gt 10000000)) {
                    $downloadOk = $true
                }
            } catch {}
        }

        if ($downloadOk) {
            Write-Host "[+] ChestCounter.exe baixado com sucesso! Salvo em: $downloadDest" -ForegroundColor Green
            $found = $downloadDest
        } else {
            Write-Host "[!] Nao foi possivel baixar o ChestCounter automaticamente." -ForegroundColor Red
            Write-Host "    Baixe manualmente pelo repositorio: https://github.com/LED-N/Fortnite-ChestCounter/releases`n" -ForegroundColor Yellow
        }
    }

    if ($found) {
        Write-Host "[*] Iniciando $(Split-Path $found -Leaf)..." -ForegroundColor Yellow
        try {
            Start-Process -FilePath $found
            Start-Sleep -Seconds 3
            Write-Host "[+] ChestCounter iniciado com sucesso!`n" -ForegroundColor Green
        } catch {
            Write-Host "[!] Erro ao iniciar ChestCounter: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Launch-ChestTracker

# 2. Localização das pastas de dados do ChestCounter
$localChestDir = Join-Path $env:APPDATA 'ChestCounter'
$csvFile = Join-Path $localChestDir 'matches.csv'
$ovlFile = Join-Path $localChestDir 'overlay.html'

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
        Write-Host "[!] matches.csv ainda nao encontrado em $localChestDir. Jogue uma partida no Fortnite com o ChestCounter aberto para gerar o arquivo!" -ForegroundColor Yellow
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

    $csvLen = $csvContent.Length
    $csvTail = if ($csvLen -gt 200) { $csvContent.Substring($csvLen - 200) } else { $csvContent }
    $ovlHash = if ($overlayHtml) { $overlayHtml.GetHashCode() } else { 0 }
    $currentHash = "${csvLen}_${csvTail}_${ovlHash}"

    if ($currentHash -eq $script:lastHash) {
        return # Nenhuma modificacao local em relacao a checagem anterior
    }

    $script:isSyncing = $true
    try {
        $lines = @($csvContent -split "`r?`n") | Where-Object { $_.Trim() -ne '' }
        $playersMap = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::OrdinalIgnoreCase)
        $latestPlayerName = 'Jogador'

        for ($i = 1; $i -lt $lines.Count; $i++) {
            $parts = $lines[$i].Split(';')
            if ($parts.Length -lt 6) { continue }
            $date = $parts[0]
            $mode = $parts[1]
            $pName = $parts[2].Trim()
            if (-not $pName) { $pName = 'Jogador' }
            $latestPlayerName = $pName

            $placement = 0; [int]::TryParse($parts[3], [ref]$placement) | Out-Null
            $totalPlayers = 0; [int]::TryParse($parts[4], [ref]$totalPlayers) | Out-Null
            $chests = 0; [int]::TryParse($parts[5], [ref]$chests) | Out-Null
            $ammo = 0; if ($parts.Length -gt 6) { [int]::TryParse($parts[6], [ref]$ammo) | Out-Null }
            $treasures = if ($parts.Length -gt 7) { $parts[7] } else { '' }
            $replayFile = if ($parts.Length -gt 8) { $parts[8] } else { '' }

            if (-not $playersMap.ContainsKey($pName)) {
                $playersMap[$pName] = @{
                    displayName = $pName
                    matches = [System.Collections.ArrayList]::new()
                }
            } else {
                $playersMap[$pName].displayName = $pName
            }

            $playersMap[$pName].matches.Add([PSCustomObject]@{
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

        $todayPrefix = (Get-Date).ToString('yyyy-MM-dd')

        # Itera por CADA jogador encontrado isoladamente (filtragem estrita por nick)
        foreach ($entry in $playersMap.Values) {
            $player = $entry.displayName
            $playerId = ($player.ToLower() -replace '[^a-z0-9_-]', '_')
            $matchList = $entry.matches
            $treasuresList = [System.Collections.ArrayList]::new()
            $totalChests = 0
            $totalAmmo = 0
            $wins = 0
            $bestMatch = 0
            $todayChests = 0

            foreach ($m in $matchList) {
                # Filtro estrito: apenas partidas com o mesmo nick
                if ($m.player -ne $player -and $m.player.ToLower() -ne $player.ToLower()) { continue }

                $totalChests += $m.chests
                $totalAmmo += $m.ammo
                if ($m.placement -eq 1) { $wins++ }
                if ($m.chests -gt $bestMatch) { $bestMatch = $m.chests }
                if ($m.date.StartsWith($todayPrefix)) { $todayChests += $m.chests }

                if ($m.treasures -and $m.treasures.Trim()) {
                    foreach ($t in ($m.treasures -split ',')) {
                        $item = $t.Trim()
                        if ($item) { $treasuresList.Add([PSCustomObject]@{ date = $m.date; item = $item }) | Out-Null }
                    }
                }
            }

            # Overlay ao vivo (inProgress e sessionText) so se aplica ao jogador ativo mais recente na maquina
            $isThisActive = ($player.ToLower() -eq $latestPlayerName.ToLower())
            $playerInProgress = if ($isThisActive) { $inProgress } else { $false }
            $playerSession = if ($isThisActive) { $sessionText } else { '' }
            $finalChests = if ($isThisActive -and $overlayTotal -and $overlayTotal -gt $totalChests) { $overlayTotal } else { $totalChests }

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
                inProgress = $playerInProgress
                sessionText = $playerSession
                lastMatch = $lastMatch
                recentMatches = $recent
                lastUpdated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
                lastUpdatedMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            }

            $summaryJson = $summary | ConvertTo-Json -Depth 6 -Compress

            $timeStr = (Get-Date).ToString('HH:mm:ss')
            Write-Host "[$timeStr] Sincronizado! Jogador: $player | Total Baus: $finalChests | Partidas: $matchesCount | Vitorias: $wins" -ForegroundColor Green

            # Envia para o Firebase Realtime Database
            try {
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($summaryJson)
                Invoke-RestMethod -Uri "https://fortnite-ranking-ac8c4-default-rtdb.firebaseio.com/players/$playerId.json" -Method Put -Body $bytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 5 | Out-Null
            } catch {
                Write-Host "[!] Erro ao enviar para o Firebase ($player): $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }

        # Atualiza carimbo global de atualizacao
        try {
            $nowIso = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
            $nowBytes = [System.Text.Encoding]::UTF8.GetBytes('"' + $nowIso + '"')
            Invoke-RestMethod -Uri "https://fortnite-ranking-ac8c4-default-rtdb.firebaseio.com/updatedAt.json" -Method Put -Body $nowBytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 5 | Out-Null
            $script:lastHash = $currentHash # so marca como enviado se o Firebase aceitou com sucesso
        } catch {}
    } catch {
        Write-Host "[!] Erro: $($_.Exception.Message) na linha $($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor Red
    } finally {
        $script:isSyncing = $false
    }
}

Write-Host "[*] Monitorando partidas em tempo real (checagem local a cada 2 min)..." -ForegroundColor Cyan
Write-Host "[*] Mantenha esta janela aberta enquanto joga Fortnite!`n" -ForegroundColor Gray
Sync-ChestData

while ($true) {
    Start-Sleep -Seconds 120 # checa a cada 2 min, e so envia se o arquivo local teve mudanca
    Sync-ChestData
}
