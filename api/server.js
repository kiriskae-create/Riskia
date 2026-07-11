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

    const { id, type, key, device, reqStage, deleteKey } = req.query;
    const host = req.headers.host;

    // PROTECTION LINK UTAMA DARI BROWSER PUBLIC
    if (req.method === 'GET' && !key && !type && !id && !deleteKey) {
        res.setHeader('Content-Type', 'text/html');
        return res.status(403).send(`
            <!DOCTYPE html>
            <html>
            <head><title>🔒 SECURE ENCRYPTED API</title></head>
            <body style="background:#090a15;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
                <div style="text-align:center;border:1px solid #ff3b30;padding:40px;border-radius:20px;background:rgba(255,0,0,0.05);">
                    <span style="font-size:40px;">🔒</span>
                    <h2 style="margin:10px 0 5px 0;">403 NETWORK FORBIDDEN</h2>
                    <p style="color:#666;font-size:12px;margin:0;">Protected by Nexus Security Shield v4</p>
                </div>
            </body>
            </html>
        `);
    }

    if (req.method === 'GET' && type === 'raw' && id) {
        const sc = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : '-- Void Script');
    }

    if (key) {
        const checkKey = await sql`SELECT * FROM keys WHERE key = ${key}`;
        if (checkKey.length === 0) {
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send('gg.alert("❌ [NEXUS] Lisensi Tidak Ditemukan!")\nos.exit()');
        }

        const license = checkKey[0];
        const expDate = new Date(license.expiry);
        
        if (new Date() > expDate) {
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send('gg.alert("❌ [NEXUS] Lisensi Kedaluwarsa!"); os.exit()');
        }

        const clientHwid = device || 'NX-UNKNOWN-DEV';
        let registeredDevices = license.registered_devices || [];
        
        if (device && !registeredDevices.includes(clientHwid)) {
            if (registeredDevices.length >= license.max_devices) {
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send('gg.alert("❌ Device penuh!"); os.exit()');
            }
            registeredDevices.push(clientHwid);
            await sql`UPDATE keys SET registered_devices = ${registeredDevices} WHERE key = ${key}`;
        }

        if (!reqStage) {
            // ANTI-HOOK PAYLOAD PROTECT STAGE 1
            const payloadStage1 = `gg.setVisible(false)
local secure_math = tonumber("1293")
local r = gg.makeRequest("https://${host}/api/server?key=${key}&device=${clientHwid}&reqStage=2")
if r and r.code == 200 then load(r.content)() else os.exit() end`;
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(payloadStage1);
        }

        if (reqStage === '2') {
            const formattedDate = expDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
            // DOUBLE VALIDATION STAGE: PROTEKSI METATABLE LUA DARI DUMP MEMORI
            const payloadStage2 = `gg.toast("Verification Approved Engine")
local env_meta = getmetatable(_G)
if env_meta then env_meta.__index = nil end
local r = gg.makeRequest("https://${host}/api/server?key=${key}&device=${clientHwid}&reqStage=3")
if r and r.code == 200 then load(r.content)() else os.exit() end`;
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(payloadStage2);
        }

        if (reqStage === '3') {
            const sc = await sql`SELECT content FROM scripts WHERE id = ${license.script_id}`;
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(sc.length > 0 ? sc[0].content : 'gg.alert("Void Content"); os.exit()');
        }
    }

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
            if (existingScriptId) {
                await sql`UPDATE scripts SET name = ${name}, content = ${content}, updated_at = CURRENT_TIMESTAMP WHERE id = ${existingScriptId}`;
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
