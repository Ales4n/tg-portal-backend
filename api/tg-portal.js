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

  // Extraer la query string RAW
  const urlParts = req.url.split('?');
  if (urlParts.length < 2) {
    return res.status(400).json({ error: 'No query string' });
  }

  const rawQueryString = urlParts[1];
  console.log('Raw query string:', rawQueryString);

  // Parsear manualmente SIN decodificar
  const rawParams = rawQueryString.split('&');
  const paramsMap = {};
  let signature = null;

  rawParams.forEach(param => {
    const [key, value] = param.split('=');
    if (key === 'signature') {
      signature = value;
    } else {
      paramsMap[key] = value || ''; // Mantener strings vacíos
    }
  });

  console.log('Params map (without signature):', paramsMap);
  console.log('Signature:', signature ? 'present' : 'missing');

  // Validar parámetros requeridos
  if (!paramsMap.shop || !paramsMap.timestamp || !signature) {
    return res.status(401).json({ 
      error: 'Missing required proxy parameters',
      received: { 
        shop: !!paramsMap.shop, 
        timestamp: !!paramsMap.timestamp, 
        signature: !!signature 
      }
    });
  }

  const secret = process.env.SHOPIFY_APP_SHARED_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Server misconfigured: missing secret' });
  }

  console.log('Secret (first 10 chars):', secret.substring(0, 10));
  console.log('Secret length:', secret.length);

  // Ordenar alfabéticamente las keys
  const sortedKeys = Object.keys(paramsMap).sort();
  
  // Construir canonical query string (sin decodificar los valores)
  const canonicalQueryString = sortedKeys
    .map(key => `${key}=${paramsMap[key]}`)
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

  // Ahora decodificar valores para uso en la lógica
  const shop = decodeURIComponent(paramsMap.shop);
  const timestamp = paramsMap.timestamp;
  const logged_in_customer_id = paramsMap.logged_in_customer_id ? 
    decodeURIComponent(paramsMap.logged_in_customer_id) : null;

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
      customer_id: logged_in_customer_id,
      proxy_working: true
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
