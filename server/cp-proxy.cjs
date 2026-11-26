const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const CP_API_BASE_URL = 'https://api-gateway.cp.pt/cp/services/travel-api/stations';
const STATIONS_URL = CP_API_BASE_URL;
const PORT = Number(process.env.CP_PROXY_PORT || 3001);

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadEnvFile();

const connectId = process.env.X_CP_CONNECT_ID;
const connectSecret = process.env.X_CP_CONNECT_SECRET;
if (!connectId || !connectSecret) {
  console.error('Set X_CP_CONNECT_ID and X_CP_CONNECT_SECRET in .env before starting the CP proxy.');
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  const stationsRequest = requestUrl.pathname === '/api/cp/stations';
  const timetableMatch = requestUrl.pathname.match(
    /^\/api\/cp\/stations\/([A-Za-z0-9_-]+)\/timetable\/(\d{4}-\d{2}-\d{2})$/,
  );
  const start = requestUrl.searchParams.get('start');
  const validTimetableRequest =
    timetableMatch &&
    requestUrl.searchParams.get('view') === 'DEPARTURES' &&
    start !== null &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start);
  if (
    request.method !== 'GET' ||
    (!stationsRequest && !validTimetableRequest)
  ) {
    response.writeHead(request.method === 'GET' ? 404 : 405, {
      'content-type': 'application/json',
      ...(request.method === 'GET' ? {} : { allow: 'GET' }),
    });
    response.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const upstreamUrl = stationsRequest
    ? new URL(STATIONS_URL)
    : new URL(`${CP_API_BASE_URL}/${timetableMatch[1]}/timetable/${timetableMatch[2]}`);
  if (!stationsRequest) {
    upstreamUrl.searchParams.set('view', 'DEPARTURES');
    upstreamUrl.searchParams.set('start', start);
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        accept: 'application/json',
        'x-cp-connect-id': connectId,
        'x-cp-connect-secret': connectSecret,
      },
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/json',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch (error) {
    console.error('CP API request failed.', error);
    response.writeHead(502, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'CP service is unavailable.' }));
  }
});

server.listen(PORT, process.env.HOST || '127.0.0.1', () => {
  console.log(`CP API proxy listening on port ${PORT}.`);
});
