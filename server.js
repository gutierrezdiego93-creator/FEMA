const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const FRACTTAL_BASE = 'https://one.fracttal.com';

// Variables de entorno (se configuran en Railway)
const CLIENT_ID     = process.env.FRACTTAL_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.FRACTTAL_CLIENT_SECRET || '';

// Middlewares
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── HEALTH CHECK ────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'FEMA OT Proxy', fracttal: FRACTTAL_BASE });
});

// ─── AUTH — Login con usuario y contraseña ───────────────────
app.post('/api/auth', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username y password requeridos' });
    }

    const params = new URLSearchParams({
      grant_type:    'password',
      username,
      password,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    const r = await fetch(`${FRACTTAL_BASE}/oauth/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });

    const data = await r.json();

    if (!r.ok) {
      console.error('Fracttal auth error:', JSON.stringify(data));
      return res.status(401).json({ error: 'Credenciales incorrectas', detail: data });
    }

    return res.json({
      access_token: data.access_token,
      expires_in:   data.expires_in,
    });

  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── PROXY — Reenvía llamadas a Fracttal API ─────────────────
app.post('/api/proxy', async (req, res) => {
  try {
    const { endpoint, method, body, token } = req.body || {};

    if (!endpoint) return res.status(400).json({ error: 'endpoint requerido' });
    if (!token)    return res.status(401).json({ error: 'token requerido' });

    const r = await fetch(`${FRACTTAL_BASE}${endpoint}`, {
      method:  method || 'GET',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await r.json();
    return res.status(r.status).json(data);

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── TASKS — Crear OT no programada ──────────────────────────
app.post('/api/tasks/noscheduled', async (req, res) => {
  try {
    const { token, payload } = req.body || {};
    if (!token)   return res.status(401).json({ error: 'token requerido' });
    if (!payload) return res.status(400).json({ error: 'payload requerido' });

    const r = await fetch(`${FRACTTAL_BASE}/api/v1/tasks/noscheduled/`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json();
    return res.status(r.status).json(data);

  } catch (err) {
    console.error('Tasks error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── TAREAS PENDIENTES FEMA ───────────────────────────────────
app.get('/api/fema/tareas', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'token requerido' });

    const FEMA_CODES = ['TC-0770','TC-0771','TC-0776','TC-0784','TC-0785','TC-0789',
      'TC-2047','TC-2185','TT-1183','TT-1220','TT-1222','TT-1242','TT-1244','TT-1504',
      'RE-50129','RE-50347','RE-51022','RE-51217','RE-51621','RE-51741',
      'A-0067','A-0128','A-0132','F-30323','F-30445','F-30584','F-30631'];

    const FEMA_PATH = '46128370.48905423';

    const r = await fetch(`${FRACTTAL_BASE}/api/v1/tasks/?limit=500`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await r.json();

    // Filtrar solo tareas de activos FEMA
    const tareasFema = (data.data || []).filter(t =>
      t.parent_path_node?.startsWith(FEMA_PATH) ||
      FEMA_CODES.includes(t.code)
    );

    return res.json({ success: true, data: tareasFema, total: tareasFema.length });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`FEMA OT Proxy corriendo en puerto ${PORT}`);
});
