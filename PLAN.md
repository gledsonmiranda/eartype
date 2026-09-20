# Plano de implementação — Fase 1 (MVP)

> Complementa `SPEC.md`. A spec diz **o quê**; este documento diz **em que ordem**, **com quais contratos** e **pronto quando**.
> Escopo: só a Fase 1 (§11 da spec) — loop puro, sem persistência.

---

## Passo 0 — Spike de validação (fazer ANTES de tudo)

Código descartável, fora da estrutura final (`/spike`, deletado depois). Duas perguntas que só a máquina responde:

### S-1 — A legenda vem mesmo?
Script Node que recebe um `videoId` e imprime as faixas disponíveis + os 10 primeiros cues.

Testar com **5 vídeos reais seus** — daqueles que você usaria de verdade:
- um com legenda manual (canal profissional);
- um só com legenda auto-gerada;
- um vídeo longo (1h+);
- um de canal pequeno;
- um que você suspeita ter restrição.

**Decide:** se falhar em 3 dos 5, o `youtubei.js` não é base confiável → inverter a prioridade da Fase 1 (SRT manual vira o caminho principal, busca automática vira conveniência). Se passar, segue o plano.

### S-2 — A pausa é precisa o bastante?
Página HTML única com o player do YouTube, um `setInterval(100ms)` lendo `getCurrentTime()` e pausando num timestamp fixo.

**Medir:** de quanto passou do alvo, em 10 tentativas. Testar também logo após `seekTo`, que é o caso pior.

**Decide:** erro típico < 150ms → o polling de 100ms serve. Entre 150–400ms → reduzir para 50ms e/ou aumentar o *lead*. Consistentemente > 400ms → o loop precisa de outra abordagem (ex.: segmentos com folga no fim e pausa ancorada em silêncio), e isso muda o segmentador.

> **Só depois de S-1 e S-2 o resto do plano é confiável.** Tudo abaixo assume os dois verdes.

---

## Ordem das tarefas

Cada tarefa é um commit. As tarefas 1–4 são **puro TypeScript sem UI** — dá para testar tudo com Vitest antes de existir uma tela, e é onde mora a complexidade real do projeto.

### T-01 — Setup
Next.js (App Router) + TS strict + Tailwind + Vitest. Nada de UI ainda.
**Pronto quando:** `npm run dev` sobe e `npm test` roda um teste trivial.

### T-02 — `parse-url`
```ts
parseYouTubeUrl(input: string): { videoId: string; startSec?: number } | null
```
**Pronto quando:** testes cobrindo `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, ID puro, `&t=90`, `&t=1m30s`, URL com lista de reprodução, e lixo (retorna `null`).

### T-03 — Parser SRT/VTT  ·  *sem dependência de rede — por isso vem cedo*
```ts
parseCaptions(raw: string): { cues: Cue[]; format: 'srt' | 'vtt' }   // lança erro legível se inválido
```
**Pronto quando:** os testes do §7.5 da spec passam (CRLF, `,` vs `.` no timestamp, tags inline, `NOTE`/`STYLE`, entrada inválida com mensagem clara).
**Por que antes da busca automática:** dá cues reais para alimentar T-04 e T-05 sem depender do YouTube, e já entrega o plano B da spec.

### T-04 — `segmenter`
```ts
segment(cues: Cue[], opts?: { minMs?; maxMs?; maxWords? }): Segment[]
```
Regras no §RF-03. **Pronto quando:** rodando sobre as duas fixtures (manual e ASR), nenhum segmento passa de 15 palavras, nenhum fica abaixo de 1,5s, o rolling text do ASR não aparece duplicado, e `[Music]` sumiu.

### T-04b — o segmentador contra legenda real
Os critérios acima foram escritos contra fixtures feitas a partir da spec, e por isso só continham os problemas que já tínhamos imaginado. As cinco legendas reais do S-1c derrubaram quatro deles (detalhes em `SPIKE-RESULTS.md`): rolling text repetido de 1–2 palavras, segmento de 21s vindo de um cue que fica na tela depois da fala acabar, `>>` sobrevivendo no meio do cue, e segmentos abaixo de 1,5s.

O corpus vira fixture (`tests/fixtures/corpus/`) e os critérios passam a ser **invariantes sobre o vídeo inteiro**, não casos escolhidos a dedo.

**Pronto quando:** nos cinco vídeos, nenhum segmento fica abaixo de 1,5s, nenhum passa de `maxMs + minMs`, nenhum agrupamento passa de `maxWords + 5`, nenhuma fronteira entre segmentos repete 3 palavras ou mais, e não sobra marcação (`[`, `]`, `♪`, `>>`).

**Duas concessões conscientes:**
- **Um cue nunca é partido** (§RF-03), então um cue de 18 palavras vira um segmento de 18 palavras. O cap de palavras só vale para segmentos que agrupam mais de um cue.
- **Os limites esticam para não deixar sobra.** Emitir 0,8s de áudio não é praticável, então o segmento estende até `maxWords + 5` em vez de cuspir um caco. Em troca, ~6% dos segmentos do vídeo mais longo ficam entre 16 e 20 palavras.

**Limite conhecido:** quando o ASR *reescreve* a própria transcrição ao redesenhar a linha (`…is important to you.` / `You know this is important to your life…`), a repetição passa. São 8 casos em 1.557 segmentos no vídeo de 1h26; repetição de 1–2 palavras na fronteira também pode ser fala real (`blah, / blah, blah…`), e é por isso que o corte fica em 3 palavras.

### T-05 — `normalize` + `diff`  ·  **o coração do projeto**
```ts
canonicalize(text: string, mode: 'lenient' | 'strict'): Token[]   // pre-pass de frase, depois tokens
compare(reference: string, typed: string, mode): DiffResult
```
Onde estão §5, §5.1 (contrações/reduções, alinhamento multi-token, conjuntos de variantes) e §5.2 (números).
**Pronto quando:** a tabela de testes passa, incluindo os dois casos obrigatórios da spec — `"I'm gonna go"` = `"I am going to go"` dá 100%, e `"the dog's bone"` ≠ `"the dog is bone"` dá erro.
**Atenção:** é a tarefa mais longa. Se estourar, cortar o §5.2 (números) para a Fase 2 — contrações são muito mais frequentes na fala do que números.

### T-06 — Busca automática de legenda via `yt-dlp`  ·  ✅ desbloqueado (S-1b)
O `youtubei.js` não baixa mais legenda (200 com corpo vazio em todos os clientes); o `yt-dlp` baixa, inclusive chamado de dentro do Node. Ver `SPIKE-RESULTS.md`.

Rota `GET /api/transcript?videoId=`, isolada em `lib/youtube/transcript.ts`, disparando o binário por `child_process.execFile`:
```
yt-dlp --skip-download --write-sub --write-auto-sub --sub-lang en --sub-format vtt --no-warnings -o <tmp>/%(id)s.%(ext)s <url>
```
Restrições **não negociáveis**, todas medidas no spike:
- `--sub-lang en` e nunca um glob — `en.*` toma 429 na terceira faixa e derruba a chamada inteira.
- ~~`export const runtime = 'nodejs'` na rota~~ — **caiu**: nesta versão do Next `nodejs` já é o padrão e o runtime Edge está deprecado; a própria doc manda remover o export (`node_modules/next/dist/docs/.../runtime.md`). A rota continua precisando do Node, só não precisa mais declarar.
- Timeout no `execFile` (60s) e limpeza do diretório temporário no `finally`.
- Cache obrigatório: ~2,3s por busca.
- Erro do processo traduzido para os tipos de erro da UI — não vazar stderr do yt-dlp para a tela.

- **`--js-runtimes node`** (descoberto no S-1c): sem runtime JS o yt-dlp cai num caminho de extração deprecado e perde metadados. Uma versão antiga que não conheça a opção rejeita a chamada, e aí ela é repetida sem a flag.

**Pronto quando:** devolve cues para os 5 vídeos do spike e dá erro **tipado e distinguível** para: sem legenda em inglês / vídeo indisponível / yt-dlp ausente ou falhando. A UI precisa saber qual aconteceu para escolher a mensagem.

**Pré-requisito documentado no README:** o app depende do `yt-dlp` instalado, e de um `yt-dlp -U` ocasional quando o YouTube mudar.

**Como ficou:** cinco códigos de erro em vez de três, porque o bloqueio temporário por IP (`rate-limited`) pede uma mensagem diferente de "não tem legenda" — some sozinho, e a ação certa é esperar, não colar legenda. Os outros: `no-english-captions`, `video-unavailable`, `tool-missing`, `provider-failed`.

**Verificado ao vivo** (não só nos testes): os cinco vídeos voltam com legenda em 3,0–3,5s, o tipo (manual/ASR) sai certo nos cinco, a segunda busca vem do disco em ~1ms, um ID inexistente dá `video-unavailable` e um binário fora do lugar dá `tool-missing`.

### T-07 — Player com pausa automática  ·  ✅ validado no S-2
Wrapper da IFrame API: `seekTo` + `play` + polling + `pause` no fim do segmento, com `cc_load_policy: 0`.
Parâmetros medidos no spike: **polling 100ms, lead 0** (erro real +64ms, desvio ±8ms). Requisito descoberto no S-2: **esperar o `seekTo` assentar (~600ms) antes de começar a contar** — sem isso a contagem começa no tempo antigo e o segmento nunca pausa.
**Pronto quando:** toca o segmento 3, pausa no fim, e repetir 5 vezes seguidas para sempre no mesmo lugar (sem drift acumulado). Erros 100/101/150 do player caem em mensagem específica.

### T-08 — Tela de prática
Junta tudo: player + input + diff + progresso X de N. Atalhos `Enter` (verificar) e `Ctrl+Enter` (repetir). Cinza neutro, sem identidade visual ainda.
**Pronto quando:** o critério de pronto da Fase 1 — colar uma URL e fazer **10 segmentos seguidos sem tocar no mouse**.

### T-09 — Tela de entrada + colar legenda
Home com o campo de URL, tratamento dos erros tipados do T-06 e o caminho "colar legenda" (RF-02b) sempre visível.
**Pronto quando:** um vídeo sem legenda leva, em dois cliques, a praticar com SRT colado à mão.

---

## Contratos (definir no T-01, não negociar depois)

```ts
type Cue     = { id: string; startMs: number; endMs: number; text: string };
type Segment = { index: number; startMs: number; endMs: number; referenceText: string };

type TokenStatus = 'correct' | 'typo' | 'wrong' | 'missing' | 'extra';
type DiffResult  = { tokens: { text: string; status: TokenStatus; expected?: string }[]; accuracy: number };
```

Regra: `segmenter`, `normalize` e `diff` **não conhecem React, nem o YouTube, nem o DOM**. Recebem dados, devolvem dados. É o que mantém a suíte de testes rápida e o que permite trocar a origem da legenda sem tocar na lógica de correção.

---

## Sequenciamento visual

```
S-1 ─┐
S-2 ─┴→ T-01 ─┬→ T-02 ─────────────────┬→ T-09
              ├→ T-03 ─┬→ T-04 ─┐      │
              │        └────────┤      │
              ├→ T-05 ──────────┼→ T-08
              ├→ T-06 ──────────┘      │
              └→ T-07 ─────────────────┘
```
T-02 a T-07 não dependem umas das outras (fora T-04, que quer cues do T-03) — a ordem acima é a sugerida por risco, não por obrigação.

---

## O que NÃO entra na Fase 1
Persistência, resumo de sessão, hints, configurações, velocidade, modo revisão, identidade visual, offset de sincronia, seleção de faixa de tempo. Todos já têm lugar nas Fases 2 e 3 da spec — a tentação vai ser puxar "só um" para cá.

---

## Riscos do plano (≠ riscos do produto, §9 da spec)
- **T-05 estoura o prazo.** É a tarefa com mais casos de borda. Corte previsto: adiar §5.2 (números).
- **S-1 falha.** Não é um problema, é informação — inverte a ordem de T-06 e T-09 e o MVP continua de pé graças ao SRT manual.
- **Perfeccionismo no segmentador.** T-04 tem retorno decrescente rápido: "bom o bastante para praticar" encerra a tarefa; o ajuste fino vem do uso real, não da imaginação.
