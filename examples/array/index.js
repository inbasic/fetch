/* global Fetch */

const links = [
  '../samples/segments/xaa', '../samples/segments/xab', '../samples/segments/xac', '../samples/segments/xad',
  '../samples/segments/xae', '../samples/segments/xaf', '../samples/segments/xag'
];

const o = new Fetch();
o.addListener('guess', () => console.log('type', o.type()));
o.addListener('end', href => console.log('estimated size at', href, 'is', o.size()));

o.fetch(links).then(r => {
  return r.blob();
}).then(b => {
  console.log('blob', b);
});
