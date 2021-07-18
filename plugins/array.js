/* global Fetch */

{
  class AFetch extends Fetch {
    async fetch(hrefs, options) {
      if (Array.isArray(hrefs) === false) {
        hrefs = [hrefs];
      }
      const href = hrefs[0];
      this.options.hrefs = hrefs;
      return super.fetch(href, options);
    }

    async transfer(href, options) {
      let n = 0;
      for (const href of this.options.hrefs) {
        if (n !== 0) {
          await super.prepare(href, options);
        }
        await super.transfer(href, options);
        this.options.offset += this.stats.size;
        this.stats.fetched = 0;
        this.stats.errors = 0;
        n += 1;
      }
    }
  }
  window.Fetch = AFetch;
}
