import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';

const sql = neon(process.env.POSTGRES_URL);

function hashPass(pw) { return createHash('sha256').update(pw + '_nx_postgres_salt').digest('hex'); }
function makeSession(email, hash) { return createHash('md5').update(email + hash + 'session_token').digest('hex'); }

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id, type, key, device, reqStage, deleteKey, validate } = req.query;
    const host = req.headers.host;

    // UNIQUE LOADER PER KEY
    if (req.method === 'GET' && type === 'loader') {
        const loaderKey = key || '';
        const code = `gg.setVisible(false)
gg.toast("[X] NEXUS X - Connecting... [${loaderKey || 'Manual'}]")
local r = gg.makeRequest("https://\( {host}/api/server?type=login \){loaderKey ? '&validate=' + loaderKey : ''}&device=" .. tostring(gg.getTargetPackage() or "UNKNOWN"))
if r and r.code == 200 then load(r.content)() else gg.alert("[X] Connection Failed!") end`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(code);
    }

    if (req.method === 'GET' && type === 'menu' && id) {
        const sc = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : 'gg.alert("[X] Menu not found!")');
    }

    if (req.method === 'GET' && type === 'login') {
        if (validate) {
            const checkKey = await sql`SELECT * FROM keys WHERE key = ${validate}`;
            if (checkKey.length === 0) {
                const c = `os.remove("/sdcard/.nexus_auth")
gg.alert("[X] Invalid Key!")
local r = gg.makeRequest("https://${host}/api/server?type=login")
if r and r.code == 200 then load(r.content)() end`;
                return res.status(200).send(c);
            }
            const license = checkKey[0];
            const expDate = new Date(license.expiry);
            if (new Date() > expDate) {
                const fd = expDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
                const c = `os.remove("/sdcard/.nexus_auth")
gg.alert("[X] EXPIRED on ${fd}")
local r = gg.makeRequest("https://${host}/api/server?type=login")
if r and r.code == 200 then load(r.content)() end`;
                return res.status(200).send(c);
            }
            const clientHwid = device || 'NX-UNKNOWN';
            let registeredDevices = license.registered_devices || [];
            if (device && !registeredDevices.includes(clientHwid)) {
                if (registeredDevices.length >= license.max_devices) return res.status(200).send('gg.alert("Max devices!")');
                registeredDevices.push(clientHwid);
                await sql`UPDATE keys SET registered_devices = ${registeredDevices} WHERE key = ${validate}`;
            }
            const fd = expDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
            const c = `local f=io.open("/sdcard/.nexus_auth","w") if f then f:write("${validate}");f:close() end
gg.alert("[X] ACCESS GRANTED\\nExp: ${fd}")
local r = gg.makeRequest("https://\( {host}/api/server?type=menu&id= \){license.script_id}")
local fn=load(r.content) if fn then fn() else gg.alert("Menu failed!") end`;
            return res.status(200).send(c);
        }

        // Keyboard Input Fix (text prompt)
        const loginLua = `gg.setVisible(false)
local BASE="https://${host}"
local function doValidate(k)
  local r=gg.makeRequest(BASE.."/api/server?type=login&validate="..k.."&device=NX-"..tostring(gg.getTargetPackage() or "UKN"))
  if r and r.code==200 then load(r.content)() end
end
local input=gg.prompt({"License Key (Keyboard Input)"}, {""}, {"text"})
if input and input[1] then doValidate(input[1]) end`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(loginLua);
    }

    // Legacy + Admin logic (kept intact from your original)
    const sessionToken = req.headers['x-session'];
    let authenticatedUser = null;
    if (sessionToken) {
        const accounts = await sql`SELECT * FROM accounts`;
        for (const acc of accounts) {
            if (makeSession(acc.email, acc.password) === sessionToken) { authenticatedUser = acc.email; break; }
        }
    }

    if (req.method === 'POST') {
        const { action, email, password, name, content, scriptId, expiry, maxDevices, customName, existingScriptId } = req.body;
        if (action === 'register') {
            const secretCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            await sql`INSERT INTO accounts (email, password, code) VALUES (${email}, ${hashPass(password)}, ${secretCode}) ON CONFLICT (email) DO NOTHING`;
            return res.status(200).json({ success: true, code: secretCode });
        }
        if (action === 'login') {
            const acc = await sql`SELECT * FROM accounts WHERE email = ${email}`;
            if (acc.length > 0 && acc[0].password === hashPass(password)) return res.status(200).json({ session: makeSession(email, acc[0].password) });
            return res.status(401).json({ error: 'Auth failed' });
        }
        if (!authenticatedUser) return res.status(401).json({ error: 'Access Denied' });
        if (name && content) {
            if (existingScriptId && existingScriptId !== "") {
                await sql`UPDATE scripts SET name = ${name}, content = ${content} WHERE id = ${existingScriptId}`;
            } else {
                await sql`INSERT INTO scripts (id, name, content) VALUES (${'sc_' + Math.random().toString(36).substring(2, 9)}, ${name}, ${content})`;
            }
            return res.status(200).json({ success: true });
        }
        if (action === 'createKey') {
            const finalKey = customName || 'NX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            const target = await sql`SELECT name FROM scripts WHERE id = ${scriptId}`;
            await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices) VALUES (${finalKey}, ${scriptId}, ${target[0]?.name || 'Unknown'}, ${new Date(expiry)}, ${parseInt(maxDevices) || 1})`;
            return res.status(200).json({ key: finalKey });
        }
    }

    if (req.method === 'GET') {
        if (!authenticatedUser) return res.status(401).json({ error: 'Access Denied' });
        return res.status(200).json(type === 'keys' ? await sql`SELECT * FROM keys` : await sql`SELECT * FROM scripts`);
    }

    if (req.method === 'DELETE') {
        if (!authenticatedUser) return res.status(401).json({ error: 'Access Denied' });
        if (deleteKey) await sql`DELETE FROM keys WHERE key = ${deleteKey}`;
        if (id) await sql`DELETE FROM scripts WHERE id = ${id}`;
        return res.status(200).json({ success: true });
    }
}
