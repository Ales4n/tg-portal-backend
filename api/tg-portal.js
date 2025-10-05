import crypto from 'crypto';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // LOG 1: Ver todos los query params
  console.log('=== FULL QUERY PARAMS ===');
  console.log(JSON.stringify(req.query, null, 2));
  console.log('========================');

  const { shop, timestamp, signature, path_prefix, ...restParams } = req.query;

  // LOG 2: Ver secret (primeros 10 caracteres)
  const secret = process.env.SHOPIFY_APP_SHARED_SECRET;
  console.log('Secret (first 10 chars):', secret ? secret.substring(0, 10) : 'MISSING');

  if (!shop || !timestamp || !signature) {
    return res.status(401).json({ 
      error: 'Missing required proxy parameters',
      received: { 
        shop: !!shop, 
        timestamp: !!timestamp, 
        signature: !!signature 
      }
    });
  }

  if (!secret) {
    return res.status(500).json({ error: 'Server misconfigured: missing secret' });
  }

  // Construir query string canónico
  const params = { ...restParams };
  if (path_prefix) params.path_prefix = path_prefix;
  params.shop = shop;
  params.timestamp = timestamp;

  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join('&');

  // LOG 3: Ver query string canónico
  console.log('Canonical query string:', queryString);

  // Calcular HMAC
  const computedHash = crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');

  // LOG 4: Comparar firmas
  console.log('Computed signature:', computedHash);
  console.log('Received signature:', signature);
  console.log('Match:', computedHash === signature);

  if (computedHash !== signature) {
    return res.status(401).json({ 
      error: 'Invalid proxy signature',
      debug: {
        computed: computedHash,
        received: signature,
        canonical: queryString,
        secretPrefix: secret.substring(0, 10)
      }
    });
  }

  // Extraer path
  const fullPath = req.url.split('?')[0];
  const path = fullPath.replace('/api/tg-portal', '') || '/';

  if (path === '/ping' || path === '/ping/') {
    return res.status(200).json({ 
      success: true,
      message: 'App Proxy funcionando correctamente',
      shop,
      timestamp,
      customer_id: restParams.logged_in_customer_id || null
    });
  }

  return res.status(404).json({ error: 'Route not found', path });
}
