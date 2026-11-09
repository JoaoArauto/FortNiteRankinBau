# 🧰 Fortnite Chest Ranking & Caça à Loja Pirata

Sistema web em tempo real (formato **Widget de Stream / HUD do Fortnite**) que lê automaticamente os baús abertos e tesouros analisados pelo `ChestCounter.exe` em vários PCs pela internet, monta um **Ranking Ao Vivo** com o nick do Fortnite e calcula a probabilidade ao vivo do próximo baú vir a **🏴‍☠️ Loja Pirata**.

---

## ✨ Funcionalidades

- **🏆 Ranking Ao Vivo Multi-PC:**
  - Lê automaticamente os dados do `ChestCounter.exe` (`%APPDATA%\ChestCounter\matches.csv` e `overlay.html`).
  - Mostra o nick do Fortnite, se o jogador está **● EM PARTIDA**, **Total de Baús**, **Baús Hoje**, **Recorde em 1 Partida**, **Média por Partida**, **Vitórias Royale (👑)** e **Tesouros (★)**.
  - Atualização instantânea via *Server-Sent Events (SSE)* sem precisar recarregar a página.

- **🏴‍☠️ Widget de Metas de Tesouros & Calculadora da Loja Pirata:**
  - **Objetivo Principal (Loja Pirata):** Exibe a chance exata no **próximo baú (`#N+1`)** e a **probabilidade acumulada** com base no total de baús abertos pelo grupo.
  - **Checklist Inteligente (Auto-Detectada + Manual):**
    - 👑 **Traje Dourado:** `1 / 1.562.500` *(Bônus 10× na Hora do Tesouro)*
    - 🏴‍☠️ **Loja Pirata:** `1 / 137.500` *(Bônus 2× na Hora do Tesouro)*
    - 🚗 **Veículo:** `1 / 7.813` *(Bônus 10× na Hora do Tesouro)*
    - ⛏️ **Picareta:** `1 / 568`
    - 🎵 **Música (Jam):** `1 / 391`
    - 🖼️ **Tela de Carregamento:** `1 / 272`
    - 🤖 **Bugiganga (Gizmo):** `1 / 127` *(Único item que pode repetir)*
  - Como os prêmios únicos não repetem, cada prêmio único conquistado é automaticamente removido do pool no cálculo do próximo baú.

- **🔥 Hora do Tesouro Automática:**
  - Ativa automaticamente os multiplicadores (`10×` Traje Dourado, `2×` Loja Pirata e `10×` Veículo) todos os **Sábados das 16h às 18h** e **das 23h às 01h**, exibindo um cronômetro regressivo. Também pode ser alternada manualmente clicando no botão.

- **🔌 Conector Automático (`connectr.bat`) para Amigos:**
  - **Auto-Discovery na Nuvem:** Descobre sozinho o link público atual do servidor (mesmo que o servidor reinicie ou mude de túnel).
  - **Auto-Instalador do `ChestCounter.exe`:** Se o seu amigo ainda não tiver o `ChestCounter.exe` na pasta `Downloads`, o `connectr.bat` baixa o executável automaticamente do seu servidor e o inicia antes de sincronizar!

---

## 🚀 Como Usar

### 1. No seu PC (Host do Servidor)
1. Dê dois cliques em **`Iniciar_Ranking_Servidor.bat`**.
2. Ele abrirá automaticamente o painel em **`http://localhost:3000`** e criará um túnel público na internet via Cloudflare (`cloudflared.exe`).
3. O seu próprio `ChestCounter.exe` já é lido automaticamente a cada 5 segundos.

### 2. No PC dos seus Amigos (Pela Internet)
1. Envie o arquivo **`connectr.bat`** para os seus amigos **uma única vez** (ou peça para clicarem em **"⬇ BAIXAR CONNECTR"** no topo do site).
2. Quando seu amigo abrir o **`connectr.bat`**, ele fará tudo sozinho:
   - Descobrirá o link atual do servidor e abrirá o Ranking no navegador;
   - Baixará o `ChestCounter.exe` para a pasta `Downloads` dele (caso ainda não tenha) e abrirá o programa;
   - Enviará os baús e tesouros dele ao vivo a cada 10 segundos.

---

## 🎥 Como Usar no OBS Studio (Live / Stream)

Adicione uma fonte **Navegador (Browser Source)** no OBS com uma das URLs abaixo:

| Modo | URL para colocar no OBS | Largura × Altura sugerida |
| :--- | :--- | :--- |
| **Ambos os Widgets (Lado a Lado)** | `http://localhost:3000/?obs=1` | `1120` × `520` |
| **Apenas o Ranking de Baús** | `http://localhost:3000/?obs=1&widget=ranking` | `550` × `480` |
| **Apenas as Metas / Loja Pirata** | `http://localhost:3000/?obs=1&widget=checklist` | `550` × `520` |

> **Dica:** O parâmetro `?obs=1` ativa automaticamente o **fundo 100% transparente** e oculta os botões de controle e rodapé. Você também pode clicar no botão **`🎥`** no topo do widget a qualquer momento.

---

## 📁 Estrutura de Arquivos

- `Iniciar_Ranking_Servidor.bat` — Inicia o servidor Node.js e abre o painel no navegador.
- `connectr.bat` — Conector automático para enviar aos amigos (descobre link na nuvem + baixa/abre o `ChestCounter.exe` + sincroniza ao vivo).
- `Abrir_Ranking_Amigos.html` — Atalho HTML que redireciona automaticamente para o link público atual do servidor.
- `server.js` — Servidor HTTP + SSE + API de sincronização + Túnel Cloudflare + Auto-Discovery.
- `public/index.html` — Interface web estilo HUD do Fortnite com os widgets de Ranking e Loja Pirata.
- `ranking_db.json` — Banco de dados local gerado automaticamente com o histórico dos jogadores e marcações da checklist.
