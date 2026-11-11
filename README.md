# 🏆 Fortnite Chest Ranking & Caça à Loja Pirata

Painel em tempo real estilo **HUD in-game do Fortnite** que reúne estatísticas de baús abertos e tesouros de múltiplos jogadores, gera um **Ranking Ao Vivo** com o histórico das partidas e calcula as chances exatas do próximo baú conter a **Loja Pirata**.

---

## 🎖️ Créditos e Reconhecimento Especial: ChestCounter (LED-N)

Este projeto funciona de forma integrada e totalmente dependente do incrível trabalho de engenharia reversa do **ChestCounter**, desenvolvido por **LED-N**:

👉 **Repositório Oficial do ChestCounter:** [https://github.com/LED-N/Fortnite-ChestCounter](https://github.com/LED-N/Fortnite-ChestCounter)

### O que o ChestCounter faz:
- Analisa diretamente os arquivos `.replay` salvos pelo Fortnite na sua máquina (`%LOCALAPPDATA%\FortniteGame\Saved\Demos`).
- Faz a contagem exata de baús normais, baús de munição e prêmios de tesouro abertos durante a partida em tempo real.
- Grava os registros locais em `%APPDATA%\ChestCounter\matches.csv` e `overlay.html`.

> **Todos os créditos de leitura e análise de replays pertencem ao autor LED-N.** Este painel ranking e o script `connectr.bat` atuam como uma camada complementar de nuvem para permitir rankings em grupo, sincronização remota entre amigos e overlays customizados no OBS Studio.

---

## ⚡ Arquitetura 100% Serverless & Nuvem

- **Site & Overlays**: Hospedado no **GitHub Pages** (gratuito, estático, sem servidor local).
- **Banco em Tempo Real**: **Firebase Realtime Database** (atualizações instantâneas `<50ms` via SSE direto para o OBS e navegador).
- **Cliente Conector (`connectr.bat`)**: 100% nativo em PowerShell no Windows (sem precisar de Node.js ou instalação adicional).
- **Personalização de Cores**: Painel de temas no navegador com salvamento local no `localStorage`.

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
1. Certifique-se de ter o **[ChestCounter](https://github.com/LED-N/Fortnite-ChestCounter)** baixado na sua máquina (na pasta `Downloads` ou na `Área de Trabalho`).
2. Baixe o `connectr.bat` direto pelo botão do site ou pelo repositório.
3. Dê dois cliques em `connectr.bat` para iniciar.
   - O `connectr` detecta e abre automaticamente o `ChestCounter.exe`.
   - A cada 2 minutos (ou quando você terminar uma partida/abrir baús), ele verifica localmente se houve novidades e envia diretamente para o Firebase.
   - Zero consumo de rede e CPU quando o jogo está parado.

---

## 🎨 Personalização de Cores
O site conta com um painel de personalização (ícone **🎨** no topo e no botão flutuante **🎨 CORES**) que permite trocar a cor principal do HUD (Dourado, Ciano, Roxo, Laranja, Rosa, Vermelho ou cor livre) e o tom de fundo (Padrão, Preto AMOLED, Meia-Noite, Roxo Cyberpunk). A preferência fica gravada exclusivamente no navegador de quem alterou.

---

## 🛠️ Tecnologias
- **HTML5 / CSS3 / JavaScript (ES6)**
- **Firebase Realtime Database** (Google Cloud)
- **PowerShell 5.1** (Nativo no Windows 10/11)
- **ChestCounter Engine** por [LED-N](https://github.com/LED-N/Fortnite-ChestCounter)