/* global Fetch */

const o = new Fetch({
  threads: 3
});

o.fetch('../samples/small.mp4').then(r => r.blob()).then(b => console.log(b));
