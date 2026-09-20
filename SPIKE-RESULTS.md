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

**Pendente:** rodar o teste nos 5 vídeos reais previstos no plano (manual, só-ASR, longo, canal pequeno, restrito). O que foi testado até aqui responde *pelo mecanismo*, não pela cobertura.

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
| T-06 (busca de legenda) | `youtubei.js` numa rota Next.js | **Bloqueado** — depende de decisão sobre `yt-dlp` |
| T-07 (player) | polling 100ms + lead ~120ms | polling 100ms, **lead 0**, e esperar o seek assentar antes de contar |
| T-03 (parser SRT/VTT) | plano B | **sobe de importância** — é o caminho garantido |
| §9 R-06 da spec | risco futuro | **risco materializado no dia 1** |
