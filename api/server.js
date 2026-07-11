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
    const userAgent = req.headers['user-agent'] || '';

    // ==========================================
    // ANTi-INTIP PROTECT: JIKA DIBUKA DARI BROWSER TANPA PARAMETER VALID
    // ==========================================
    if (req.method === 'GET' && !key && !type && !id && !deleteKey) {
        res.setHeader('Content-Type', 'text/html');
        return res.status(403).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>🔒 PROTECTED SECURE API ENGINE</title>
                <style>
                    body { background: #060813; color: #ff4a4a; font-family: monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .card { background: rgba(255,0,0,0.05); border: 1px solid rgba(255,0,0,0.2); padding: 30px; border-radius: 12px; text-align: center; box-shadow: 0 0 30px rgba(255,0,0,0.1); }
                    h1 { font-size: 24px; margin-bottom: 10px; color: #fff; }
                    p { color: #8a9fc4; font-size: 13px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div><span style="font-size: 50px;">🔒</span></div>
                    <h1>403 ACCESS DENIED</h1>
                    <p>NEXUS-X ENGINE: Direct browser queries are strictly restricted.</p>
                    <p style="color: #555;">SSL Secure Connection Active</p>
                </div>
            </body>
            </html>
        `);
    }

    if (req.method === 'GET' && type === 'raw' && id) {
        const sc = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : '-- [NEXUS X] Script tidak ditemukan.');
    }

    if (key) {
        const checkKey = await sql`SELECT * FROM keys WHERE key = ${key}`;
        if (checkKey.length === 0) {
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send('gg.alert("❌ [NEXUS X] Lisensi Salah atau Tidak Terdaftar!")\nos.exit()');
        }

        const license = checkKey[0];
        const expDate = new Date(license.expiry);
        
        if (new Date() > expDate) {
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send('gg.alert("❌ [NEXUS X] Lisensi Anda Telah Kedaluwarsa!"); os.exit()');
        }

        const clientHwid = device || 'NX-DEVICE';
        let registeredDevices = license.registered_devices || [];
        
        if (device && !registeredDevices.includes(clientHwid)) {
            if (registeredDevices.length >= license.max_devices) {
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send('gg.alert("❌ Slot Device Penuh!"); os.exit()');
            }
            registeredDevices.push(clientHwid);
            await sql`UPDATE keys SET registered_devices = ${registeredDevices} WHERE key = ${key}`;
        }

        if (!reqStage) {
            // STAGE 1: KIRIM LOADER SIGNATURE VALIDATION
            const payloadStage1 = `gg.setVisible(false)
local r = gg.makeRequest("https://${host}/api/server?key=${key}&device=${clientHwid}&reqStage=2")
if r and r.code == 200 then load(r.content)() else gg.alert("❌ Autentikasi Cloud Gagal!") os.exit() end`;
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(payloadStage1);
        }

        if (reqStage === '2') {
            const formattedDate = expDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
            const payloadStage2 = `gg.toast("✨ LISENSI VALID SAMPAI: ${formattedDate} ✨")
local sT = os.time() while os.time() < sT + 1 do end
local r = gg.makeRequest("https://${host}/api/server?key=${key}&device=${clientHwid}&reqStage=3")
if r and r.code == 200 then load(r.content)() else os.exit() end`;
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(payloadStage2);
        }

        if (reqStage === '3') {
            const sc = await sql`SELECT content FROM scripts WHERE id = ${license.script_id}`;
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(sc.length > 0 ? sc[0].content : 'gg.alert("❌ Isi script kosong!"); os.exit()');
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
