# Practice With Video

Treinador de listening por **ditado**: cola a URL de um vídeo do YouTube, o app toca
o vídeo em trechos curtos, pausa no fim de cada trecho e compara o que você digitou
com a legenda real, palavra a palavra.

Ferramenta pessoal, roda em `localhost`. Ver `docs/SPEC.md` (o quê) e `docs/PLAN.md` (em que ordem).

## Rodando

```bash
npm install
npm run dev      # http://localhost:3000
npm run check    # typecheck + lint + testes, o que roda antes de commitar
npm test         # só os testes (Vitest)
```

Atalhos na tela de prática: `Enter` verifica (e, depois de errar, aceita e segue),
`Ctrl+Enter` repete o trecho, `Ctrl+→` revela, `Alt+←/→` navega entre trechos.

## Pré-requisito externo: `yt-dlp`

A busca automática de legenda depende do binário **`yt-dlp`** no `PATH`. As rotas em
Node puro estão bloqueadas pelo YouTube (200 com corpo vazio — ver `docs/SPIKE-RESULTS.md`),
e o `yt-dlp` é hoje a única rota automática que funciona.

```bash
pipx install yt-dlp     # ou: pip install -U yt-dlp
yt-dlp -U               # ocasionalmente, quando o YouTube mudar
```

Se o binário não estiver no `PATH` (por exemplo, instalado num venv), aponte o
caminho:

```bash
YT_DLP_PATH=/caminho/para/yt-dlp.exe npm run dev
```

Para não repetir isso toda vez, ponha a linha num `.env.local` (fora do git) —
o Next carrega esse arquivo sozinho:

```
YT_DLP_PATH=C:\caminho\para\yt-dlp.exe
```

O `yt-dlp` precisa de um **runtime JavaScript** para extrair sem cair num caminho
deprecado; o app passa `--js-runtimes node`, e o Node você já tem. Versões antigas
que não conhecem a opção funcionam do mesmo jeito (o app repete a chamada sem ela).

Sem `yt-dlp` o app continua utilizável: dá para **colar a legenda SRT/VTT à mão**
(RF-02b), que é um caminho de primeira classe na tela de entrada.

### Cache da legenda

Cada busca custa ~3s e conta contra o rate limit do YouTube, então a legenda é
guardada em memória e em `.cache/transcripts/` (fora do git), por 30 dias.
`TRANSCRIPT_CACHE=off` desliga o cache em disco; `?force=1` na rota refaz a busca.

> Se o YouTube responder **`Sign in to confirm you're not a bot`**, o IP levou um
> bloqueio temporário por excesso de requisições. Não há o que consertar: espere
> alguns minutos, ou cole a legenda à mão. O app trata isso como um erro próprio
> (`rate-limited`), distinto de "vídeo sem legenda".

## Estrutura

```
app/
  api/transcript/      rota que dispara o yt-dlp
  components/          telas e componentes (client)
lib/
  captions/            parser SRT/VTT e segmentador
  correction/          normalização e diff palavra a palavra
  player/              pausa por polling (puro) + IFrame API (DOM)
  practice/            estado da sessão de prática
  youtube/             parse de URL e busca de legenda
types/                 contratos compartilhados (Cue, Segment, DiffResult)
tests/                 Vitest, espelhando a árvore de lib/
  fixtures/            legendas pequenas, escritas à mão
  fixtures/corpus/     cinco legendas reais do YouTube (ver o README de lá)
docs/                  SPEC (o quê), PLAN (em que ordem), SPIKE-RESULTS, DESIGN
```

A regra que sustenta esse desenho: **`lib/` não conhece React, DOM nem YouTube**
— exceto `lib/player/youtube-iframe.ts`, que existe justamente para isolar o que
precisa do browser. É por isso que 330 testes rodam em ~2s sem rede.

## Estado

Fase 1 (MVP) completa: cola a URL, o vídeo toca em trechos, pausa, você digita e
vê o diff — dez trechos seguidos sem tocar no mouse. Sem persistência ainda; o
roadmap está no §11 da `docs/SPEC.md`.
