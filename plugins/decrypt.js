/* global Fetch, File */
{
  class DFile extends File {
    constructor(...args) {
      super(...args);
      this.mChunks = {};
      this.mLength = 0;
    }
    async decrypt(chunks, key) {
      const iv = key.iv && key.iv.length ? (new Uint8Array(key.iv)).buffer : new ArrayBuffer(16);
      const value = await fetch(key.uri).then(r => r.arrayBuffer());

      const buffer = await (new Blob(chunks)).arrayBuffer();

      return new Promise((resolve, reject) => {
        if (key.method === 'AES-128') {
          crypto.subtle.importKey('raw', value, {
            name: 'AES-CBC',
            length: 128
          }, false, ['decrypt']).then(importedKey => crypto.subtle.decrypt({
            name: 'AES-CBC',
            iv
          }, importedKey, buffer)).then(resolve, reject);
        }
        else {
          reject(Error(`"${key.method}" encryption is not supported`));
        }
      });
    }
    async disk(chunks, offset, size, options, reason) {
      this.mChunks[offset + size] = chunks;

      if (reason === 'close') {
        this.mLength += 1;
        if (this.mLength === options.threads) {
          const ab = await this.decrypt(Object.values(this.mChunks).flat(), options.key);
          await super.disk([new Uint8Array(ab)], offset, 0, {}, reason);
        }
      }
      return Promise.resolve(0);
    }
  }
  File = DFile;

  class DFetch extends Fetch {
    async prepare(o, options) {
      if (o.href) {
        this.options.key = o.key;

        return super.prepare(o.href, options);
      }
      return super.prepare(o, options);
    }
    async transfer(o, options) {
      if (o.href) {
        return super.transfer(o.href, options);
      }
      return super.transfer(o, options);
    }
  }
  window.Fetch = DFetch;
}
