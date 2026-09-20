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

Sem `yt-dlp` o app continua utilizável: dá para **colar a legenda SRT/VTT à mão**
(RF-02b), que é um caminho de primeira classe na tela de entrada.

## Estrutura

```
app/            # Next.js App Router (UI + route handlers)
lib/            # lógica pura, sem React/DOM/YouTube
types/          # contratos compartilhados (Cue, Segment, DiffResult)
tests/          # Vitest + fixtures de legenda real
```
