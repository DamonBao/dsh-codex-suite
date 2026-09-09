/**
 * Host mounting for this plugin's dedicated Connection-style RPC channel.
 *
 * Since dsh 0.1.5 the connection Host plugin provides its registry
 * carrier-neutrally (`inject = ['credentials']`) and only mounts physical
 * routes when `webServer` appears. Its `rpc.handle` reads `webServer` from the
 * service's own context, which no longer injects it — an external caller's
 * registration dies with `cannot get property "webServer" without inject`.
 * So the plugin mounts the identical prefix route itself: the same trust fence
 * (`connection.requestRejection`) and the same unary wire envelope the
 * Connection carrier serves, keeping the browser half's `rpc.call(channel, …)`
 * contract byte-for-byte unchanged.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

/** Same channel and endpoint grammars the Connection carrier enforces. */
const CHANNEL_PATTERN = /^\/[A-Za-z0-9._~-]+$/
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/
/** Plugin RPC payloads are tiny JSON documents; cap far below the carrier's. */
const MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024
const INVALID_REQUEST_RPC_ID = 'invalid-request'

interface ClientRequestEnvelope {
  readonly rpcId: string
  readonly method: string
  readonly payload: unknown
}

function endpointFromPath(channel: string, pathname: string): string | undefined {
  if (!pathname.startsWith(`${channel}/`)) return undefined
  const endpoint = pathname.slice(channel.length + 1)
  const segments = endpoint.split('/')
  if (segments.some(segment =>
    segment === '' || segment === '.' || segment === '..' || !ENDPOINT_SEGMENT_PATTERN.test(segment))) {
    return undefined
  }
  return endpoint
}

function parseEnvelope(body: unknown): ClientRequestEnvelope | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const value = body as Record<string, unknown>
  if (value.type !== 'client-request') return undefined
  if (typeof value.rpcId !== 'string' || value.rpcId.length === 0) return undefined
  if (typeof value.method !== 'string') return undefined
  if (!('payload' in value)) return undefined
  return { rpcId: value.rpcId, method: value.method, payload: value.payload }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(payload)),
  })
  res.end(payload)
}

function sendText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(text)
}

function sendErrorEnvelope(res: ServerResponse, rpcId: string, code: string, message: string): void {
  sendJson(res, 200, {
    type: 'server-response',
    rpcId,
    result: { ok: false, error: { code, message, details: { issues: [] } } },
  })
}

/** Buffer one request body within the cap; answers 413 by returning undefined. */
async function readBodyCapped(req: IncomingMessage, res: ServerResponse): Promise<Buffer | undefined> {
  const declared = req.headers['content-length']
  if (declared !== undefined && Number(declared) > MAX_REQUEST_BODY_BYTES) {
    sendText(res, 413, 'request body too large')
    return undefined
  }
  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    received += buffer.byteLength
    if (received > MAX_REQUEST_BODY_BYTES) {
      sendText(res, 413, 'request body too large')
      return undefined
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

/**
 * Mount one plugin-owned RPC channel for the lifetime of the calling fiber.
 * @param ctx - Host plugin context.
 * @param channel - absolute channel prefix such as `/dsh-codex-provider`.
 * @param handler - decoded endpoint handler returning the RPC result shape.
 * @param label - effect label for diagnostics.
 */
export function mountRpcChannel(
  ctx: Context,
  channel: string,
  handler: ConnectionRpcHandler,
  label: string,
): void {
  if (!CHANNEL_PATTERN.test(channel) || channel === '/api') {
    throw new Error(`invalid or reserved plugin RPC channel ${JSON.stringify(channel)}`)
  }
  ctx.inject(['connection', 'webServer'], (mountCtx) => {
    mountCtx.effect(() => {
      const route: WebRoute = {
        kind: 'prefix',
        path: channel,
        handler: (req, res) => serveChannelRoute(mountCtx, channel, handler, req, res),
      }
      return mountCtx.webServer.register(route)
    }, label)
  })
}

async function serveChannelRoute(
  mountCtx: Context,
  channel: string,
  handler: ConnectionRpcHandler,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Connection's Host/Origin fence and browser-session authentication, exactly
  // as the carrier applies them to a dedicated channel.
  const rejection = mountCtx.connection.requestRejection(req)
  if (rejection !== undefined) {
    res.writeHead(rejection)
    res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
    return
  }
  const url = new URL(req.url ?? '/', 'http://dsh.internal')
  const endpoint = endpointFromPath(channel, url.pathname)
  if (req.method !== 'POST' || endpoint === undefined) {
    sendText(res, 404, 'not found')
    return
  }
  const mediaType = String(req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType !== 'application/json') {
    sendText(res, 415, 'content type must be application/json')
    return
  }
  const body = await readBodyCapped(req, res)
  if (body === undefined) return
  let parsed: unknown
  try {
    parsed = JSON.parse(body.toString('utf8'))
  } catch {
    sendText(res, 400, 'body is not JSON')
    return
  }
  const message = parseEnvelope(parsed)
  if (message === undefined) {
    const rawId = typeof (parsed as { rpcId?: unknown } | null)?.rpcId === 'string'
      ? (parsed as { rpcId: string }).rpcId
      : INVALID_REQUEST_RPC_ID
    sendErrorEnvelope(res, rawId, 'gateway/bad-request', 'invalid client-request message')
    return
  }
  if (message.method !== endpoint) {
    sendErrorEnvelope(
      res,
      message.rpcId,
      'gateway/bad-request',
      `method ${JSON.stringify(message.method)} does not match endpoint ${JSON.stringify(endpoint)}`,
    )
    return
  }
  const abort = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) abort.abort()
  })
  try {
    const result = await handler(endpoint, message.payload, abort.signal)
    sendJson(res, 200, { type: 'server-response', rpcId: message.rpcId, result })
  } catch (error) {
    sendText(res, 500, `handler failure: ${String(error)}`)
  }
}
