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

    // ==========================================
    // JALUR PUBLIC BYPASS: RAW SCRIPT VIEW
    // ==========================================
    if (req.method === 'GET' && type === 'raw' && id) {
        const sc = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : '-- [NEXUS X] Script tidak ditemukan atau kosong.');
    }

    // ==========================================
    // JALUR UTAMA GAME GUARDIAN ENGINE (LICENSE VALIDATION)
    // ==========================================
    if (key) {
        const checkKey = await sql`SELECT * FROM keys WHERE key = ${key}`;
        if (checkKey.length === 0) {
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send('gg.alert("❌ [NEXUS X] Lisensi tidak ditemukan di Cloud Database!")\nos.exit()');
        }

        const license = checkKey[0];
        const expDate = new Date(license.expiry);
        
        if (new Date() > expDate) {
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send('gg.alert("❌ [NEXUS X] Masa aktif Lisensi ini telah kedaluwarsa!"); os.exit()');
        }

        const clientHwid = device || 'NX-INIT-DEVICE';
        let registeredDevices = license.registered_devices || [];
        
        if (device && !registeredDevices.includes(clientHwid)) {
            if (registeredDevices.length >= license.max_devices) {
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send('gg.alert("❌ [NEXUS X] Batas perangkat penuh! Maksimum ' + license.max_devices + ' Perangkat."); os.exit()');
            }
            registeredDevices.push(clientHwid);
            await sql`UPDATE keys SET registered_devices = ${registeredDevices} WHERE key = ${key}`;
        }

        // STAGE 1: Initial Hook Loader
        if (!reqStage) {
            const payloadStage1 = `gg.setVisible(false)
local raw_hwid = "NX-" .. tostring(gg.getTargetPackage())
local encoded_hwid = ""
for i = 1, #raw_hwid do
    encoded_hwid = encoded_hwid .. string.format("%02X", string.byte(raw_hwid, i))
end
local r = gg.makeRequest("https://${host}/api/server?key=${key}&device="..encoded_hwid.."&reqStage=2")
if r and r.code == 200 then load(r.content)() else gg.alert("❌ [NEXUS X] Koneksi Secureserver Gagal!") os.exit() end`;
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(payloadStage1);
        }

        // STAGE 2: Splash Toast & Verify Redirect
        if (reqStage === '2') {
            const formattedDate = expDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const payloadStage2 = `gg.toast("✨ ACCESS GRANTED PREMIER SYSTEM ✨\\n🔑 LISENSI: ${key}\\n⏳ HINGGA: ${formattedDate}")
local sysTime = os.time() while os.time() < sysTime + 2 do end
local r = gg.makeRequest("https://${host}/api/server?key=${key}&device=${clientHwid}&reqStage=3")
if r and r.code == 200 then load(r.content)() else gg.alert("❌ Terjadi kesalahan sinkronisasi payload tahap akhir!") os.exit() end`;
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(payloadStage2);
        }

        // STAGE 3: Final Payload Delivery
        if (reqStage === '3') {
            const sc = await sql`SELECT content FROM scripts WHERE id = ${license.script_id}`;
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(sc.length > 0 ? sc[0].content : 'gg.alert("❌ Konten Script kosong di Database Cloud!"); os.exit()');
        }
    }

    // ==========================================
    // BACKEND DASHBOARD ADMINISTRATOR MANAGEMENT
    // ==========================================
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
