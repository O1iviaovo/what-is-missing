/**
 * Vercel serverless function — Anthropic API proxy
 *
 * Replaces server.ps1 for production deployment.
 * POST /api/analyze  →  forwards to https://api.anthropic.com/v1/messages
 */

export default async function handler(req, res) {
  // --- CORS (safety net — same-origin in production, but helps local dev) ---
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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    // --- Stream the response back ---
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('[analyze] fetch error:', err.message);
    return res.status(502).json({ error: 'Upstream request failed — ' + err.message });
  }
}
