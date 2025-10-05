import crypto from 'crypto';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log('=== APP PROXY REQUEST ===');
  console.log('Full URL:', req.url);

  // Extraer la query string RAW (sin parsear)
  const urlParts = req.url.split('?');
  if (urlParts.length < 2) {
    return res.status(400).json({ error: 'No query string' });
  }

  const rawQueryString = urlParts[1];
  console.log('Raw query string:', rawQueryString);

  // Parsear manualmente para obtener signature
  const params = new URLSearchParams(rawQueryString);
  const signature = params.get('signature');
  const shop = params.get('shop');
  const timestamp = params.get('timestamp');

  console.log('Parsed params:', {
    shop,
    timestamp,
    signature: signature ? 'present' : 'missing'
  });

  if (!shop || !timestamp || !signature) {
    return res.status(401).json({ 
      error: 'Missing required proxy parameters',
      received: { shop: !!shop, timestamp: !!timestamp, signature: !!signature }
    });
  }

  const secret = process.env.SHOPIFY_APP_SHARED_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Server misconfigured: missing secret' });
  }

  console.log('Secret (first 10 chars):', secret.substring(0, 10));
  console.log('Secret length:', secret.length);

  // Construir query string canónico SIN signature y manteniendo URL encoding
  const paramsArray = [];
  for (const [key, value] of params.entries()) {
    if (key !== 'signature') {
      // CRÍTICO: Mantener el formato key=value tal como viene en la URL
      paramsArray.push({ key, value });
    }
  }

  // Ordenar alfabéticamente por key
  paramsArray.sort((a, b) => a.key.localeCompare(b.key));

  // Construir el query string canónico
  const canonicalQueryString = paramsArray
    .map(({ key, value }) => `${key}=${value}`)
    .join('&');

  console.log('Canonical query string:', canonicalQueryString);

  // Calcular HMAC
  const computedHash = crypto
    .createHmac('sha256', secret)
    .update(canonicalQueryString)
    .digest('hex');

  console.log('Computed signature:', computedHash);
  console.log('Received signature:', signature);
  console.log('Match:', computedHash === signature);

  if (computedHash !== signature) {
    console.error('Signature mismatch!');
    return res.status(401).json({ 
      error: 'Invalid proxy signature',
      debug: {
        canonical: canonicalQueryString,
        computed: computedHash,
        received: signature
      }
    });
  }

  console.log('✓ Signature valid');

  // Ahora sí, usar req.query para la lógica de negocio (valores decoded)
  const { logged_in_customer_id, path_prefix } = req.query;

  // Extraer el path
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
      customer_id: logged_in_customer_id || null,
      path_prefix
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
