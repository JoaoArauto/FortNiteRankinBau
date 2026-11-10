# 🏆 Fortnite Chest Ranking & Caça à Loja Pirata

Painel em tempo real estilo **HUD in-game do Fortnite** que reúne baús abertos e tesouros analisados pelo `ChestCounter.exe` de múltiplos jogadores, gera um **Ranking Ao Vivo** com o nick dos jogadores e calcula as chances exatas do próximo baú conter a **Loja Pirata**.

---

## ⚡ Arquitetura 100% Serverless & Nuvem

- **Site & Overlays**: Hospedado no **GitHub Pages** (gratuito, estático, sem servidor local).
- **Banco em Tempo Real**: **Firebase Realtime Database** (atualizações instantâneas `<50ms` via SSE direto para o OBS e navegador).
- **Cliente Conector (`connectr.bat`)**: 100% nativo em PowerShell no Windows (sem precisar de Node.js ou instalação adicional).

---

## 🚀 Como Usar

### 1. Visualizar o Ranking e Widgets do OBS
Acesse diretamente pelo navegador ou adicione como fonte de navegador no OBS Studio:
- **Painel Completo**: `https://joaoarauto.github.io/FortNiteRankinBau/`
- **Modo OBS (Transparente)**: `https://joaoarauto.github.io/FortNiteRankinBau/?obs=1`
- **Widget Apenas Ranking**: `https://joaoarauto.github.io/FortNiteRankinBau/?obs=1&widget=ranking`
- **Widget Apenas Loja Pirata**: `https://joaoarauto.github.io/FortNiteRankinBau/?obs=1&widget=checklist`

*Dica: Você pode copiar esses links com 1 clique direto pelo botão **🎥 LINKS DO OBS** no canto inferior direito do site.*

### 2. Jogadores / Amigos (Enviar Baús)
1. Baixe o executável `connectr.bat` direto pelo botão do site ou pelo repositório.
2. Dê dois cliques em `connectr.bat` para iniciar.
   - O `connectr` abre automaticamente o `ChestCounter.exe` se ele estiver no seu PC.
   - Ele detecta novas partidas e baús e envia em tempo real para o ranking.
   - Consumo zero de rede e CPU quando o jogo está parado (checagem local estrita).

---

## 🛠️ Tecnologias
- **HTML5 / CSS3 / JavaScript (ES6)**
- **Firebase Realtime Database** (Google Cloud)
- **PowerShell 5.1** (Nativo no Windows 10/11)