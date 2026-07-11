import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash, randomBytes } from 'crypto';

const dbPath = join(process.cwd(), 'database.json');

function getDB() {
  try {
    if (existsSync(dbPath)) return JSON.parse(readFileSync(dbPath, 'utf-8'));
  } catch (e) {}
  return { files: [], keys: [], accounts: [] };
}

function writeDB(data) {
  try {
    writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {}
}

function hashPass(pw) { return createHash('sha256').update(pw + '_nx_salt_v95').digest('hex'); }
function makePermSession(email, passwordHash) { return createHash('sha256').update(`${email}::${passwordHash}::nx_sess_perm`).digest('hex').substring(0, 32); }
function makeCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = ''; const b = randomBytes(6);
  for (let i = 0; i < 6; i++) code += c[b[i] % c.length];
  return code;
}

function encryptLua(pt) {
  const kb = []; for (let i = 0; i < 16; i++) kb.push(Math.floor(Math.random() * 256));
  const kh = kb.map(b => b.toString(16).padStart(2, '0')).join('');
  const buf = Buffer.from(pt, 'utf-8'); const eb = [];
  for (let i = 0; i < buf.length; i++) eb.push(buf[i] ^ kb[i % 16]);
  const fh = eb.map(b => b.toString(16).padStart(2, '0')).join('');
  const ch = []; for (let i = 0; i < fh.length; i += 80) ch.push(fh.substring(i, i + 80));
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Accept,Origin,X-Session');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getDB();
  const { id, type, authKey, device, reqStage, loader, deleteKey, checkSession } = req.query;

  if (checkSession === '1') {
    const sess = req.headers['x-session'] || '';
    let foundAcc = db.accounts.find(a => makePermSession(a.email, a.password) === sess);
    if (!foundAcc) return res.status(401).json({ error: 'Unauthorized Session' });
    return res.status(200).json({ email: foundAcc.email });
  }

  if (loader === '1') {
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
      `local r=gg.makeRequest("https://riskia.vercel.app/api/server?authKey="..inp[2].."&device="..hwid.."&reqStage=1")`,
      `if r and r.code==200 then`,
      `  local f=load(r.content) if f then f() else gg.alert("Execution error!") end`,
      `else gg.alert("Server Riskia Unreachable!") end`
    ].join('\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(encryptLua(luaClient));
  }

  if (authKey) {
    let lic = db.keys.find(k => k.key === authKey);
    if (!lic) return res.status(200).send(encryptLua('gg.alert("❌ Access Denied: Invalid Key!")'));
    if (new Date() > new Date(lic.expiry)) return res.status(200).send(encryptLua('gg.alert("❌ License Expired!")'));

    const devId = device || 'unknown';
    if (devId !== 'unknown' && !lic.registeredDevices.includes(devId)) {
      if (lic.registeredDevices.length >= lic.maxDevices) {
        return res.status(200).send(encryptLua('gg.alert("❌ HWID Lock: Limit Reached!")'));
      }
      lic.registeredDevices.push(devId);
      writeDB(db);
    }

    if (!reqStage || reqStage === '1') {
      const nextUrl = `https://riskia.vercel.app/api/server?authKey=${authKey}&device=${devId}&reqStage=2`;
      const stage1Code = `local r=gg.makeRequest("${nextUrl}")\nif r and r.code==200 then\n local f=load(r.content) if f then f() else gg.alert("Integrity error") end\nelse gg.alert("Network failure") end`;
      return res.status(200).send(encryptLua(stage1Code));
    }

    if (reqStage === '2') {
      const targetScript = db.files.find(f => f.id === lic.scriptId);
      return res.status(200).send(targetScript ? targetScript.content : 'gg.alert("❌ Script Empty!")');
    }
  }

  const currentSession = req.headers['x-session'] || '';
  let activeUser = db.accounts.find(a => makePermSession(a.email, a.password) === currentSession);

  if (req.method === 'GET') {
    if (!activeUser && type !== 'sync') return res.status(401).json({ error: 'Unauthorized' });
    if (type === 'sync') return res.status(200).json(db);
    if (type === 'keys') return res.status(200).json(db.keys);
    return res.status(200).json(db.files);
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    
    if (body.action === 'register') {
      if (db.accounts.some(a => a.email === body.email)) return res.status(400).json({ error: 'Email terdaftar!' });
      const vCode = makeCode();
      db.accounts.push({ email: body.email, password: hashPass(body.password), code: vCode, created: new Date().toISOString() });
      writeDB(db);
      return res.status(200).json({ success: true, code: vCode });
    }

    if (body.action === 'login') {
      const targetAcc = db.accounts.find(a => a.email === body.email);
      if (!targetAcc || targetAcc.password !== hashPass(body.password)) return res.status(401).json({ error: 'Password salah!' });
      return res.status(200).json({ session: makePermSession(targetAcc.email, targetAcc.password) });
    }

    if (!activeUser) return res.status(401).json({ error: 'Session Expired' });

    if (body.action === 'createKey') {
      const scriptObj = db.files.find(f => f.id === body.scriptId);
      const generatedKey = body.customName || `NX-${Math.random().toString(36).substring(2,8).toUpperCase()}`;
      db.keys.push({
        key: generatedKey, scriptId: body.scriptId, targetScriptName: scriptObj ? scriptObj.name : 'Unknown',
        expiry: body.expiry, maxDevices: parseInt(body.maxDevices) || 1, registeredDevices: []
      });
      writeDB(db);
      return res.status(200).json({ key: generatedKey });
    }

    if (body.id) {
      let idx = db.files.findIndex(f => f.id === body.id);
      if (idx !== -1) {
        db.files[idx].content = body.content;
        db.files[idx].time = new Date().toLocaleString('id-ID') + ' (Updated)';
        writeDB(db);
        return res.status(200).json(db.files[idx]);
      }
    }

    const newId = `riskia_${Math.random().toString(36).substring(2, 11)}`;
    db.files.push({ id: newId, name: body.name || 'script.lua', time: new Date().toLocaleString('id-ID'), content: body.content || '' });
    writeDB(db);
    return res.status(200).json({ id: newId });
  }

  if (req.method === 'DELETE') {
    if (!activeUser) return res.status(401).json({ error: 'Unauthorized' });
    if (deleteKey) db.keys = db.keys.filter(k => k.key !== deleteKey);
    if (id) db.files = db.files.filter(f => f.id !== id);
    writeDB(db);
    return res.status(200).json({ success: true });
  }

  return res.status(405).end();
}
