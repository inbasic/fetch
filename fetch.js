class File {
  open(name = 'bfs-' + Math.random()) {
    return this.db ? Promise.resolve() : new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onsuccess = ({target: {
        result
      }}) => {
        this.db = result;
        resolve();
      };
      request.onupgradeneeded = ({target}) => target.result.createObjectStore('chunks');
      request.onerror = reject;
    });
  }
  async disk(chunks, offset, size, options, reason) {
    let blob = new Blob(chunks);
    const {db} = this;

    return new Promise((resolve, reject) => {
      const trans = db.transaction('chunks', 'readwrite');
      trans.onerror = reject;
      trans.oncomplete = () => {
        chunks = [];
        resolve(size);
      };
      if (options.size && (size + blob.size) > options.size) {
        blob = blob.slice(0, options.size - size);
        trans.oncomplete = () => reject(Error('STREAM_EXCEEDS_MAX_SIZE'));
      }
      trans.objectStore('chunks').add(blob, offset + size);
      size += blob.size;
    });
  }
  /*
    options.size  -> break the stream if size is greater than this
    observe -> observe progress
  */
  write(offset = 0, options, observe = () => {}) {
    options = {
      stack: 100, // number of chunks to keep on memory before writing
      ...options
    };
    const queueingStrategy = new ByteLengthQueuingStrategy({
      highWaterMark: 1
    });
    let chunks = [];
    let size = 0;
    const write = reason => {
      const cs = [...chunks];
      chunks = [];
      return this.disk(cs, offset, size, options, reason).then(s => size = s);
    };

    return new WritableStream({
      write(chunk) {
        chunks.push(chunk);
        observe(chunk);
        if (chunks.length < options.stack) {
          return Promise.resolve();
        }
        return write('stack');
      },
      close() {
        return write('close');
      }
    }, queueingStrategy);
  }
  /*
    on first read, the DB get removed
  */
  read(prepare = () => Promise.resolve()) {
    const {db} = this;
    let prevKey;

    return new ReadableStream({
      start() {
        return prepare();
      },
      pull(controller) {
        return new Promise(resolve => {
          const transaction = db.transaction('chunks', 'readonly');
          const range = prevKey !== undefined ? IDBKeyRange.lowerBound(prevKey, true) : undefined;
          const request = transaction.objectStore('chunks').openCursor(range);

          request.onsuccess = async e => {
            const cursor = e.target.result;
            if (cursor) {
              prevKey = cursor.key;
              const ab = await cursor.value.arrayBuffer();
              controller.enqueue(new Uint8Array(ab));
            }
            else {
              controller.close();
              indexedDB.deleteDatabase(db.name);
            }
            resolve();
          };
        });
      }
    }, {
      highWaterMark: 100
    });
  }
}
{
  class Event {
    constructor() {
      this.events = {};
    }
    addListener(name, c) {
      this.events[name] = this.events[name] || new Set();
      this.events[name].add(c);
    }
    emit(name, ...values) {
      for (const c of (this.events[name] || [])) {
        c(...values);
      }
    }
  }

  class Fetch extends Event {
    constructor(options = {}) { // options: threads, file, offset
      super();
      this.options = {
        threads: 3,
        offset: 0,
        stack: 100, // number of chunks to keep on memory before writing
        file: new File(),
        ...options
      };
      this.stats = {
        fetched: 0,
        size: 0,
        errors: 0
      };
      this.file = options.file || new File();
      this.meta = {
        name: '',
        extension: '',
        mime: ''
      };
    }
    async prepare(href, options) {
      const c = new AbortController();
      const oResponse = await fetch(href, {
        ...options,
        signal: c.signal
      });
      c.abort();

      const size = this.stats.size = Number(oResponse.headers.get('Content-Length'));
      if (isNaN(size) || size === 0) {
        throw Error('UNKNOWN_SIZE');
      }

      return oResponse;
    }
    async fetch(href, options = {}) {
      const oResponse = await this.prepare(href, options);
      const ahref = oResponse.url;
      console.log(ahref);

      this.meta.mime = oResponse.headers.get('Content-Type');
      this.meta.extension = this.meta.mime.split('/').pop().split(';').shift();
      this.meta.name = decodeURIComponent(ahref.split('/').pop()).substr(0, 100);

      const {file} = this;
      await file.open();

      let readStream;
      const transfer = this.transfer.bind(this, ahref, options);

      return new Proxy(oResponse, {
        get(target, property) {
          if (property === 'blob' || property === 'arrayBuffer' || property === 'text') {
            readStream = readStream || new Response(file.read(transfer), {
              headers: oResponse.headers
            });
            return () => readStream[property]();
          }

          return oResponse[property];
        }
      });
    }
    transfer(href, options) {
      const got = ua => {
        if (ua.byteLength) {
          if (this.options.offset === 0 && this.stats.fetched === 0) {
            this.guess(ua);
          }
          this.stats.fetched += ua.byteLength;
          this.stats.errors = 0;
        }
      };

      const promises = new Set();
      return new Promise((resolve, reject) => {
        const validate = () => {
          if (promises.size === 0) {
            if (this.stats.size === this.stats.fetched) {
              this.emit('end', href);
              return resolve();
            }
            reject(Error('SIZE_MISMATCH'));
          }
        };
        const error = (source, e) => {
          console.warn(source, e);
          const type = e.constructor.name;
          if (type === 'DOMException') { // user aborted
            return console.warn(e.message);
          }
          this.stats.errors += 1;
          if (this.stats.errors > Fetch.MAX_NUM_ERRORS) {
            reject(e);
            c.abort();
          }
        };

        const c = new AbortController();
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            c.abort();
          });
        }
        const threads = segments => {
          for (const segment of segments) {
            fetch(href, {
              ...options,
              signal: c.signal,
              headers: {
                ...options.headers,
                range: `bytes=${segment.offset}-${segment.offset + segment.size - 1}`
              }
            }).then(r => {
              if (r.status !== 206) {
                c.abort();
                reject(Error('THREADING_NOT_SUPPORTED'));
              }
              const promise = r.body.pipeTo(this.file.write(this.options.offset + segment.offset, {
                ...this.options,
                size: segment.size
              }, got)).catch(e => error('PIPE', e)).finally(() => {
                promises.delete(promise);
                validate();
              });
              promises.add(promise);
            }).catch(e => error('FETCH', e));
          }
        };
        threads(this.segments());
      });
    }
    segments() {
      const segments = [];
      const slice = Math.ceil(this.stats.size / this.options.threads); // size of each chunk

      for (let offset = 0; offset < this.stats.size; offset += slice) {
        segments.push({
          size: Math.min(slice, this.stats.size - offset),
          offset
        });
      }
      return segments;
    }
    guess() {
      this.emit('guess');
    }
    /* properties */
    fetched() {
      return this.options.offset + this.stats.fetched;
    }
    size() {
      return this.options.offset + this.stats.size;
    }
    type() {
      return this.meta;
    }
  }
  Fetch.MAX_NUM_ERRORS = 10;
  Fetch.VERSION = '0.1.0';

  window.Fetch = Fetch;
}
