// MCP JSON-RPC endpoint. Matches the same protocol Charles's github-mcp-server uses.
// Vercel routes POSTs to /api/mcp here.

import type { IncomingMessage, ServerResponse } from 'http';
import { TOOLS } from '../lib/tools';
import { callTool } from '../lib/handlers';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

function ok(id: JsonRpcRequest['id'], result: any): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function err(id: JsonRpcRequest['id'], code: number, message: string, data?: any): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, data } };
}

function checkAuth(req: IncomingMessage): boolean {
  const expected = process.env.MCP_SHARED_SECRET;
  if (!expected) return true; // if no secret configured, allow — useful for local dev
  const auth = req.headers['authorization'];
  if (!auth) return false;
  return auth === `Bearer ${expected}`;
}

async function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  if (!checkAuth(req)) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  let rpc: JsonRpcRequest;
  try {
    rpc = await readBody(req);
  } catch (e: any) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: `Invalid JSON: ${e.message}` }));
    return;
  }

  try {
    const response = await dispatch(rpc);
    res.statusCode = 200;
    res.end(JSON.stringify(response));
  } catch (e: any) {
    const response = err(rpc.id, -32603, `Internal error: ${e.message}`);
    res.statusCode = 200; // JSON-RPC errors are still HTTP 200
    res.end(JSON.stringify(response));
  }
}

async function dispatch(rpc: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { method, params, id } = rpc;

  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'project-state-mcp', version: '0.1.0' },
      capabilities: { tools: {} },
    });
  }

  if (method === 'tools/list') {
    return ok(id, { tools: TOOLS });
  }

  if (method === 'tools/call') {
    const toolName = params?.name as string;
    const toolArgs = (params?.arguments ?? {}) as Record<string, any>;
    if (!toolName) return err(id, -32602, 'Missing tool name');

    try {
      const text = await callTool(toolName, toolArgs);
      return ok(id, {
        content: [{ type: 'text', text }],
      });
    } catch (e: any) {
      return ok(id, {
        content: [{ type: 'text', text: `Error: ${e.message}` }],
        isError: true,
      });
    }
  }

  if (method === 'notifications/initialized') {
    return ok(id, {});
  }

  return err(id, -32601, `Method not found: ${method}`);
}
