# Practice With Video

Treinador de listening por **ditado**: cola a URL de um vídeo do YouTube, o app toca
o vídeo em trechos curtos, pausa no fim de cada trecho e compara o que você digitou
com a legenda real, palavra a palavra.

Ferramenta pessoal, roda em `localhost`. Ver `SPEC.md` (o quê) e `PLAN.md` (em que ordem).

## Rodando

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # Vitest (lógica pura: parser, segmentador, normalização, diff)
npm run typecheck
```

## Pré-requisito externo: `yt-dlp`

A busca automática de legenda depende do binário **`yt-dlp`** no `PATH`. As rotas em
Node puro estão bloqueadas pelo YouTube (200 com corpo vazio — ver `SPIKE-RESULTS.md`),
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
app/            # Next.js App Router (UI + route handlers)
lib/            # lógica pura, sem React/DOM/YouTube
types/          # contratos compartilhados (Cue, Segment, DiffResult)
tests/          # Vitest + fixtures de legenda real
```
