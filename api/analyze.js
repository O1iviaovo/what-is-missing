/**
 * Vercel serverless function — Anthropic API proxy
 *
 * POST /api/analyze  →  forwards raw request/response to Anthropic Messages API.
 * Minimal transform: reads the incoming body faithfully, forwards it,
 * and streams the upstream response back byte-for-byte to avoid any
 * parse → re-serialise difference.
 */

// Vercel automatically parses JSON bodies — but the request may be large
// (base64 images).  We disable the built-in parser so we can read the
// raw body and forward it unmodified.
export const config = {
  api: {
    bodyParser: false       // we handle the body ourselves
  }
};

/** Helper: read the entire incoming request body as a UTF-8 string */
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  // --- Validate API key ---
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(400).json({ error: 'Missing X-Api-Key header' });
  }

  // --- Forward to Anthropic ---
  try {
    // Read the raw request body ourselves (bodyParser is off)
    const rawBody = await readRawBody(req);

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: rawBody
    });

    // Stream the upstream response back byte-for-byte
    const upstreamText = await upstream.text();

    res.status(upstream.status)
       .setHeader('Content-Type', 'application/json; charset=utf-8')
       .send(upstreamText);
  } catch (err) {
    console.error('[analyze] fetch error:', err.message);
    return res.status(502).json({ error: 'Upstream request failed — ' + err.message });
  }
}
