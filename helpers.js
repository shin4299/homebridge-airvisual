const { URL, URLSearchParams } = require('url');
const { Request, Headers } = require('node-fetch');

class ParamsURL extends URL {
  constructor(href, params, base = global.location) {
    super(href, base);
    if (params) {
      this.search = new URLSearchParams([...this.searchParams, ...Object.entries(params)]);
    }
  }
}

class JSONRequest extends Request {
  constructor(input, init, replacer, space) {
    const { headers: h, body: b, ...rest } = init || {};

    const body = b ? JSON.stringify(b, replacer, space) : null;

    const headers = new Headers(h);
    headers.set('Accept', 'application/json, text/plain, */*');
    if (body) headers.set('Content-Type', 'application/json;charset=UTF-8');

    super(input, { headers, body, ...rest });
  }
}

module.exports = {
  ParamsURL,
  JSONRequest,
};
