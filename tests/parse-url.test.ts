import { describe, expect, it } from 'vitest';
import { parseTimeParam, parseYouTubeUrl } from '@/lib/youtube/parse-url';

const ID = 'jNQXAC9IVRw';

describe('parseYouTubeUrl — formas de URL', () => {
  const aceitas: [string, string][] = [
    ['watch clássico', `https://www.youtube.com/watch?v=${ID}`],
    ['sem www', `https://youtube.com/watch?v=${ID}`],
    ['http', `http://www.youtube.com/watch?v=${ID}`],
    ['sem protocolo', `youtube.com/watch?v=${ID}`],
    ['mobile', `https://m.youtube.com/watch?v=${ID}`],
    ['music', `https://music.youtube.com/watch?v=${ID}`],
    ['nocookie embed', `https://www.youtube-nocookie.com/embed/${ID}`],
    ['youtu.be', `https://youtu.be/${ID}`],
    ['embed', `https://www.youtube.com/embed/${ID}`],
    ['shorts', `https://www.youtube.com/shorts/${ID}`],
    ['live', `https://www.youtube.com/live/${ID}`],
    ['/v/ antigo', `https://www.youtube.com/v/${ID}`],
    ['com espaços em volta', `   https://youtu.be/${ID}   `],
    ['ID puro', ID],
  ];

  it.each(aceitas)('extrai o videoId: %s', (_nome, entrada) => {
    expect(parseYouTubeUrl(entrada)?.videoId).toBe(ID);
  });

  it('ignora lista de reprodução e índice', () => {
    const r = parseYouTubeUrl(
      `https://www.youtube.com/watch?v=${ID}&list=PLabc123&index=4`,
    );
    expect(r).toEqual({ videoId: ID });
  });

  it('prefere o v= mesmo quando a URL é de playlist', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?list=PLabc&v=${ID}`)?.videoId).toBe(ID);
  });
});

describe('parseYouTubeUrl — tempo inicial', () => {
  it('lê t em segundos', () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=90`)).toEqual({ videoId: ID, startSec: 90 });
  });

  it('lê t com sufixo s', () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=90s`)?.startSec).toBe(90);
  });

  it('lê t no formato 1m30s', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)?.startSec).toBe(90);
  });

  it('lê t com hora', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=1h2m3s`)?.startSec).toBe(3723);
  });

  it('lê start= do formato embed', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/embed/${ID}?start=45`)?.startSec).toBe(45);
  });

  it('omite startSec quando t é lixo', () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=abc`)).toEqual({ videoId: ID });
  });

  it('t=0 é um início válido, não ausência de início', () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=0`)?.startSec).toBe(0);
  });
});

describe('parseYouTubeUrl — entradas inválidas', () => {
  const invalidas: [string, string][] = [
    ['string vazia', ''],
    ['só espaços', '   '],
    ['texto solto', 'não é uma url'],
    ['outro domínio', 'https://vimeo.com/123456789'],
    ['domínio parecido', `https://youtube.com.evil.com/watch?v=${ID}`],
    ['youtube sem id', 'https://www.youtube.com/'],
    ['canal', 'https://www.youtube.com/@algumcanal'],
    ['playlist sem vídeo', 'https://www.youtube.com/playlist?list=PLabc123'],
    ['id curto demais', 'https://youtu.be/abc123'],
    ['id longo demais', `https://youtu.be/${ID}XYZ`],
    ['id com caractere inválido', 'https://www.youtube.com/watch?v=jNQXAC9IV!w'],
    ['embed sem id', 'https://www.youtube.com/embed/'],
  ];

  it.each(invalidas)('retorna null: %s', (_nome, entrada) => {
    expect(parseYouTubeUrl(entrada)).toBeNull();
  });
});

describe('parseTimeParam', () => {
  it.each([
    ['90', 90],
    ['90s', 90],
    ['1m', 60],
    ['1m30s', 90],
    ['2h', 7200],
    ['1h2m3s', 3723],
    ['0', 0],
  ])('%s → %i', (entrada, esperado) => {
    expect(parseTimeParam(entrada)).toBe(esperado);
  });

  it.each(['', '   ', 'abc', 'm30s', '1x', null, undefined])(
    'undefined para %s',
    (entrada) => {
      expect(parseTimeParam(entrada)).toBeUndefined();
    },
  );
});
