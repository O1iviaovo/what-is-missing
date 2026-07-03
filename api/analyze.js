/**
 * Vercel serverless function — Anthropic API proxy
 *
 * POST /api/analyze  →  forwards raw request/response to Anthropic Messages API.
 * Disables the built-in body parser so we can handle the body ourselves
 * (important for large base64-image payloads).
 */

export const config = {
  api: {
    bodyParser: false
  }
};

/** Read the entire incoming request body as a UTF-8 string */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    var chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    req.on('end', function () {
      var buf = Buffer.concat(chunks);
      resolve(buf.toString('utf-8'));
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Validate API key ---
  var apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(400).json({ error: 'Missing X-Api-Key header' });
  }

  // --- Forward to Anthropic ---
  try {
    var rawBody = await readRawBody(req);
    console.log('[analyze] body length:', rawBody.length, 'chars');

    var upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':           apiKey,
        'anthropic-version':   '2023-06-01'
      },
      body: rawBody
    });

    var upstreamText = await upstream.text();
    console.log('[analyze] upstream status:', upstream.status, '| response length:', upstreamText.length);

    // Log the content types in the response for debugging
    try {
      var parsed = JSON.parse(upstreamText);
      if (parsed.content) {
        console.log('[analyze] content block types:',
          parsed.content.map(function (b) { return b.type; }).join(', '));
      }
      if (parsed.error) {
        console.log('[analyze] upstream error:', JSON.stringify(parsed.error));
      }
    } catch (_) { /* not JSON — just forward as-is */ }

    res.status(upstream.status)
       .setHeader('Content-Type', 'application/json; charset=utf-8')
       .send(upstreamText);
  } catch (err) {
    console.error('[analyze] fetch error:', err.message);
    return res.status(502).json({ error: 'Upstream request failed — ' + err.message });
  }
}
