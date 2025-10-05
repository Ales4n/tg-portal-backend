import crypto from 'crypto';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log('=== APP PROXY REQUEST ===');
  console.log('URL:', req.url);
  console.log('Full query params:', JSON.stringify(req.query, null, 2));

  const { shop, timestamp, signature, path_prefix, ...restParams } = req.query;

  if (!shop || !timestamp || !signature) {
    console.error('Missing required params');
    return res.status(401).json({ 
      error: 'Missing required proxy parameters',
      received: { 
        shop: !!shop, 
        timestamp: !!timestamp, 
        signature: !!signature 
      }
    });
  }

  const secret = process.env.SHOPIFY_APP_SHARED_SECRET;
  if (!secret) {
    console.error('SHOPIFY_APP_SHARED_SECRET not configured');
    return res.status(500).json({ error: 'Server misconfigured: missing secret' });
  }

  console.log('Secret (first 10 chars):', secret.substring(0, 10));
  console.log('Secret length:', secret.length);

  // CRÍTICO: Construir params exactamente como Shopify lo hace
  const params = {};
  
  // Añadir TODOS los params en el orden que vienen (incluyendo vacíos)
  Object.keys(restParams).forEach(key => {
    params[key] = restParams[key]; // NO filtrar strings vacíos
  });
  
  // Añadir path_prefix si existe
  if (path_prefix !== undefined) {
    params.path_prefix = path_prefix;
  }
  
  // Añadir shop y timestamp
  params.shop = shop;
  params.timestamp = timestamp;

  // Ordenar alfabéticamente
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
  console.log('Match:', computedHash === signature);

  if (computedHash !== signature) {
    console.error('Signature mismatch!');
    return res.status(401).json({ 
      error: 'Invalid proxy signature',
      debug: {
        canonical: queryString,
        computed: computedHash,
        received: signature,
        secretLength: secret.length,
        secretPrefix: secret.substring(0, 10)
      }
    });
  }

  console.log('✓ Signature valid');

  // Extraer el path de la petición
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

  if (path === '/' || path === '') {
    return res.status(200).json({
      success: true,
      message: 'TG Portal API - App Proxy root',
      availableRoutes: ['/ping'],
      shop
    });
  }

  return res.status(404).json({ 
    error: 'Route not found',
    path,
    availableRoutes: ['/ping']
  });
}
