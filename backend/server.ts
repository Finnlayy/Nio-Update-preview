import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import { join } from 'path';
import {
  createNeuralCoreMiddleware,
  InMemoryTelemetryStore,
} from '../src/index';
import { HttpRequest, HttpResponse } from '../src/types';
import { KrakenOrderExecutor } from './kraken';
import { GeminiCoreAdapter } from './gemini';
import { createServer as createViteServer } from 'vite';

const krakenExecutor = new KrakenOrderExecutor();

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function toMiddlewareResponse(res: ServerResponse): HttpResponse {
  let statusCode = 200;

  const response: HttpResponse = {
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(body: unknown) {
      sendJson(res, statusCode, body);
      return response;
    },
  };

  return response;
}

async function startServer() {
  const dev = process.env.NODE_ENV !== 'production';
  const hostname = '0.0.0.0';
  const port = 3000;
  
  const ROOT = process.cwd();
  const TEMPLATE_PATH = join(ROOT, 'prompts', 'system', 'neural_core.yaml');
  
  const telemetry = new InMemoryTelemetryStore();
  const handler = createNeuralCoreMiddleware({
    systemTemplatePath: TEMPLATE_PATH,
    complexityThreshold: 1,
    defaultPolitenessTier: 'neutral',
    telemetry,
    coreAdapter: new GeminiCoreAdapter(),
  });
  
  let vite: any;
  if (dev) {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
  }

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url ?? '/', true);
      const method = req.method ?? 'GET';
      const url = req.url ?? '/';

      if (method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
      }

      if (method === 'GET' && url === '/api/health') {
        try {
          const ecosystem = await krakenExecutor.checkEcosystemHealth();
          const overallOk =
            ecosystem.krakenCli.state === 'ONLINE' &&
            ecosystem.architectEcosystem.state === 'ONLINE';
          sendJson(res, 200, {
            status: overallOk ? 'ok' : 'degraded',
            service: 'neural-orchestrator',
            ...ecosystem,
          });
        } catch (error) {
          sendJson(res, 500, {
            status: 'error',
            service: 'neural-orchestrator',
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (method === 'POST' && url === '/api/execute-kraken') {
        try {
          const body = await readJsonBody(req);
          const result = await krakenExecutor.executeCommand(String(body.command));
          sendJson(res, 200, result);
        } catch (error) {
          sendJson(res, 400, { error: String(error) });
        }
        return;
      }

      if (method === 'POST' && url === '/api/execute-order') {
        try {
          const body = await readJsonBody(req);
          const result = await krakenExecutor.executeOrder({
            pair: String(body.pair || 'BTC/USD'),
            type: body.type === 'sell' ? 'sell' : 'buy',
            ordertype: body.ordertype === 'market' ? 'market' : 'limit',
            volume: Number(body.volume || 0.01),
            price: body.price ? Number(body.price) : undefined,
            strategyId: typeof body.strategyId === 'string' ? body.strategyId : undefined,
            barTimestamp: typeof body.barTimestamp === 'string' || typeof body.barTimestamp === 'number' ? body.barTimestamp : undefined,
            authGateToken: typeof body.authGateToken === 'string' ? body.authGateToken : undefined,
            deadManArmed: body.deadManArmed === true
          });
          sendJson(res, 200, result);
        } catch (error) {
          sendJson(res, 400, { error: String(error) });
        }
        return;
      }

      if (method === 'POST' && url === '/api/task') {
        try {
          const body = await readJsonBody(req);
          const middlewareReq: HttpRequest = {
            body: {
              taskDescription: typeof body.taskDescription === 'string' ? body.taskDescription : undefined,
              isComplexWorkflow: body.isComplexWorkflow === true,
              domainHint: body.domainHint as HttpRequest['body']['domainHint'],
              algorithmTag: typeof body.algorithmTag === 'string' ? body.algorithmTag : undefined,
              politenessTier: body.politenessTier as HttpRequest['body']['politenessTier'],
              previousInteractionId: typeof body.previousInteractionId === 'string' ? body.previousInteractionId : undefined,
            },
          };

          await handler(middlewareReq, toMiddlewareResponse(res), (err) => {
            if (err) {
              const message = err instanceof Error ? err.message : 'Unknown error';
              sendJson(res, 500, { error: message });
            }
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid JSON body';
          sendJson(res, 400, { error: message });
        }
        return;
      }

      // Let Vite handle all other requests
      if (dev && vite) {
        vite.middlewares(req, res, (err: any) => {
          if (err) {
             res.statusCode = 500;
             res.end(err.message);
          }
        });
      } else {
        const distPath = join(ROOT, 'dist');
        const fs = await import('fs');
        let filePath = join(distPath, url === '/' ? 'index.html' : url);
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
           filePath = join(distPath, 'index.html');
        }
        const mime = await import('mime-types');
        res.writeHead(200, { 'Content-Type': mime.lookup(filePath) || 'text/html' });
        fs.createReadStream(filePath).pipe(res);
      }
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log('Endpoints: GET /api/health, POST /api/task, Vite Frontend');
  });
}

startServer();
