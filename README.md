# Practice With Video

Treinador de listening por **ditado**. Você cola a URL de um vídeo do YouTube; o
app corta a legenda em trechos de 3 a 8 segundos, toca um trecho, **pausa
exatamente no fim dele**, e compara o que você digitou com a legenda real,
palavra por palavra.

A ideia é simples: entender um vídeo com legenda ligada é fácil e engana. Digitar
o que você ouviu não perdoa — ou a palavra chegou ao seu ouvido, ou não chegou.

Ferramenta pessoal, roda em `localhost`. Português na documentação, inglês no
código.

## Como funciona

```
URL  →  legenda (yt-dlp, ou colada à mão)  →  cues  →  trechos praticáveis
                                                            ↓
   diff palavra a palavra  ←  o que você digitou  ←  toca e pausa no fim
```

Quatro decisões moldam o resto:

- **A pausa é por polling.** A IFrame API do YouTube não avisa "cheguei no tempo
  X", então o app lê `getCurrentTime()` a cada 100ms e pausa ao cruzar a marca.
  Medido: para **~64ms depois** do alvo, com desvio de ±8ms. Pausar cedo cortaria
  a última sílaba, então não há compensação — 64ms tarde cai no silêncio entre
  frases.
- **A correção é tolerante por padrão.** Caixa e pontuação não contam; `"I'm
  gonna go"` e `"I am going to go"` são a mesma resposta. Modo estrito é um
  checkbox, oferecido só quando a legenda é manual e tem pontuação para cobrar.
- **A legenda crua não serve como está.** Cue de 0,8s, cue que fica 20s na tela
  depois de a fala acabar, `[Music]`, `>>`, e o *rolling text* da legenda
  auto-gerada (o YouTube repete a linha anterior no cue seguinte). O segmentador
  existe para isso.
- **Colar a legenda à mão é caminho de primeira classe**, não tela de erro. É a
  única rota que não depende de um endpoint não documentado continuar de pé.

## Rodando

```bash
npm install
npm run dev      # http://localhost:3000
npm run check    # typecheck + lint + testes — o que roda antes de commitar
npm test         # só os testes
npm run corpus   # baixa as legendas reais que um dos testes usa (opcional)
```

Na tela de prática a mão não precisa sair do teclado:

| atalho | ação |
| --- | --- |
| `Enter` | verifica; depois de errar, aceita e segue |
| `Shift+Enter` | quebra linha |
| `Ctrl+Enter` | repete o trecho |
| `Ctrl+→` | revela a resposta e segue |
| `Alt+←` / `Alt+→` | trecho anterior / próximo |

Acertou em cheio, avança sozinho depois de 700ms.

## Pré-requisito externo: `yt-dlp`

A busca automática de legenda depende do binário **`yt-dlp`**. Chamadas em Node
puro estão bloqueadas pelo YouTube (200 com corpo vazio — ver
`docs/SPIKE-RESULTS.md`), e o `yt-dlp` como processo filho é hoje a única rota
automática que funciona.

```bash
pipx install yt-dlp          # recomendado
pip install --user yt-dlp    # alternativa
yt-dlp -U                    # de vez em quando, quando o YouTube mudar
```

No Windows o executável costuma cair fora do `PATH`. Aponte o caminho num
`.env.local` (o Next carrega sozinho, e o arquivo não vai para o git):

```
YT_DLP_PATH=C:\Users\voce\AppData\Roaming\Python\Python312\Scripts\yt-dlp.exe
```

O `yt-dlp` também precisa de um **runtime JavaScript**; o app passa
`--js-runtimes node`, e o Node você já tem. Versões antigas que não conhecem a
opção funcionam igual — o app repete a chamada sem ela.

**Sem `yt-dlp` o app continua utilizável:** dá para colar a legenda SRT/VTT à
mão, na mesma tela de entrada.

### Cache

Cada busca custa ~3s e conta contra o rate limit do YouTube, então a legenda é
guardada em memória e em `.cache/transcripts/` (fora do git) por 30 dias.
`TRANSCRIPT_CACHE=off` desliga o cache em disco; `?force=1` na rota refaz a
busca.

> Se o YouTube responder **`Sign in to confirm you're not a bot`**, o IP levou um
> bloqueio temporário por excesso de requisições. Não há o que consertar: espere
> alguns minutos ou cole a legenda à mão. O app trata isso como um erro próprio
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
scripts/               utilitários de desenvolvimento
docs/                  SPEC (o quê), PLAN (em que ordem), SPIKE-RESULTS, DESIGN
```

A regra que sustenta o desenho: **`lib/` não conhece React, DOM nem YouTube** —
exceto `lib/player/youtube-iframe.ts`, que existe justamente para isolar o que só
o browser resolve. É por isso que os testes rodam em ~2s sem tocar na rede.

## Testes

330 testes, todos offline. O que é lógica pura — parser, segmentador,
normalização, diff, sessão — é testado direto; o player roda sob *fake timers*
com um player falso; a busca de legenda injeta o executor de comando, então nem
binário nem vídeo são necessários.

Um teste é diferente: `tests/captions/segmenter-corpus.test.ts` roda
**invariantes sobre cinco legendas reais** (manual, auto-gerada, vídeo de 1h26,
canal pequeno, vídeo com suspeita de restrição) — nenhum trecho abaixo de 1,5s,
nenhum acima de 8s, nenhuma fronteira repetindo 3 palavras, nenhuma marcação
sobrando.

Essas legendas são conteúdo de terceiro e **não estão no git**; versionados são
só os `videoId`. `npm run corpus` as baixa. Sem elas a suíte se declara ignorada
em vez de reprovar um clone limpo.

Elas ganharam esse lugar na marra: escritas a partir da spec, as fixtures
pequenas passavam verdes enquanto legenda real derrubava quatro invariantes do
segmentador de uma vez.

## Estado

**Fase 1 (MVP) completa**, verificada no navegador: colar a URL e fazer dez
trechos seguidos sem tocar no mouse. Sem persistência — fechou a aba, perdeu a
sessão.

O que vem depois está no §11 da `docs/SPEC.md`: retomar de onde parou, resumo de
sessão com as palavras mais problemáticas, controle de velocidade, hints e modo
revisão.

Limitações conhecidas de hoje:

- só busca a faixa `en` exata — um vídeo cujo único inglês seja `en-US` cai no
  caminho de colar à mão (pedir mais de uma faixa toma 429);
- manual x auto-gerada é detectado pela presença de marcas de tempo por palavra,
  o que é heurística;
- quando a legenda auto-gerada reescreve a própria transcrição, a repetição
  escapa do dedupe em ~0,5% dos trechos;
- a fiação React não tem teste automatizado — foi verificada à mão.

## Documentação

| arquivo | o que é |
| --- | --- |
| `docs/SPEC.md` | o quê e por quê: requisitos, regras de normalização, riscos |
| `docs/PLAN.md` | em que ordem, com "pronto quando" por tarefa |
| `docs/SPIKE-RESULTS.md` | o que foi medido antes de escrever o app — e o que quebrou |
| `docs/DESIGN.md` | escalas e padrões de interface |
