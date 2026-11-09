# 🧰 Fortnite Chest Ranking & Caça à Loja Pirata

Painel em tempo real estilo **HUD in-game do Fortnite** que coleta baús abertos e tesouros analisados pelo `ChestCounter.exe` em múltiplos PCs pela internet, gera um **Ranking Ao Vivo** com o nick dos jogadores e calcula as chances exatas do próximo baú conter a **🏴‍☠️ Loja Pirata**.

---

## ✨ Funcionalidades

- **🏆 Ranking Ao Vivo:**
  - Lê automaticamente as partidas analisadas pelo `ChestCounter.exe` (`matches.csv` e `overlay.html`).
  - Exibe nick, status de partida em andamento, total de baús, baús de hoje, recorde, média, vitórias e tesouros.
  - Atualização em tempo real via Server-Sent Events (SSE).
- **🏴‍☠️ Caça à Loja Pirata & Checklist de Prêmios:**
  - **Próximo baú:** Probabilidade ajustada conforme prêmios únicos que já saíram do pool.
  - **Checklist:** Rastreamento dos 7 itens oficiais (Traje Dourado, Loja Pirata, Veículo, Picareta, Música, Tela de Carregamento e Bugigangas).
  - **🔥 Hora do Tesouro:** Ativação automática nos horários oficiais (Sábados 16h–18h e 23h–01h) aplicando multiplicadores de 10× e 2×.
- **🔌 Conector Automático (`connectr.bat`):**
  - Script autônomo para amigos: descobre o endereço do servidor via nuvem e baixa o `ChestCounter.exe` automaticamente caso o amigo ainda não o possua.
- **🎥 Integração com OBS Studio:**
  - Modo transparente nativo para lives e suporte a carregamento isolado de widgets.

---

## 🚀 Como Executar

### Pré-requisitos
- [Node.js](https://nodejs.org/) instalado no PC host.
- [ChestCounter.exe](https://github.com/) rodando no PC dos jogadores.

### 1. Iniciar o Servidor (Host)
Execute o arquivo:
```cmd
Iniciar_Ranking_Servidor.bat
```
Ou via linha de comando:
```bash
node server.js
```
O painel abrirá em `http://localhost:3000`. O servidor inicia automaticamente um túnel seguro (Cloudflare Tunnel) para conexões externas.

### 2. Conectar Outros Jogadores
Envie o arquivo `connectr.bat` para os amigos ou compartilhe o link do painel onde eles podem clicar em **"⬇ BAIXAR CONNECTR"**. O script cuidará do download do executável e do envio dos dados a cada 10 segundos.

---

## 🎥 Uso no OBS Studio (Stream Overlay)

Adicione uma fonte do tipo **Navegador (Browser Source)** no OBS:

| Widget | URL no OBS | Dimensões Recomendadas |
| :--- | :--- | :--- |
| **Painel Completo** | `http://localhost:3000/?obs=1` | `1120 × 520` |
| **Apenas Ranking** | `http://localhost:3000/?obs=1&widget=ranking` | `540 × 480` |
| **Apenas Loja Pirata** | `http://localhost:3000/?obs=1&widget=checklist` | `540 × 520` |

*O parâmetro `?obs=1` ativa transparência e remove barras de controle da live.*

---

## 📁 Estrutura do Repositório

```text
├── public/
│   └── index.html               # Frontend HUD estilo Fortnite (Widgets e SSE)
├── server.js                    # Servidor HTTP, SSE, túnel e agregador
├── Iniciar_Ranking_Servidor.bat # Inicializador rápido para o host
├── Abrir_Ranking_Amigos.html    # Redirecionador dinâmico de link
├── README.md                    # Documentação do projeto
└── .gitignore                   # Exclusão de binários e banco local
```
