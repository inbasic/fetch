/* global m3u8Parser, Fetch */

const href = 'https://cdn.theoplayer.com/video/big_buck_bunny_encrypted/stream-800/index.m3u8';

fetch(href).then(r => r.text()).then(content => {
  const parser = new m3u8Parser.Parser();

  parser.push(content);
  parser.end();

  const manifest = parser.manifest;
  const parts = manifest.segments.map(o => ({
    href: (new URL(o.uri, href)).href,
    key: o.key ? {
      ...o.key,
      uri: (new URL(o.key.uri, href)).href
    } : undefined
  }));

  const o = new Fetch();
  // o.fetch(parts).then(r => r.blob()).then(b => console.log(b)).catch(e => console.error(e));
  o.fetch(parts).then(r => r.blob()).then(b => console.log(b));
});
