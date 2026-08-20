import http from 'node:http';
import https from 'node:https';

export function createClient() {
  const agentOpts = {
    keepAlive: true,
    keepAliveMsecs: 10_000,
    maxSockets: Infinity,
    maxFreeSockets: 256,
  };

  const httpAgent = new http.Agent(agentOpts);
  const httpsAgent = new https.Agent(agentOpts);

  async function request({ url, body, headers }, timeoutMs) {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const agent = parsed.protocol === 'https:' ? httpsAgent : httpAgent;
    const payload = JSON.stringify(body);

    return new Promise((resolve) => {
      let done = false;

      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve({ status: 'timeout' });
        }
      }, timeoutMs);

      const req = transport.request(url, {
        method: 'POST',
        agent,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Connection': 'keep-alive',
          ...headers,
        },
      }, (res) => {
        if (done) {
          res.resume();
          return;
        }

        if (res.statusCode === 204) {
          clearTimeout(timer);
          done = true;
          res.resume();
          return resolve({ status: 'no-bid' });
        }

        if (res.statusCode !== 200) {
          clearTimeout(timer);
          done = true;
          res.resume();
          return resolve({ status: 'dsp-error', code: res.statusCode });
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          if (done) return;
          clearTimeout(timer);
          done = true;
          try {
            resolve({ status: 'ok', body: JSON.parse(Buffer.concat(chunks).toString()) });
          } catch {
            resolve({ status: 'dsp-error', code: res.statusCode });
          }
        });
      });

      req.on('error', (err) => {
        if (!done) {
          clearTimeout(timer);
          done = true;
          resolve({ status: 'error', message: err.message });
        }
      });

      req.write(payload);
      req.end();
    });
  }

  return { request };
}
