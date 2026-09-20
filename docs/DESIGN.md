# Design — scales and patterns

What the interface uses as a system. This is not a visual identity: palette and
fonts are a declared pendency in §8 of `SPEC.md`, and the MVP was born in
neutral grey on purpose. (The name is settled — **Eartype**.)

> This file replaces a 39 KB design system extracted from a third party's brand
> site. Only its **structure** was usable — spacing scale, type hierarchy, radius
> scale and component states — and that is what is here, with no brand colour,
> logo or borrowed name. The decision is recorded in §8 of the spec.

## Spacing

An 8px base, with 4px steps where inline layout gets tight.

| token | value | use |
| --- | --- | --- |
| `xxs` | 4px | gap between icon and label |
| `xs` | 8px | gap between sibling controls |
| `sm` | 12px | inner padding of an input |
| `md` | 16px | card padding, form gap |
| `lg` | 24px | separation between blocks of a section |
| `xl` | 32px | separation between sections |
| `xxl` | 48px | breathing room at top/bottom |

In Tailwind that is `gap-1 / 2 / 3 / 4 / 6 / 8 / 12` — the default scale already
matches.

## Typography

Two families, with separate roles:

- **UI:** system sans (`ui-sans-serif, system-ui`). Labels, buttons, footer.
- **Dictation:** **monospace**. The caption text, what you type, and the
  word-by-word diff. Vertical alignment is what makes the diff readable — in a
  proportional face, the right word and the wrong word never line up.

| role | size | weight | line-height |
| --- | --- | --- | --- |
| screen title | 24px | 600 | 1.25 |
| section title | 18px | 600 | 1.25 |
| dictation text | 18px | 400 | 1.5 (mono) |
| body | 14px | 400 | 1.5 |
| footer / metadata | 12px | 400 | 1.5 |

## Radii

| token | value | use |
| --- | --- | --- |
| `sm` | 4px | nothing structural; a detail |
| `md` | 6–8px | input, textarea, card, player |
| `full` | 9999px | button (pill) and action chip |

Surfaces that span the full width carry no radius.

## Component states

Every control defines all five, and none of them depends on colour alone:

| state | how it shows |
| --- | --- |
| default | `zinc-700` border on a `zinc-900` ground |
| hover | border lightens to `zinc-400` |
| pressed | ground darkens one step |
| disabled | 40% opacity, default cursor, no hover |
| focus | 2px border — keyboard focus has to be visible, because the whole app is driven from the keyboard |

## Diff colours

Each diff state carries **colour and shape**, in that order of importance —
colour is never the only indicator (§8 of the spec, accessibility):

| state | colour | shape |
| --- | --- | --- |
| correct | green | none |
| typo | amber | dotted underline |
| wrong word | red | struck through, with the right one beside it |
| missing | grey | dashed box |
| extra | grey | struck through |

Every token also carries its label as text for a screen reader.

## Layout

Three zones, in this vertical order (§8): **player** on top, **typing and
correction** in the middle, **progress and shortcuts** in the footer. The typing
field sits right below the video — at 1366×768 you must not have to scroll the
page to type.

Maximum width of ~768px on entry and ~896px in practice. The player fills the
column width at 16:9.

## Theme

Dark by default: watching video against a light ground is tiring. A light theme
is Phase 2 (§RF-09).

## Motion

Almost none. The rhythm of the loop is the product, and an animation between
segments delays the next audio. The only deliberate wait is the 1.2s after a
clean answer, so the hit can register before the screen moves on.
