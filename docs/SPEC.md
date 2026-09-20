# Spec — Practice With Video (dictation trainer)

> Status: **draft v1** · Data: 2026-09-20 · Autor: Gledson Miranda
> Fase 1 (MVP) implementada — ver `PLAN.md` para o que cada tarefa entregou.

---

## 1. Visão geral

Ferramenta pessoal de estudo de inglês baseada em **ditado (dictation)**: você cola a URL de um vídeo do YouTube, o app carrega o vídeo e a legenda em inglês, e então reproduz o vídeo **em pedaços curtos**. Ao fim de cada pedaço o vídeo **pausa automaticamente** e só volta a tocar depois que você **digitar o que ouviu**. O app compara o que você escreveu com a legenda real, mostra palavra a palavra o que acertou/errou, e segue para o próximo trecho.

O objetivo não é decorar o vídeo, é **treinar listening/compreensão**: forçar o ouvido a resolver connected speech, contrações, reduções e vocabulário em velocidade nativa.

### 1.1 Princípios de produto
1. **O loop é sagrado.** Ouvir → digitar → conferir → repetir. Tudo que não serve a esse loop é secundário.
2. **Teclado primeiro.** A mão não deve sair do teclado durante uma sessão. Mouse é opcional.
3. **Erro é informação, não punição.** O feedback mostra exatamente qual palavra falhou, não só "errado".
4. **Ferramenta pessoal.** Single-user, roda local. Sem login, sem multi-tenant, sem analytics de terceiros.
5. **Falha graciosa.** Vídeo sem legenda, legenda ruim ou embed bloqueado precisam dar uma mensagem clara, nunca uma tela branca.

### 1.2 Fora de escopo (v1)
- Contas de usuário, sincronização entre dispositivos, backend com banco.
- Reconhecimento de fala (falar em vez de digitar).
- Tradução para português, dicionário embutido, flashcards/SRS.
- Outros idiomas além de inglês.
- Outras fontes além do YouTube (Vimeo, arquivo local, serviços de streaming).
- Mobile nativo (layout responsivo é desejável, mas digitar texto longo no celular não é o caso de uso).

---

## 2. Decisões já tomadas

| Tema | Decisão | Consequência |
|---|---|---|
| Stack | **Next.js (App Router) + TypeScript** | Tem servidor: a busca da legenda acontece em route handler, sem CORS. Deploy futuro trivial. |
| Legendas | **Legendas do próprio YouTube** | Grátis, já vêm com timestamps. Limitação: vídeo sem legenda em inglês não é suportado no v1. |
| Correção | **Tolerante, configurável** | Normaliza caixa/pontuação por padrão; modo estrito é opção. Diff palavra a palavra. |
| Persistência | **Só no browser (IndexedDB)** | Zero infra. Export/import JSON como backup manual. |
| Identidade visual | **Própria** | Do `DESIGN.md` aproveita-se só a *estrutura* (escala de espaçamento, hierarquia tipográfica, raios, padrões de componente); paleta, nome e fontes são próprios. |
| Contrações e reduções | **Aceitar todas as formas equivalentes** | `don't` = `do not`, e também `gonna` = `going to`, `wanna` = `want to`. Exige tabela de equivalência bidirecional e alinhamento multi-token (§5.1). |
| Corte do MVP | **Fase 1: loop puro, sem persistência** | Fechar a aba perde o progresso. Persistência entra na Fase 2. |
| Tamanho do segmento | **3–8s, até ~15 palavras** | Valor fixo no MVP; vira configuração na Fase 2. |
| Números | **Dígito = extenso** | Tabela limitada (0–100, redondos, anos, ordinais comuns). Ver §5.2. |
| Fallback de legenda | **SRT/VTT manual já no v1** | Entra na Fase 1: parser + textarea. Nunca ficar travado se a rota automática cair. |
| Atalho de repetir | **`Ctrl/Cmd + Enter`** | Sem conflito com o browser, sem quebrar navegação por teclado. |
| Execução | **Só `localhost`** | Sem deploy. Evita IP de datacenter na busca de legenda e mantém o uso claramente pessoal. |

---

## 3. Persona e caso de uso

**Único usuário:** estudante de inglês intermediário (B1–B2) que entende texto escrito bem melhor do que áudio. Senta 15–30 min por dia com um vídeo de interesse próprio (podcast, talk, review de tech) e faz ditado de um trecho.

**Sessão típica:**
1. Cola a URL de um vídeo de ~10 min.
2. App confirma que existe legenda em inglês e quantos segmentos serão gerados.
3. Escolhe começar do início (ou pular para 03:20, onde parou ontem).
4. Pratica 20 segmentos, erra bastante em contrações e números.
5. Vê o resumo: 78% de acurácia, 12 palavras problemáticas listadas.
6. Fecha. No dia seguinte reabre o mesmo vídeo e o app oferece continuar de onde parou.

---

## 4. Requisitos funcionais

### RF-01 — Entrada de vídeo
- Campo único que aceita: URL completa (`youtube.com/watch?v=ID`), `youtu.be/ID`, URL com `&t=`, URL de embed, ou o ID puro (11 caracteres).
- Extrai o `videoId`; se inválido, erro inline imediato ("Não consegui identificar um vídeo do YouTube nessa URL").
- Se a URL tiver `t=`/`start=`, o app oferece iniciar a partir daquele ponto.
- Histórico dos últimos vídeos praticados fica listado na home, clicável.

### RF-02 — Obtenção da legenda
- Ao submeter, o servidor busca a lista de faixas de legenda do vídeo e escolhe, nesta ordem:
  1. Legenda **manual** em inglês (`en`, `en-US`, `en-GB`);
  2. Legenda **auto-gerada** (ASR) em inglês;
  3. Falha com mensagem específica.
- O app deixa explícito qual foi usada, porque muda a experiência:
  - **Manual:** tem pontuação e capitalização; o modo estrito faz sentido.
  - **Auto-gerada:** normalmente sem pontuação, sem capitalização, com erros de ASR e cues sobrepostos/duplicados. O modo tolerante é obrigatório aqui.
- Se houver mais de uma faixa em inglês, o usuário pode escolher qual usar.
- A legenda obtida é **cacheada** (ver §7.3) para não refazer a requisição a cada visita.
- Caso o vídeo só tenha legenda em outro idioma, o app avisa e não permite praticar (fora de escopo).

### RF-02b — Legenda manual (SRT/VTT) — caminho de primeira classe, já no v1
Não é só tela de erro: é uma opção **sempre visível** na entrada, ao lado do campo de URL. Depois do spike isso deixou de ser luxo — é a única rota que não depende de um endpoint não documentado continuar funcionando.

Sempre que a busca automática falhar (vídeo sem legenda, yt-dlp desatualizado, rate limit), o erro vem acompanhado desse caminho de saída: **colar a legenda à mão**.
- Textarea que aceita **SRT** e **WebVTT** (os dois formatos que se encontra na prática), detectando o formato automaticamente.
- O parser valida e mostra um preview: nº de cues, duração coberta, primeira e última linha — para você confirmar que colou a legenda certa antes de começar.
- Timestamps em `HH:MM:SS,mmm` (SRT) e `HH:MM:SS.mmm` (VTT); ignora índices, `WEBVTT`, `NOTE`, `STYLE` e tags inline (`<i>`, `<c>`, `<00:00:01.000>`).
- A legenda colada segue exatamente o mesmo caminho da automática a partir daí (segmentação, correção), e é tratada como **manual** para efeito de modo estrito.
- Também acessível de propósito, não só em caso de erro: um link "colar legenda" sempre disponível na tela de entrada.

### RF-03 — Segmentação
A legenda crua vem em *cues* de tamanho irregular (às vezes 1s, às vezes uma palavra solta). Ela precisa ser reagrupada em **segmentos praticáveis**.

Regras do segmentador:
- Alvo: **3–8 segundos** de áudio por segmento, **máximo ~15 palavras**.
- Quebra preferencial em pontuação final (`.`, `?`, `!`), depois em `,`/`;`, depois em pausa de silêncio ≥ 0,7s entre cues.
- Nunca quebra no meio de um cue.
- Junta cues consecutivos enquanto o segmento estiver abaixo do alvo mínimo.
- Remove cues não-falados: `[Music]`, `[Applause]`, `[Laughter]`, `>>`, marcações de speaker do tipo `NAME:` (configurável — ver §10).
- Deduplica o *rolling text* da legenda auto-gerada (o YouTube repete a linha anterior no cue seguinte).
- O usuário pode ajustar o tamanho alvo do segmento (curto / médio / longo) nas configurações; regenerar segmentos não perde o progresso já feito, porque o progresso é ancorado em timestamp.

Cada segmento final tem: `{ index, startMs, endMs, referenceText, sourceCueIds }`.

### RF-04 — Reprodução e pausa automática
- Player embutido via **YouTube IFrame Player API**.
- Ao iniciar um segmento: `seekTo(startMs)` + `playVideo()`.
- A API **não** dispara evento "chegou no tempo X", então o app faz **polling de `getCurrentTime()` a cada 100ms** e chama `pauseVideo()` ao cruzar `endMs`.
- **Medido no spike S-2:** o vídeo para ~**64ms depois** do alvo, com desvio de apenas ±8ms; polling de 50ms não melhora. **Lead fica em 0** — pausar cedo cortaria a última sílaba, e pausar 64ms tarde cai no silêncio entre frases.
- **Requisito descoberto no S-2:** esperar o `seekTo` assentar (~600ms) antes de começar a contar. Sem isso, o polling lê o tempo antigo e o segmento nunca pausa.
- Após pausar, o foco vai automaticamente para o campo de digitação.
- O vídeo **não avança** enquanto o segmento não for respondido (ou explicitamente pulado).
- Controles disponíveis durante o ditado:
  - **Repetir segmento** (quantas vezes quiser; contabilizado nas stats).
  - **Velocidade** 1x / 0.75x / 0.5x (via `setPlaybackRate`).
  - **Repetir só os últimos 2 segundos** do segmento.
  - **Pular segmento** (marca como pulado, revela a resposta).
- As legendas nativas do YouTube (CC) ficam **desligadas** no player (`cc_load_policy: 0`) — ver a legenda derrota o exercício. Também é preciso reduzir a UI do player o suficiente para que o CC não seja ativado sem querer (ver §9, risco R-04).

### RF-05 — Digitação e verificação
- Textarea de uma/duas linhas, autofoco, com `spellcheck`, `autocorrect` e `autocapitalize` **desligados** — o browser não pode corrigir por você.
- **Enter** verifica. **Shift+Enter** quebra linha.
- Comparação (pipeline):
  1. Normaliza os dois lados conforme o modo (ver §5).
  2. Tokeniza em palavras.
  3. Alinha com diff palavra a palavra (LCS + Levenshtein por token).
  4. Classifica cada token: **acerto**, **erro de digitação**, **palavra errada**, **faltando**, **sobrando**.
- Resultado mostra a frase de referência com marcação colorida e a sua tentativa alinhada.
- Acurácia do segmento = tokens corretos / tokens da referência.
- Se acertou tudo: avança sozinho para o próximo segmento após ~700ms.
- Se errou: mostra o diff e espera ação — **tentar de novo** (limpa o campo, replay automático do áudio) ou **aceitar e seguir**.
- Limite configurável de tentativas antes de revelar a resposta (padrão: 3; 0 = ilimitado).

### RF-06 — Ajudas (hints)
Disponíveis antes de verificar, cada uma registrada nas stats:
- **Revelar nº de palavras** (mostra `_ _ _ _` com o comprimento de cada palavra).
- **Revelar primeira letra** de cada palavra.
- **Revelar próxima palavra** (a primeira ainda não digitada).
- **Revelar tudo** (equivale a pular).

### RF-07 — Progresso e navegação
- Barra de progresso por segmento (X de N) e por tempo de vídeo.
- Navegar para o segmento anterior/próximo manualmente.
- Retomar automaticamente do último segmento não concluído ao reabrir o vídeo.
- Modo revisão: percorrer só os segmentos errados/pulados de uma sessão anterior.

### RF-08 — Resumo da sessão
Ao terminar (ou ao encerrar manualmente):
- Acurácia geral, nº de segmentos, tempo gasto, nº de replays, nº de hints.
- Lista das **palavras mais problemáticas** (agregadas em lowercase, ordenadas por frequência de erro) — essa lista é o principal valor de aprendizado.
- Botão para copiar/exportar o resumo em Markdown.

### RF-09 — Configurações
Persistidas localmente: modo de correção (tolerante/estrito), tamanho de segmento, velocidade padrão, replay automático ao errar, limite de tentativas, filtro de cues não-falados, tema (claro/escuro).

### RF-10 — Atalhos de teclado
| Atalho | Ação |
|---|---|
| `Enter` | Verificar |
| `Shift+Enter` | Nova linha |
| `Ctrl/Cmd + Enter` | Repetir o segmento |
| `Ctrl/Cmd + Shift + Enter` | Repetir só os últimos 2s |
| `Ctrl/Cmd + ↓` / `↑` | Diminuir / aumentar velocidade |
| `Ctrl/Cmd + H` | Próxima ajuda |
| `Ctrl/Cmd + →` | Pular segmento |
| `Esc` | Pausar sessão |

Nenhum desses atalhos conflita com comandos do browser. `Ctrl+R` (reload) foi **deliberadamente evitado**: se o `preventDefault` falhasse, a página recarregaria e — no MVP, que não tem persistência — a sessão inteira seria perdida.

---

## 5. Regras de normalização (correção tolerante)

**Modo tolerante (padrão)** — ignora:
- Caixa (`The` = `the`).
- Pontuação e símbolos nas bordas das palavras (`don't,` = `dont` = `don't`).
- Apóstrofos retos vs. curvos.
- Espaços múltiplos e espaços não separáveis.
- Diferenças ortográficas US/UK de uma lista curta (`color`/`colour`, `realize`/`realise`, `traveling`/`travelling`).
- **Números** por extenso vs. dígito — ver §5.2.
- **Contrações e reduções faladas** — ver §5.1, o ponto mais sensível da correção.
- Filler words da legenda ASR (`uh`, `um`, `mm`, `hmm`) — omitir não conta erro; digitar também não.

**Erro de digitação (typo):** token com distância de Levenshtein ≤ 1 (palavras até 5 letras) ou ≤ 2 (palavras maiores) é marcado em **amarelo** e conta como acerto parcial (0,5) — a ideia é separar "não entendi a palavra" de "escorreguei no teclado".

### 5.1 Contrações e reduções faladas

**Problema real:** a legenda do YouTube frequentemente escreve a forma *ortográfica* mesmo quando o falante usou a forma *reduzida*. A pessoa diz "gonna", a legenda escreve "going to". Quem transcreve pelo ouvido escreve "gonna" — e seria marcado como erro, quando na verdade ouviu **melhor** do que a legenda registrou. O mesmo vale ao contrário (legenda ASR escreve "wanna", você escreve "want to").

**Regra:** as formas equivalentes são aceitas **nos dois sentidos**, em ambas as direções da comparação.

Categorias cobertas pela tabela de equivalência:

| Categoria | Exemplos |
|---|---|
| Contrações padrão | `don't`/`do not`, `I'm`/`I am`, `they're`/`they are`, `won't`/`will not`, `can't`/`cannot`/`can not` |
| Reduções coloquiais | `gonna`/`going to`, `wanna`/`want to`, `gotta`/`got to`, `hafta`/`have to`, `tryna`/`trying to` |
| Reduções de `of` | `kinda`/`kind of`, `sorta`/`sort of`, `outta`/`out of`, `lotta`/`lot of`, `cuppa`/`cup of` |
| Modal + have | `shoulda`/`should have`/`should've`, `woulda`, `coulda`, `musta` |
| Pronome reduzido | `lemme`/`let me`, `gimme`/`give me`, `'em`/`them`, `y'all`/`you all`, `dunno`/`don't know` |
| Outras | `'cause`/`because`/`cuz`, `ya`/`you`, `ain't` (ver ambiguidade abaixo) |

**Implicação técnica — alinhamento multi-token.** `gonna` é 1 token e `going to` são 2. Um diff palavra a palavra ingênuo desalinha a frase inteira a partir daí e pinta tudo de vermelho. Duas consequências para a implementação:

1. A normalização roda em **duas passadas**: primeiro um *pre-pass de frase* que canoniza as expressões multi-palavra (a forma expandida vira a canônica: `gonna` → `going to`), depois a tokenização. Assim os dois lados chegam ao diff com a mesma contagem de tokens.
2. O matcher compara **conjuntos de variantes aceitas** por posição, não strings: dois tokens casam se os conjuntos se cruzam. Isso resolve os casos ambíguos, em que expandir seria *escolher errado*:
   - `he's` = `he is` **ou** `he has`
   - `I'd` = `I would` **ou** `I had`
   - `ain't` = `am not` / `is not` / `are not` / `has not`
   - `'s` possessivo (`John's car`) **não** é contração e nunca deve ser expandido.

**Testes obrigatórios** (§7.5) para esse módulo: `"I'm gonna go"` vs `"I am going to go"` vs `"Im gonna go"` — as três precisam dar 100%; e `"the dog's bone"` vs `"the dog is bone"` precisa dar **erro**, para provar que o possessivo não foi expandido.

**Limite conhecido:** a tabela é finita e não cobre sotaques/reduções raras (`whatcha`, `betcha`, `innit`). Começa com ~40 entradas e cresce conforme o uso — quando um erro injusto aparecer, a correção é adicionar uma linha na tabela e um teste.

### 5.2 Números

Dígito e forma por extenso são **equivalentes nos dois sentidos**, com uma tabela deliberadamente limitada (não é uma biblioteca de conversão completa):

| Cobre | Exemplos |
|---|---|
| Cardinais 0–100 | `5` = `five`, `21` = `twenty-one` = `twenty one` |
| Redondos | `200`, `1000`, `1500` = `fifteen hundred` = `one thousand five hundred` |
| Anos | `1990` = `nineteen ninety`, `2024` = `twenty twenty-four` = `two thousand twenty-four` |
| Ordinais comuns | `1st` = `first`, `3rd` = `third` |
| Porcentagem | `10%` = `ten percent` |

Não cobre (compara literalmente): decimais, moeda, números grandes arbitrários, telefones, horários. Como no §5.1, a canonização acontece no pre-pass de frase — `twenty one` são 2 tokens e `21` é 1.

**Siglas:** comparadas ignorando pontos e caixa (`NASA` = `nasa` = `N.A.S.A.`). Soletrar uma sigla por extenso não é aceito.

**Modo estrito:** só normaliza espaços em branco; todo o resto precisa bater. Fica desabilitado automaticamente quando a legenda é auto-gerada (não faz sentido exigir pontuação de um texto que não tem pontuação).

---

## 6. Fluxo / máquina de estados

```
idle
  └─(submete URL)→ resolving        # extrai videoId, busca faixas de legenda
        ├─(falha)→ error            # sem legenda / vídeo indisponível / embed bloqueado
        └─(ok)→ ready               # segmentos gerados, player carregado
              └─(start)→ playing    # tocando o segmento atual
                    └─(atinge endMs)→ awaiting_input   # pausado, foco no textarea
                          ├─(Enter)→ checking → feedback
                          │      ├─(correto)→ next
                          │      └─(errado)→ awaiting_input (retry) | next (aceitar)
                          ├─(replay)→ playing
                          └─(skip)→ next
                                └─ next: há mais segmentos? playing : session_summary
```

Estados extras: `paused` (Esc), `seeking` (usuário navegou manualmente).

---

## 7. Arquitetura técnica

### 7.1 Stack
- **Next.js (App Router) + TypeScript (strict)**
- **Tailwind CSS**, com tokens derivados do `DESIGN.md` (ver §8)
- **Zustand** (ou `useReducer` + Context) para a máquina de estados da sessão
- **Dexie** sobre IndexedDB para persistência
- **Zod** para validar payloads das route handlers
- **Vitest** para unit tests (segmentador, normalizador, diff) + **Playwright** para 1–2 fluxos E2E
- Sem biblioteca de componentes pesada; componentes próprios

### 7.2 Estrutura de pastas (proposta)
```
app/
  page.tsx                     # home: input de URL + histórico
  practice/[videoId]/page.tsx  # sessão de ditado
  api/transcript/route.ts      # GET ?videoId= → faixas + cues
  api/video/route.ts           # GET ?videoId= → metadados (título, duração, thumb)
components/
  YouTubePlayer.tsx            # wrapper da IFrame API
  DictationInput.tsx
  DiffResult.tsx
  SegmentProgress.tsx
  SessionSummary.tsx
lib/
  youtube/parse-url.ts
  youtube/transcript.ts        # fetch + parse das faixas (camada isolada, trocável)
  captions/parse-srt.ts        # plano B: SRT/VTT colado à mão
  segmenter.ts                 # cues → segmentos
  normalize.ts                 # regras da §5
  diff.ts                      # alinhamento palavra a palavra
  stats.ts
  db.ts                        # Dexie
types/
```

### 7.3 Obtenção da legenda (ponto crítico)
Não existe API pública e oficial do YouTube que devolva o **texto** da legenda de um vídeo de terceiros — a Data API v3 (`captions.download`) só funciona para vídeos do próprio canal autenticado. Na prática as opções são:

- **A.** Ler a página do vídeo no servidor, extrair `captionTracks` do `ytInitialPlayerResponse` e baixar a faixa pelo endpoint `timedtext`.
- **B.** Usar uma lib que encapsula isso (`youtube-transcript`, `youtubei.js`).

- **C.** Delegar para o `yt-dlp` (binário Python), chamado pelo route handler.

> ⚠️ **Atualizado pelo spike (2026-09-20, ver `SPIKE-RESULTS.md`): A e B estão bloqueadas hoje.** O `timedtext` devolve **200 com corpo vazio** em todos os seis clientes internos testados — bloqueio por *proof-of-origin token*. Só a opção **C (`yt-dlp`)** entregou legenda.

**Decisão: C — `yt-dlp` chamado pelo route handler, com o caminho manual (RF-02b) como opção de primeira classe na UI, não apenas tela de erro.** O bloqueio é de *quem faz a requisição*, não do runtime: com o yt-dlp como processo filho, o Next.js obtém a legenda normalmente (validado em S-1b, ~2,3s por vídeo). Preço: dependência de binário externo, documentada no README, e um `yt-dlp -U` ocasional.

**Restrições que o spike impôs, valham para qualquer opção:**
- Baixar **uma única faixa por vídeo** — pedir a segunda em sequência rápida tomou **HTTP 429**.
- Cachear com força; tratar a legenda como cara de obter.
- Ao diagnosticar com `youtubei.js`, usar sempre `retrieve_player: true` — com `false` o vídeo aparece como `UNPLAYABLE` e sem faixas, um falso negativo.

**Riscos assumidos:** é um endpoint não documentado; o YouTube muda o formato periodicamente e aplica rate limit por IP. Uso pessoal, não comercial. O plano B — colar SRT/VTT à mão (RF-02b) — deixou de ser luxo e virou a única rota garantida.

**Cache:** resposta guardada em IndexedDB por `videoId` (com a data da busca) e, em desenvolvimento, opcionalmente em disco no servidor. Botão "recarregar legenda" força refetch.

### 7.4 Modelo de dados (IndexedDB)
```ts
type Video = {
  videoId: string; title: string; durationSec: number; thumbnailUrl: string;
  captionKind: 'manual' | 'asr'; captionLang: string;
  cues: Cue[];            // legenda crua, como veio
  fetchedAt: number;
};

type Cue = { id: string; startMs: number; endMs: number; text: string };

type Segment = {
  videoId: string; index: number;
  startMs: number; endMs: number;
  referenceText: string;
};

type Attempt = {
  id: string; videoId: string; segmentIndex: number;
  typedText: string; accuracy: number;     // 0..1
  status: 'correct' | 'partial' | 'skipped';
  replays: number; hintsUsed: number;
  durationMs: number; createdAt: number;
  wrongWords: string[];                    // alimenta o agregado de palavras difíceis
};

type Session = {
  id: string; videoId: string;
  startedAt: number; endedAt?: number;
  lastSegmentIndex: number;
  settingsSnapshot: Settings;
};

type Settings = { /* §RF-09 */ };
```

### 7.5 Estratégia de testes
- **Unit (o coração):** `normalize`, `diff` e `segmenter` com tabela de casos — contrações e reduções (§5.1), números (§5.2), typos, cues duplicados de ASR, `[Music]`, cue de 0,3s, cue de 30s.
- **Parser SRT/VTT:** arquivo bem formado, arquivo com CRLF, timestamps nos dois separadores (`,` e `.`), tags inline, entrada inválida (precisa dar erro legível, não crashar).
- **Fixtures:** 2–3 legendas reais salvas em JSON (uma manual, uma auto-gerada) para não depender da rede nos testes.
- **E2E:** "cola URL → primeiro segmento pausa → digita certo → avança", com a rota de transcript mockada.

---

## 8. UI / Design

O repositório contém `DESIGN.md`, um design system extraído de um site de marca. **Decisão: identidade própria.** Dele aproveita-se apenas a *estrutura*, que é genérica e bem resolvida:
- a escala de espaçamento (4/8/16/24/32/48/64/96);
- a hierarquia tipográfica (tamanhos em incrementos fechados, body com line-height 1.5);
- a escala de raios (input pequeno, card médio, botão pill);
- os padrões de estado de componente (default / hover / pressed / disabled / focus).

Paleta, fontes e nome são próprios — nada de cor de marca, logotipo ou nome de terceiro no app. Fontes: uma sans de sistema para UI e uma **monoespaçada** para o texto do ditado (o alinhamento do diff palavra a palavra fica muito mais legível em mono).

Demais diretrizes:
- Modo escuro como padrão (assistir vídeo com fundo claro cansa).
- O player ocupa o topo/centro; o campo de digitação fica **imediatamente abaixo** do vídeo, sem precisar rolar a página em 1366×768.
- Diff colorido: verde = certo, amarelo = typo, vermelho = errado, cinza tracejado = faltando, riscado = sobrando. Cor **nunca** é o único indicador (ícone/sublinhado também), por acessibilidade.
- Layout em 3 zonas: player (topo) · input + feedback (meio) · progresso e atalhos (rodapé).
- Nada de animação longa entre segmentos — o ritmo do loop é o produto.

> Pendente: definir nome e paleta do app (não bloqueia a Fase 1 — o MVP pode nascer em cinza neutro).

---

## 9. Riscos e casos de borda

| ID | Risco / caso | Tratamento |
|---|---|---|
| R-01 | Vídeo **sem legenda** em inglês | Mensagem clara ao resolver a URL, antes de carregar o player. |
| R-02 | Legenda **auto-gerada ruim** (sem pontuação, ASR errado) | Modo tolerante forçado; botão "essa legenda está errada, pular" sem contar como erro. |
| R-03 | **Embed desabilitado**, restrição de idade ou bloqueio regional | O player emite erro (100/101/150). Detectar e exibir mensagem específica com link para abrir no YouTube. |
| R-04 | Usuário liga o **CC** no player e vê a resposta | `cc_load_policy: 0`, `controls` reduzido e overlay opcional cobrindo a faixa inferior do vídeo durante o ditado. |
| R-05 | Legenda **fora de sincronia** com o áudio | Ajuste global de offset (±ms) nas configurações, aplicado ao seek e à pausa. |
| R-06 | Endpoint de legenda **quebra** (mudança do YouTube) | Camada isolada + fallback SRT/VTT manual (RF-02b), disponível desde o v1 — o app nunca fica inutilizável. |
| R-07 | Vídeo **muito longo** (2h+) gera centenas de segmentos | Selecionar faixa de tempo (ex.: 05:00–15:00) antes de começar. |
| R-08 | **Live stream** ou vídeo sem duração fixa | Bloquear com mensagem. |
| R-09 | Pausa imprecisa (corta a última sílaba) | Lead time configurável e padding de ~150ms no fim do segmento. |
| R-10 | Perda de dados no IndexedDB (limpar o browser) | Export/import JSON manual + aviso na primeira sessão. |
| R-11 | Anúncio toca antes do vídeo e o polling pausa no tempo errado | Só iniciar o polling após o estado `PLAYING` e `getCurrentTime()` estar dentro da faixa esperada. |
| R-12 | Termos de uso do YouTube quanto a acessar legendas por rota não oficial | Uso pessoal e local; não redistribuir legenda; revisar antes de hospedar publicamente. |

---

## 10. Perguntas em aberto

### Resolvidas
- ~~**Q-01 — Identidade visual.**~~ → Identidade própria; do `DESIGN.md` só a estrutura (§8).
- ~~**Q-02 — Tamanho do segmento.**~~ → 3–8s / até ~15 palavras, fixo no MVP.
- ~~**Q-04 — Contrações.**~~ → Aceitar todas as formas equivalentes, incluindo reduções faladas (`gonna`, `wanna`). Detalhe em §5.1.
- ~~**Q-07 — Escopo do MVP.**~~ → Fase 1: loop puro, sem persistência.

- ~~**Q-03 — Fallback de legenda.**~~ → Colar SRT/VTT já no v1 (RF-02b), na Fase 1.
- ~~**Q-05 — Atalhos.**~~ → `Ctrl/Cmd + Enter` para repetir; `Ctrl+R` evitado de propósito.
- ~~**Q-06 — Números e siglas.**~~ → Dígito = extenso, com tabela limitada (§5.2).
- ~~**Q-08 — Deploy.**~~ → Só `localhost`, sem deploy.

### Em aberto
- **Q-09 — Vocabulário.** A lista de "palavras problemáticas" (§RF-08) deve virar algo acionável — exportar para Anki/CSV — ou basta vê-la no resumo da sessão? Não bloqueia nada: é da Fase 2 em diante.

---

## 11. Roadmap

### Fase 1 — MVP (o loop funciona de ponta a ponta)
1. Setup: Next.js + TS + Tailwind + Vitest.
2. `parse-url` + rota `/api/transcript` buscando a legenda em inglês.
3. Parser SRT/VTT + tela de colar legenda manualmente (RF-02b).
4. `segmenter` com testes.
5. Player com IFrame API + pausa automática no fim do segmento.
6. `normalize` (§5, §5.1, §5.2) + `diff` + feedback visual palavra a palavra.
7. Avançar / repetir / pular segmento. Progresso X de N. Atalhos essenciais (`Enter`, `Ctrl+Enter`).

**Critério de pronto:** colar a URL de um vídeo com legenda manual e fazer 10 segmentos seguidos sem tocar no mouse.

### Fase 2 — Utilizável no dia a dia
8. Persistência (Dexie): retomar de onde parou, histórico de vídeos.
9. Resumo de sessão + palavras problemáticas.
10. Configurações (§RF-09) + controle de velocidade + replay dos últimos 2s.
11. Suporte decente a legenda auto-gerada (dedupe, filler words).

### Fase 3 — Refino
12. Hints (§RF-06) e limite de tentativas.
13. Modo revisão dos segmentos errados.
14. Seleção de faixa de tempo para vídeos longos.
15. Ajuste de offset de sincronia.
16. Export/import JSON.
17. Atalhos completos + acessibilidade (foco visível, feedback anunciado por leitor de tela).

### Ideias para depois (não comprometidas)
- Fallback de transcrição via Whisper para vídeos sem legenda.
- Exportar palavras difíceis para Anki/CSV.
- Modo "shadowing" (repetir falando, com gravação).
- Estatísticas ao longo do tempo (gráfico de acurácia por semana).

---

## 12. Métricas de sucesso (pessoais)
- Praticar 15 minutos sem atrito de UI (nada de recarregar, nada de mouse).
- Acurácia média subindo ao longo das semanas no mesmo tipo de conteúdo.
- A lista de palavras problemáticas realmente apontar padrões (ex.: sempre erra `-ed` final, sempre confunde `can` com `can't`).
