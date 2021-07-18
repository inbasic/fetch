/* global Fetch */

let id;
const start = Date.now();

const o = new Fetch({
  threads: 1
});
o.addListener('end', href => console.log('end', href));

o.fetch('../samples/m.zip').then(async r => {
  console.log('size', o.size());
  console.log('type', o.type(r));

  id = setInterval(() => {
    const fetched = o.fetched();
    const size = o.size();
    const speed = (fetched / (Date.now() - start) / 1024 / 1024 * 1000).toFixed(1) + 'MB / s';

    console.log(
      'speed', speed,
      'progress', (fetched / size * 100).toFixed(0) + '%'
    );
  }, 100);
  return r.blob();
}).then(b => console.log(b)).finally(() => {
  clearInterval(id);
});
