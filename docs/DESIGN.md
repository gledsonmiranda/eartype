# Design — escalas e padrões

O que a interface usa como sistema. Não é identidade visual: paleta, fontes e nome
são pendência declarada no §8 da `SPEC.md`, e o MVP nasceu em cinza neutro de
propósito.

> Este arquivo substitui um design system de 39 KB extraído de um site de marca de
> terceiro. Só a **estrutura** dele era aproveitável — escala de espaçamento,
> hierarquia tipográfica, escala de raios e estados de componente —, e é isso que
> está aqui, sem cor de marca, logotipo ou nome alheio. A decisão está registrada
> no §8 da spec.

## Espaçamento

Base de 8px, com passos de 4px onde o inline aperta.

| token | valor | uso |
| --- | --- | --- |
| `xxs` | 4px | gap entre ícone e rótulo |
| `xs` | 8px | gap entre controles irmãos |
| `sm` | 12px | padding interno de input |
| `md` | 16px | padding de card, gap de formulário |
| `lg` | 24px | separação entre blocos de uma seção |
| `xl` | 32px | separação entre seções |
| `xxl` | 48px | respiro de topo/rodapé |

No Tailwind isso é `gap-1 / 2 / 3 / 4 / 6 / 8 / 12` — a escala padrão já bate.

## Tipografia

Duas famílias, com papéis separados:

- **UI:** sans de sistema (`ui-sans-serif, system-ui`). Rótulo, botão, rodapé.
- **Ditado:** **monoespaçada**. O texto da legenda, o que você digita e o diff
  palavra a palavra. Alinhamento vertical é o que torna o diff legível — em
  proporcional, palavra certa e palavra errada não se encaram.

| papel | tamanho | peso | line-height |
| --- | --- | --- | --- |
| título de tela | 24px | 600 | 1.25 |
| título de seção | 18px | 600 | 1.25 |
| texto do ditado | 18px | 400 | 1.5 (mono) |
| corpo | 14px | 400 | 1.5 |
| rodapé / metadado | 12px | 400 | 1.5 |

## Raios

| token | valor | uso |
| --- | --- | --- |
| `sm` | 4px | nada estrutural; detalhe |
| `md` | 6–8px | input, textarea, card, player |
| `full` | 9999px | botão (pill) e chip de ação |

Superfícies que ocupam a largura toda ficam sem raio.

## Estados de componente

Todo controle define os cinco, e nenhum depende só de cor:

| estado | como se mostra |
| --- | --- |
| default | borda `zinc-700` sobre fundo `zinc-900` |
| hover | borda clareia para `zinc-400` |
| pressed | fundo escurece um passo |
| disabled | opacidade 40%, cursor padrão, sem hover |
| focus | borda de 2px — o foco do teclado precisa ser visível, porque o app inteiro é operado por teclado |

## Cores do diff

Cada estado do diff carrega **cor e forma**, nessa ordem de importância — cor
nunca é o único indicador (§8 da spec, acessibilidade):

| estado | cor | forma |
| --- | --- | --- |
| certo | verde | nenhuma |
| erro de digitação | âmbar | sublinhado pontilhado |
| palavra errada | vermelho | riscado, com a correta ao lado |
| faltando | cinza | caixa tracejada |
| sobrando | cinza | riscado |

Cada token também carrega o rótulo em texto para leitor de tela.

## Layout

Três zonas, nessa ordem vertical (§8): **player** no topo, **digitação e
correção** no meio, **progresso e atalhos** no rodapé. O campo de digitação fica
logo abaixo do vídeo — em 1366×768 não pode ser preciso rolar a página para
digitar.

Largura máxima de ~768px na entrada e ~896px na prática. O player ocupa a largura
da coluna em 16:9.

## Tema

Escuro por padrão: assistir vídeo com fundo claro cansa. Tema claro é Fase 2
(§RF-09).

## Movimento

Quase nenhum. O ritmo do loop é o produto, e uma animação entre trechos atrasa o
próximo áudio. A única espera deliberada são os ~700ms depois de um acerto, para
a resposta certa ser lida antes de avançar.
