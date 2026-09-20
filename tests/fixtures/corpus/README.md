# Corpus de legendas reais

Cinco legendas baixadas do YouTube com `yt-dlp` em 2026-09-20, uma faixa `en` por
vídeo, exatamente como chegam do provedor — nada foi editado à mão. São os cinco
tipos previstos no Passo 0 do `docs/PLAN.md` (S-1), e o resultado da coleta está em
`docs/SPIKE-RESULTS.md` §S-1c.

| arquivo | videoId | tipo | duração | legenda |
| --- | --- | --- | --- | --- |
| `01-manual-mkbhd.en.vtt` | `ohqxP8EEumo` | canal profissional | 18min | manual |
| `02-asr-sandeep.en.vtt` | `45oG6w7bvtM` | só auto-gerada | 19min | ASR |
| `03-asr-long-melrobbins.en.vtt` | `8dHEG7WxR4c` | vídeo longo | 1h26 | ASR |
| `04-asr-small-channel.en.vtt` | `xxdlUHSWM7E` | canal pequeno (4 mil views) | 14min | ASR |
| `05-asr-restricted-guess.en.vtt` | `Fy291Q3a6zs` | suspeita de restrição (não tinha) | 26min | ASR |

Por que legenda real e não fixture escrita à mão: as fixtures de `tests/fixtures/`
foram desenhadas a partir da spec, e por isso só continham os problemas que já
tínhamos imaginado. Estes cinco arquivos derrubaram quatro invariantes do
segmentador que passavam verdes contra as fixtures (ver `docs/SPIKE-RESULTS.md`).

As fixtures pequenas continuam servindo para testar regra a regra; este corpus
serve para testar **invariantes** — nenhum segmento curto demais, nenhum rolling
text duplicado, nenhuma marcação sobrando. Um arquivo aqui nunca deve ser
"corrigido" para o teste passar: se o corpus reprova, quem está errado é o código.
