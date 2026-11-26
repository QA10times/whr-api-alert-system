import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface StubResponse {
  status?: number;
  body?: unknown;
  delayMs?: number;
  hang?: boolean;
  headers?: Record<string, string>;
}

/** Scriptable monitored API that also records concurrency and every request. */
export class StubServer {
  private server!: http.Server;
  private scripts = new Map<string, { list: StubResponse[]; repeat: boolean }>();
  requests: { method: string; path: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
  inflight = 0;
  maxInflight = 0;
  port = 0;

  get url() {
    return `http://127.0.0.1:${this.port}`;
  }

  async start() {
    this.server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', async () => {
        this.inflight++;
        this.maxInflight = Math.max(this.maxInflight, this.inflight);
        const path = (req.url ?? '/').split('?')[0];
        this.requests.push({ method: req.method ?? '', path: req.url ?? '/', headers: req.headers, body });
        const s = this.scripts.get(path);
        let r: StubResponse = { status: 200, body: { count: 5, data: [{ id: 1 }, { id: 2 }] } };
        if (s?.list.length) r = s.list.length > 1 || !s.repeat ? s.list.shift()! : s.list[0];
        if (r.delayMs) await new Promise((ok) => setTimeout(ok, r.delayMs));
        this.inflight--;
        if (r.hang) return;
        const text = r.body === undefined ? '' : typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
        res.writeHead(r.status ?? 200, { 'Content-Type': 'application/json', ...r.headers });
        res.end(text);
      });
    });
    await new Promise<void>((ok) => this.server.listen(0, '127.0.0.1', ok));
    this.port = (this.server.address() as AddressInfo).port;
  }

  script(path: string, list: StubResponse[], repeat = true) {
    this.scripts.set(path, { list: [...list], repeat });
  }

  reset() {
    this.scripts.clear();
    this.requests = [];
    this.maxInflight = 0;
  }

  async stop() {
    this.server.closeAllConnections();
    await new Promise((ok) => this.server.close(ok));
  }
}
