# Biblioteca de vídeos

Vídeos cuja legenda já vem no projeto: aparecem na página inicial e abrem direto na
prática, sem yt-dlp.

## Adicionar um vídeo

Pelo app (rodando local): em "Vídeo novo", cole a URL, arraste o .srt, comece e clique em
**adicionar à biblioteca**. Depois é só commitar a pasta criada.

À mão:

1. Crie uma pasta com o **videoId** do YouTube como nome
   (`https://www.youtube.com/watch?v=0y9CyrU2o3M` → `0y9CyrU2o3M/`).
2. Coloque a legenda como `captions.srt` (ou `captions.vtt`).
3. Crie o `meta.json`:

   ```json
   {
     "title": "Título do vídeo",
     "kind": "manual",
     "addedAt": "2026-09-29"
   }
   ```

   `kind` é `manual` para legenda com pontuação (libera o modo estrito) ou
   `asr` para legenda auto-gerada.
4. Rode `npm test` — `tests/library/content.test.ts` confere que toda pasta
   aqui é válida.

## Remover

Pelo ícone de lixeira no card (rodando local), ou apagando a pasta.

Em produção (`npm run build && npm start`) a biblioteca é só leitura; defina
`LIBRARY_WRITABLE=1` para liberar os botões.
