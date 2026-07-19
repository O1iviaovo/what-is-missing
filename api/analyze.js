/**
 * Vercel serverless function — Anthropic API proxy
 *
 * POST /api/analyze  →  forwards to Anthropic Messages API.
 * The API key is stored as a Vercel environment variable (ANTHROPIC_API_KEY)
 * so end-users do NOT need to bring their own key.
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

// Server-side API key — hardcoded for public access
var ANTHROPIC_API_KEY = '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';

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Check server-side key ---
  if (!ANTHROPIC_API_KEY) {
    console.error('[analyze] ANTHROPIC_API_KEY environment variable is not set');
    return res.status(500).json({ error: 'Server not configured — missing API key' });
  }

  // --- Forward to Anthropic ---
  try {
    var rawBody = await readRawBody(req);
    console.log('[analyze] body length:', rawBody.length, 'chars');

    var upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':           ANTHROPIC_API_KEY,
        'anthropic-version':   '2023-06-01'
      },
      body: rawBody
    });

    var upstreamText = await upstream.text();
    console.log('[analyze] upstream status:', upstream.status, '| response length:', upstreamText.length);

    try {
      var parsed = JSON.parse(upstreamText);
      if (parsed.content) {
        console.log('[analyze] content block types:',
          parsed.content.map(function (b) { return b.type; }).join(', '));
      }
      if (parsed.error) {
        console.log('[analyze] upstream error:', JSON.stringify(parsed.error));
      }
    } catch (_) { /* not JSON */ }

    res.status(upstream.status)
       .setHeader('Content-Type', 'application/json; charset=utf-8')
       .send(upstreamText);
  } catch (err) {
    console.error('[analyze] fetch error:', err.message);
    return res.status(502).json({ error: 'Upstream request failed — ' + err.message });
  }
}
