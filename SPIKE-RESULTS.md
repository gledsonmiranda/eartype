# Resultados do spike — 2026-09-20

Passo 0 do `PLAN.md`. Código em `/spike` (descartável).
Ambiente: Windows 11, Node 24.19, Python 3.12.10, Chrome.

---

## S-1 — A legenda vem mesmo?  🔴 → 🟢 (por outra rota)

### O que falhou: `youtubei.js`
A biblioteca **lista** as faixas de legenda, mas **não consegue baixá-las**:

| Tentativa | Resultado |
|---|---|
| `info.getTranscript()` | HTTP **400** no endpoint `youtubei/v1/get_transcript` |
| `fetch(track.base_url)` (`timedtext`) | HTTP **200 com 0 bytes** |
| Idem, `&fmt=json3` / `&fmt=srv3` / default | **200 / 0 bytes** nos três |
| Idem, nos clientes `WEB`, `ANDROID`, `IOS`, `MWEB`, `TV_EMBEDDED`, `WEB_EMBEDDED` | **200 / 0 bytes** nos seis |

`200` com corpo vazio é a assinatura do bloqueio por *proof-of-origin token*: o YouTube aceita a requisição e devolve nada. Não é erro de código nem de vídeo específico — é a porta fechada.

**Armadilha encontrada no caminho:** com `retrieve_player: false`, o `getInfo` devolve `playability_status: UNPLAYABLE` e **zero faixas** — um falso negativo que faz parecer que o vídeo não tem legenda. Com `retrieve_player: true`, o mesmo vídeo devolve `OK` e as faixas `en(manual), de(manual)`. Qualquer diagnóstico futuro precisa usar `true`.

### O que funcionou: `yt-dlp`
Versão 2026.08.19, instalado em venv isolado (`spike/.venv`):

```
yt-dlp --skip-download --write-sub --write-auto-sub --sub-lang "en.*" --sub-format vtt
```

Baixou WEBVTT válido: 6 cues, cabeçalho `WEBVTT / Kind: captions / Language: en`, timestamps `00:00:01.200 --> 00:00:03.360` (separador `.`), sem tags inline.

**Observações:**
- `WARNING: ... no impersonate target is available` — aviso, não erro; o download funcionou. Resolvível com `curl_cffi` se um dia atrapalhar.
- **HTTP 429 (Too Many Requests)** ao puxar a terceira faixa do mesmo vídeo em sequência rápida. Consequência de design: **baixar exatamente uma faixa por vídeo** e cachear com força.

### S-1b — o Next.js consegue, chamando o yt-dlp como processo?  🟢 SIM

Pergunta levantada ao decidir a arquitetura: *se o Node está bloqueado, a rota do Next.js não estaria também?*

**Não.** O bloqueio é de **quem faz a requisição HTTP**, não do runtime. Testado com `child_process.execFile` disparando o yt-dlp a partir do Node:

```json
{ "file": "jNQXAC9IVRw.en.vtt", "bytes": 440, "cues": 6, "ms": 2316 }
```

**Três condições que isso impõe:**
1. **`--sub-lang en`, nunca `en.*`.** O glob casava com `en`, `en-en` e `en-de`; a terceira requisição tomou **429** e, como o yt-dlp sai com código diferente de zero, derrubou a chamada inteira — inclusive as duas faixas que já tinham baixado com sucesso.
2. **A rota precisa do runtime Node do Next.js, não do Edge** — Edge não tem `child_process`.
3. **O IP continua contando.** Localhost está bem; de um servidor na nuvem o bloqueio voltaria.

**Custo de UX:** ~**2,3s** por vídeo na primeira busca. Exige estado de carregamento explícito, e torna o cache obrigatório, não opcional.

### Veredito
A rota automática em Node puro está morta hoje. O `yt-dlp` resolve — inclusive chamado de dentro do Next.js — ao custo de um **binário externo (Python)**. Ver `PLAN.md` §T-06.

### S-1c — cobertura nos 5 vídeos reais  🟢 5/5

Lista em `videos-for-test.md`. Uma faixa `en` por vídeo, `--write-sub --write-auto-sub`:

| # | tipo | videoId | duração | legenda | cues | VTT |
|---|---|---|---|---|---|---|
| 1 | manual (MKBHD) | `ohqxP8EEumo` | 18min | **manual** (`en`, +ja/pt/ru/tr/vi) | 431 | 31 KB |
| 2 | só ASR | `45oG6w7bvtM` | 19min | auto | 776 | 132 KB |
| 3 | longo | `8dHEG7WxR4c` | **1h26** | auto | 5.334 | 918 KB |
| 4 | canal pequeno (4 mil views) | `xxdlUHSWM7E` | 14min | auto | 798 | 137 KB |
| 5 | suspeita de restrição | `Fy291Q3a6zs` | 26min | auto | 1.180 | 187 KB |

Nenhuma restrição apareceu: os cinco baixaram em sequência, sem 429 e sem cookies. O vídeo 3 mostra o teto real de tamanho — **918 KB e 5.334 cues** numa resposta só, o que pesa no cache do T-06.

**Bloqueio novo no meio do caminho:** o YouTube passou a responder `Sign in to confirm you're not a bot` para **todos** os vídeos e **todos** os clientes (`tv`, `android_vr`, `web_embedded`, `mweb`) — bloqueio por IP, provável herança do 429 do dia anterior. Destravou sozinho em poucos minutos, sem nenhuma ação nossa — nenhuma das alternativas testadas (outro cliente, runtime JS, cookies) teve efeito. Duas lições:

1. **`--js-runtimes node` agora é obrigatório.** Sem um runtime JS o yt-dlp cai num caminho deprecado e some com metadados (`No title found in player responses`). O Node já é dependência do projeto, então não custa nada.
2. **Cookies do navegador não são plano B viável no Windows.** `--cookies-from-browser chrome` falha com `Failed to decrypt with DPAPI` por causa do App-Bound Encryption do Chrome — nem com o navegador fechado funciona. O plano B real continua sendo o RF-02b (colar legenda à mão).

### O que as legendas reais revelaram sobre o segmentador (T-04)

Rodando `parseCaptions` + `segment` sobre os cinco arquivos, quatro defeitos que as fixtures não pegaram:

| defeito | onde | exemplo |
|---|---|---|
| **Dedup do rolling text falha com repetição de 1–2 palavras** — `MIN_OVERLAP = 3` deixa passar | todos os ASR | `…upgrading the wrong things.` / `things. You end up spending` |
| **Segmento estoura o `maxMs` de 8s** — um cue único longo nunca é dividido | #5 | um segmento de **21,1s**: `"for the rest of my life."` |
| **`>>` sobrevive à limpeza** quando não está no início do cue | #4, #5 | um segmento inteiro que é só `">>"` |
| **Segmentos abaixo de 1,5s** — quando o cue seguinte estoura o limite de palavras, o pendente curto é emitido como está | #1 (15), #3 (120) | `"an S update."` (0,83s) |

Também: **5 segmentos passam de 15 palavras** no vídeo 1, todos de um cue só — o segmentador junta cues, mas nunca parte um.

Os critérios de "pronto quando" do T-04 valem contra as fixtures, não contra legenda real. Corrigido no **T-04b** (ver `PLAN.md`), com os cinco arquivos promovidos a fixture em `tests/fixtures/corpus/`:

| defeito | como ficou |
|---|---|
| rolling text de 1–2 palavras | o **cue fantasma** de 10ms passou a ser o sinal: o que ele mostrou é prefixo estrutural e é cortado em qualquer tamanho |
| segmento de 21,1s | o parser guarda quando a **última palavra começa** (`Cue.speechEndMs`, das marcas `<00:00:01.000>`) e o segmentador corta o silêncio final |
| `>>` no meio do cue | limpeza global, não só no início — e a etiqueta de speaker que vier junto |
| segmentos < 1,5s | os limites **esticam até `maxWords + 5`** em vez de emitir um caco; o que sobra é fundido com o vizinho |

Nos cinco vídeos, depois: **nenhum** segmento abaixo de 1,5s, **nenhum** acima de 8s, e fronteiras repetindo 3+ palavras: **zero** (eram dezenas).

---

## S-2 — A pausa é precisa o bastante?  🟢 VERDE

10 trials, `seekTo(alvo − 2s)` → `playVideo()` → polling → `pauseVideo()` no alvo. Medido o tempo real em que o vídeo parou.

| Configuração | Mediana | Pior caso | Amostras |
|---|---|---|---|
| poll 100ms, lead 0 | **+64ms** | +77ms | +62, +63, +60, +62, +65, +64, +77, +64 |
| poll 100ms, lead 60ms | −33ms | −37ms | −33, −35, −31, −32, −26, −37 |
| poll 50ms, lead 60ms | −38ms | −39ms | −36, −37, −38, −35, −39, −39 |

**Leitura:**
- O erro é **pequeno e altamente determinístico** — variação de ±8ms entre trials. Isso é melhor do que a spec supunha; dá para compensar com precisão.
- **Polling de 50ms não melhora nada** (−38 vs −33). Fica em 100ms, que é mais barato.
- Lead de 60ms **corrige demais** e passa a pausar *antes* do alvo. Para ditado, pausar cedo é pior que pausar tarde: corta a última sílaba. **Decisão: lead 0**, aceitando os ~64ms a mais, que na prática caem no silêncio entre frases.

**Bug do próprio teste (não do mecanismo):** a primeira versão da página dava timeout porque disparava `playVideo()` sem esperar o `seekTo` assentar. Corrigido com 600ms de espera após o seek — **isso vira requisito do wrapper do player** (T-07): não começar a contar antes do seek concluir.

---

## Impacto no plano

| | Antes | Depois |
|---|---|---|
| T-06 (busca de legenda) | `youtubei.js` numa rota Next.js | **`yt-dlp` validado nos 5 vídeos** — e precisa de `--js-runtimes node` e de tolerar bloqueio temporário por IP |
| T-04 (segmentador) | fechado | **reabre** — 4 defeitos só visíveis em legenda real (ver S-1c) |
| T-07 (player) | polling 100ms + lead ~120ms | polling 100ms, **lead 0**, e esperar o seek assentar antes de contar |
| T-03 (parser SRT/VTT) | plano B | **sobe de importância** — é o caminho garantido |
| §9 R-06 da spec | risco futuro | **risco materializado no dia 1** |
