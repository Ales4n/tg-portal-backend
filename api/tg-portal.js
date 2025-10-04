import crypto from 'crypto';

export default function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Log completo para debugging
  console.log('=== APP PROXY REQUEST ===');
  console.log('URL:', req.url);
  console.log('Query params:', req.query);
  console.log('========================');

  const { shop, timestamp, signature, path_prefix, ...restParams } = req.query;

  // Validar parámetros requeridos
  if (!shop || !timestamp || !signature) {
    console.error('Missing required params:', { shop: !!shop, timestamp: !!timestamp, signature: !!signature });
    return res.status(401).json({ 
      error: 'Missing required proxy parameters',
      received: { 
        shop: !!shop, 
        timestamp: !!timestamp, 
        signature: !!signature 
      }
    });
  }

  // Verificar secret
  const secret = process.env.SHOPIFY_APP_SHARED_SECRET;
  if (!secret) {
    console.error('SHOPIFY_APP_SHARED_SECRET not configured');
    return res.status(500).json({ error: 'Server misconfigured: missing secret' });
  }

  // Construir query string canónico (alfabético, sin signature)
  const params = { ...restParams, path_prefix, shop, timestamp };
  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join('&');

  console.log('Canonical query string:', queryString);

  // Calcular HMAC
  const computedHash = crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');

  console.log('Computed signature:', computedHash);
  console.log('Received signature:', signature);

  // Validar firma
  if (computedHash !== signature) {
    console.error('Signature mismatch!');
    return res.status(401).json({ 
      error: 'Invalid proxy signature',
      debug: process.env.NODE_ENV === 'development' ? {
        computed: computedHash,
        received: signature,
        canonical: queryString
      } : undefined
    });
  }

  console.log('✓ Signature valid');

  // Extraer el path (después de /api/tg-portal)
  const fullPath = req.url.split('?')[0];
  const path = fullPath.replace('/api/tg-portal', '') || '/';

  console.log('Route path:', path);

  // Rutas
  if (path === '/ping' || path === '/ping/') {
    return res.status(200).json({ 
      success: true,
      message: 'App Proxy funcionando correctamente',
      shop,
      timestamp,
      customer_id: restParams.logged_in_customer_id || null
    });
  }

  if (path === '/') {
    return res.status(200).json({
      success: true,
      message: 'App Proxy root',
      availableRoutes: ['/ping']
    });
  }

  return res.status(404).json({ 
    error: 'Route not found',
    path 
  });
}
