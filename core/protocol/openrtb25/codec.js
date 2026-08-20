import { parse } from './parser.js';
import { build } from './builder.js';
import { parseResponse, buildResponse, buildNoResponse } from './normalize.js';

export function createCodec() {
  return {
    parseRequest: parse,
    buildRequest: build,
    parseResponse,
    buildResponse,
    buildNoResponse,
  };
}
