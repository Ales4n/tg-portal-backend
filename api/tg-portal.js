import crypto from 'crypto';

export default function handler(req, res) {
  // CORS para peticiones desde storefront
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { shop, timestamp, signature, path_prefix, ...restParams } = req.query;

  // Log para debugging
  console.log('App Proxy Request:', {
    shop,
    timestamp,
    signature: signature ? 'present' : 'missing',
    path_prefix,
    allParams: Object.keys(req.query),
    url: req.url
  });

  // Verificar firma HMAC
  if (!shop || !timestamp || !signature) {
    return res.status(401).json({ 
      error: 'Missing required proxy parameters',
      received: { shop: !!shop, timestamp: !!timestamp, signature: !!signature }
    });
  }

  const secret = process.env.SHOPIFY_APP_SHARED_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  // Construir query string canónico (sin 'signature')
  const params = { ...restParams, shop, timestamp, path_prefix };
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');

  const hash = crypto
    .createHmac('sha256', secret)
    .update(sortedParams)
    .digest('hex');

  if (hash !== signature) {
    return res.status(401).json({ 
      error: 'Bad proxy signature',
      debug: {
        computed: hash,
        received: signature,
        canonical: sortedParams
      }
    });
  }

  // Rutas
  const path = req.url.split('?')[0].replace('/api/tg-portal', '');

  if (path === '/ping') {
    return res.status(200).json({ 
      ok: true, 
      message: 'Proxy working!',
      shop,
      timestamp 
    });
  }

  return res.status(404).json({ error: 'Route not found' });
}
