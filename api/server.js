import { createHash, randomBytes } from 'crypto';

// In-Memory Fallback Cache untuk mencegah kehilangan data saat Vercel instance aktif
let memCache = { files: [], keys: [], accounts: [] };
let config = {
  npointId: "7c9e0fa95d665b169ce3",
  npointKey: "void_nexus_sec_v88",
  resendKey: "re_NdFGVUbN_Bn9Q9yRAfKCzL37BRrj7au91"
};

// Enkripsi XOR untuk mengamankan data yang dikirim ke npoint cloud
function xorEnc(data, key) {
  const j = JSON.stringify(data);
  const b = Buffer.from(j, 'utf-8');
  const e = Buffer.alloc(b.length);
  for (let i = 0; i < b.length; i++) {
    e[i] = b[i] ^ key.charCodeAt(i % key.length);
  }
  return e.toString('base64');
}

function xorDec(enc, key) {
  try {
    const b = Buffer.from(enc, 'base64');
    const d = Buffer.alloc(b.length);
    for (let i = 0; i < b.length; i++) {
      d[i] = b[i] ^ key.charCodeAt(i % key.length);
    }
    return JSON.parse(d.toString('utf-8'));
  } catch (e) {
    return null;
  }
}

// Mengambil Database secara Realtime dari Cloud Storage (Mengatasi problem Vercel stateless)
async function fetchCloudDB() {
  try {
    const res = await fetch(`https://api.npoint.io/${config.npointId}`, { method: 'GET' });
    if (res.ok) {
      const raw = await res.json();
      if (typeof raw === 'string') {
        const decrypted = xorDec(raw, config.npointKey);
        if (decrypted && decrypted.accounts) return decrypted;
      } else if (raw && raw.accounts) {
        return raw;
      }
    }
  } catch (e) {}
  return memCache;
}

// Menyimpan Database langsung ke Cloud secara Realtime
async function pushCloudDB(dbData) {
  memCache = dbData;
  try {
    const cipherText = xorEnc(dbData, config.npointKey);
    await fetch(`https://api.npoint.io/${config.npointId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cipherText)
    });
  } catch (e) {}
}

function hashPass(pw) {
  return createHash('sha256').update(pw + '_nx_salt_v87').digest('hex');
}

function makePermSession(email, passwordHash) {
  return createHash('sha256').update(`${email}::${passwordHash}::nx_sess_perm`).digest('hex').substring(0, 32);
}

function makeCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const b = randomBytes(6);
  for (let i = 0; i < 6; i++) code += c[b[i] % c.length];
  return code;
}

// Proteksi Client-GameGuardian (Anti-Sniffing via Browser)
function isBrowser(req) {
  const ua = req.headers['user-agent'] || '';
  return /Mozilla|Chrome|Safari|Firefox|Edge|Opera/i.test(ua) && !/Dalvik/i.test(ua);
}

function encryptLua(pt) {
  const kb = [];
  for (let i = 0; i < 16; i++) kb.push(Math.floor(Math.random() * 256));
  const kh = kb.map(b => b.toString(16).padStart(2, '0')).join('');
  const buf = Buffer.from(pt, 'utf-8');
  const eb = [];
  for (let i = 0; i < buf.length; i++) eb.push(buf[i] ^ kb[i % 16]);
  const fh = eb.map(b => b.toString(16).padStart(2, '0')).join('');
  const ch = [];
  for (let i = 0; i < fh.length; i += 80) ch.push(fh.substring(i, i + 80));
  const cs = ch.map(c => `"${c}"`).join(',');
  
  return [
    `local _K="${kh}"`,
    `local _D={${cs}}`,
    `local _R=table.concat(_D)`,
    `local _L=#_R`,
    `if _L%2~=0 then gg.alert("Err") return end`,
    `local _B={}`,
    `local _N=0`,
    `for _i=1,_L,2 do`,
    `  local _h=tonumber(_R:sub(_i,_i+1),16)`,
    `  if _h==nil then _h=0 end`,
    `  local _kp=((_N%16)*2)+1`,
    `  local _k=tonumber(_K:sub(_kp,_kp+1),16)`,
    `  if _k==nil then _k=0 end`,
    `  local _x=0`,
    `  local _p=1`,
    `  for _b=0,7 do`,
    `    if math.floor(_h/_p)%2~=math.floor(_k/_p)%2 then _x=_x+_p end`,
    `    -- Engine Optimization`,
    `    _p=_p*2`,
    `  end`,
    `  _B[_N+1]=string.char(_x)`,
    `  _N=_N+1`,
    `end`,
    `local _S=table.concat(_B)`,
    `local _F=load(_S)`,
    `if not _F then _F=loadstring(_S) end`,
    `if _F then _F() else gg.alert("Security Check Failed!") end`
  ].join('\n');
}

async function sendCodeEmail(email, code) {
  if (!config.resendKey) return false;
  try {
    const html = `<!DOCTYPE html><html><body style="background:#000;color:#fff;padding:20px;"><h2 style="color:#00f5ff;">NEXUS X CODE</h2><p>Kode Registrasi: <b style="font-size:20px;color:#fff;">${code}</b></p></body></html>`;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'NEXUS X <onboarding@resend.dev>', to: [email], subject: 'Nexus X Verification Code', html: html })
    });
    return r.ok;
  } catch (e) { return false; }
}

const fake404 = '<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>Not Found</h1><p>The requested URL was not found on this server.</p></body></html>';

export default async function handler(req, res) {
  // CORS Headers setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Accept,Origin,X-Session');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Load Database Realtime dari Cloud storage
  const db = await fetchCloudDB();
  
  const { id, type, authKey, device, reqStage, loader, deleteKey, checkSession } = req.query;

  // 1. VALIDASI SESSION FRONTEND (PERMANENT HASH LOCK)
  if (checkSession === '1') {
    const sess = req.headers['x-session'] || '';
    let foundAcc = null;
    for (let i = 0; i < db.accounts.length; i++) {
      if (makePermSession(db.accounts[i].email, db.accounts[i].password) === sess) {
        foundAcc = db.accounts[i];
        break;
      }
    }
    if (!foundAcc) return res.status(401).json({ error: 'Unauthorized Session' });
    return res.status(200).json({ email: foundAcc.email });
  }

  // 2. BOOTSTRAP INJECTOR CLIENT GAMEGUARDIAN
  if (loader === '1') {
    if (isBrowser(req)) return res.status(404).send(fake404);
    const host = req.headers.host;
    const luaClient = [
      `gg.setVisible(false)`,
      `local function getD()`,
      `  local ok,f=pcall(io.open,"/sys/class/net/wlan0/address","r")`,
      `  if ok and f then local m=f:read("*a") f:close() if m then return m:gsub("\\n",""):gsub(":","") end end`,
      `  return "NOID"`,
      `end`,
      `local hwid=getD()`,
      `local inp=gg.prompt({"[NEXUS X] DEVICE ID","[NEXUS X] INPUT LICENSE KEY"},{hwid,""},{"text","text"})`,
      `if not inp or inp[2]=="" then return end`,
      `local r=gg.makeRequest("https://${host}/api/server?authKey="..inp[2].."&device="..hwid.."&reqStage=1")`,
      `if r and r.code==200 then`,
      `  local f=load(r.content) if f then f() else gg.alert("Execution error!") end`,
      `else gg.alert("Server Unreachable!") end`
    ].join('\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(encryptLua(luaClient));
  }

  // 3. GAMEGUARDIAN LICENSE & SCRIPT DEPLOYMENT PIPELINE
  if (authKey) {
    if (isBrowser(req)) return res.status(404).send(fake404);
    let lic = db.keys.find(k => k.key === authKey);
    if (!lic) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(encryptLua('gg.alert("❌ Access Denied: Invalid License Key!")'));
    }
    if (new Date() > new Date(lic.expiry)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(encryptLua('gg.alert("❌ License Expired! Please renew.")'));
    }

    const devId = device || 'unknown';
    if (devId !== 'unknown' && !lic.registeredDevices.includes(devId)) {
      if (lic.registeredDevices.length >= lic.maxDevices) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(encryptLua('gg.alert("❌ HWID Lock: Device Limit Reached!")'));
      }
      lic.registeredDevices.push(devId);
      await pushCloudDB(db);
    }

    if (!reqStage || reqStage === '1') {
      const nextUrl = `https://${req.headers.host}/api/server?authKey=${authKey}&device=${devId}&reqStage=2`;
      const stage1Code = `local r=gg.makeRequest("${nextUrl}")\nif r and r.code==200 then\n local f=load(r.content) if f then f() else gg.alert("Integrity error") end\nelse gg.alert("Network failure") end`;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(encryptLua(stage1Code));
    }

    if (reqStage === '2') {
      const targetScript = db.files.find(f => f.id === lic.scriptId);
      const outputPayload = targetScript ? targetScript.content : 'gg.alert("❌ Script not synchronized in Cloud Database!")';
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(outputPayload);
    }
  }

  // Session Verification untuk Dashboard Administrasi
  const currentSession = req.headers['x-session'] || '';
  let activeUser = null;
  for (let i = 0; i < db.accounts.length; i++) {
    if (makePermSession(db.accounts[i].email, db.accounts[i].password) === currentSession) {
      activeUser = db.accounts[i];
      break;
    }
  }

  // ==========================================
  // ROUTING LEVEL TERATAS BERDASARKAN METHOD HTTP
  // ==========================================

  // --- A. METHOD GET ---
  if (req.method === 'GET') {
    if (!activeUser) return res.status(401).json({ error: 'Unauthorized access token' });
    if (type === 'keys') return res.status(200).json(db.keys);
    if (id) {
      const f = db.files.find(file => file.id === id);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(f ? f.content : '-- Script Data Empty');
    }
    return res.status(200).json(db.files);
  }

  // --- B. METHOD POST ---
  if (req.method === 'POST') {
    const body = req.body || {};
    
    if (body.action === 'register') {
      if (!body.email || !body.password) return res.status(400).json({ error: 'Semua kolom wajib diisi!' });
      if (db.accounts.some(a => a.email === body.email)) return res.status(400).json({ error: 'Email sudah terdaftar!' });
      
      const vCode = makeCode();
      db.accounts.push({
        email: body.email,
        password: hashPass(body.password),
        code: vCode,
        created: new Date().toISOString()
      });
      await pushCloudDB(db);
      await sendCodeEmail(body.email, vCode);
      return res.status(200).json({ success: true, code: vCode });
    }

    if (body.action === 'login') {
      if (!body.email || !body.password) return res.status(400).json({ error: 'Email dan password kosong!' });
      const targetAcc = db.accounts.find(a => a.email === body.email);
      if (!targetAcc || targetAcc.password !== hashPass(body.password)) {
        return res.status(401).json({ error: 'Email atau password salah!' });
      }
      return res.status(200).json({ session: makePermSession(targetAcc.email, targetAcc.password) });
    }

    // Dashboard Guard Check
    if (!activeUser) return res.status(401).json({ error: 'Access token invalid' });

    if (body.action === 'createKey') {
      const scriptObj = db.files.find(f => f.id === body.scriptId);
      const generatedKey = body.customName || `NX-${Math.random().toString(36).substring(2,8).toUpperCase()}`;
      db.keys.push({
        key: generatedKey,
        scriptId: body.scriptId,
        targetScriptName: scriptObj ? scriptObj.name : 'Unknown Script',
        expiry: body.expiry,
        maxDevices: parseInt(body.maxDevices) || 1,
        registeredDevices: []
      });
      await pushCloudDB(db);
      return res.status(200).json({ key: generatedKey });
    }

    // Mengupdate script atau membuat script baru
    if (body.id) {
      let scriptIndex = db.files.findIndex(f => f.id === body.id);
      if (scriptIndex !== -1) {
        db.files[scriptIndex].content = body.content;
        db.files[scriptIndex].time = new Date().toLocaleString('id-ID') + ' (Cloud Updated)';
        await pushCloudDB(db);
        return res.status(200).json(db.files[scriptIndex]);
      }
    }

    const newScriptId = `script_${Math.random().toString(36).substring(2, 11)}`;
    db.files.push({
      id: newScriptId,
      name: body.name || 'unnamed_script.lua',
      time: new Date().toLocaleString('id-ID'),
      content: body.content || ''
    });
    await pushCloudDB(db);
    return res.status(200).json({ id: newScriptId });
  }

  // --- C. METHOD PUT ---
  if (req.method === 'PUT') {
    if (!activeUser) return res.status(401).json({ error: 'Unauthorized action' });
    if (req.body && req.body.encrypt && req.body.content) {
      return res.status(200).json({ success: true, content: encryptLua(req.body.content) });
    }
    return res.status(400).json({ error: 'Bad parameters' });
  }

  // --- D. METHOD DELETE ---
  if (req.method === 'DELETE') {
    if (!activeUser) return res.status(401).json({ error: 'Unauthorized action' });
    if (deleteKey) {
      db.keys = db.keys.filter(k => k.key !== deleteKey);
      await pushCloudDB(db);
      return res.status(200).json({ success: true });
    }
    if (id) {
      db.files = db.files.filter(f => f.id !== id);
      await pushCloudDB(db);
      return res.status(200).json({ success: true });
    }
  }

  return res.status(405).end();
}
