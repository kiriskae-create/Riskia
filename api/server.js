import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';

const sql = neon(process.env.POSTGRES_URL);

// KREDENSIAL DIKUNCI MATI (ANTI SQL INJECTION)
const FIXED_USER = "riski";
const FIXED_PASS = "2409";
const SERVER_SESSION_SALT = "nexus_secure_core_session_2026";

function generateSessionToken() {
    return createHash('sha256').update(FIXED_USER + FIXED_PASS + SERVER_SESSION_SALT).digest('hex');
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id, type, validate, device, deleteKey } = req.query;
    const host = req.headers.host;

    // --- FITUR GG CLIENT / INTERCEPT GET DARI GAME INJECTION ---
    if (req.method === 'GET' && type === 'loader') {
        const targetScriptId = id || 'default';
        const code = [
            'gg.setVisible(false)',
            'local r = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + targetScriptId + '")',
            'if r and r.code == 200 then',
            '    local fn = load(r.content)',
            '    if fn then fn() else gg.alert("Script Empty!") end',
            'else',
            '    gg.alert("Connection Failed!")',
            'end'
        ].join('\n');
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(code);
    }

    if (req.method === 'GET' && type === 'menu' && id) {
        // Amankan parameterized query
        const sc = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : 'gg.alert("[X] Script Menu Not Found!")');
    }

    if (req.method === 'GET' && type === 'login') {
        const targetScriptId = id || '';
        if (validate) {
            const checkKey = await sql`SELECT * FROM keys WHERE key = ${validate}`;
            if (checkKey.length === 0 || (targetScriptId !== '' && checkKey[0].script_id !== targetScriptId)) {
                const c = [
                    'os.remove("/sdcard/.nexus_auth")',
                    'gg.alert("Invalid License Key for this module!")',
                    'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                    'if r and r.code == 200 then load(r.content)() end'
                ].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(c);
            }
            
            const license = checkKey[0];
            const isPermanent = license.expiry.startsWith('9999');

            if (!isPermanent) {
                if (new Date() > new Date(license.expiry)) {
                    const c = [
                        'os.remove("/sdcard/.nexus_auth")',
                        'gg.alert("License Key Expired!")',
                        'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                        'if r and r.code == 200 then load(r.content)() end'
                    ].join('\n');
                    res.setHeader('Content-Type', 'text/plain');
                    return res.status(200).send(c);
                }
            }

            const clientHwid = device || 'NX-UNKNOWN';
            let registeredDevices = license.registered_devices || [];
            if (device && !registeredDevices.includes(clientHwid)) {
                if (registeredDevices.length >= license.max_devices) {
                    const c = [
                        'os.remove("/sdcard/.nexus_auth")',
                        'gg.alert("Max Device Slot Reached!")',
                        'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                        'if r and r.code == 200 then load(r.content)() end'
                    ].join('\n');
                    res.setHeader('Content-Type', 'text/plain');
                    return res.status(200).send(c);
                }
                registeredDevices.push(clientHwid);
                await sql`UPDATE keys SET registered_devices = ${registeredDevices} WHERE key = ${validate}`;
            }

            const labelExp = isPermanent ? "PERMANENT ACCESS" : "Valid Access";
            const c = [
                'local f = io.open("/sdcard/.nexus_auth", "w")',
                'if f then f:write("' + validate + '"); f:close() end',
                'gg.toast("ACCESS GRANTED | ' + labelExp + '")',
                'local r = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + license.script_id + '")',
                'local fn = load(r.content)',
                'if fn then fn() else gg.alert("Failed to execute payload!") end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(c);
        }
    }

    // --- ALUR LOGIN DIPROTEKSI DARI SQL INJECTION ---
    if (req.method === 'POST') {
        const { action, username, password } = req.body;
        if (action === 'login') {
            // Evaluasi dilakukan di variabel internal kode JavaScript node.js, bukan query database mentah.
            if (username === FIXED_USER && password === FIXED_PASS) {
                return res.status(200).json({ session: generateSessionToken() });
            }
            return res.status(401).json({ error: 'Invalid Identity Key' });
        }
    }

    // --- VALIDASI SESSION KE SELURUH FITUR ADMIN ---
    const sessionToken = req.headers['x-session'];
    const validToken = generateSessionToken();
    if (!sessionToken || sessionToken !== validToken) {
        return res.status(401).json({ error: 'Access Denied / Session Invalid' });
    }

    // --- FITUR OPERASIONAL BACKEND UTAMA (BERDASARKAN METODE) ---
    if (req.method === 'POST') {
        const { name, content, scriptId, duration, maxDevices, customName, existingScriptId, action } = req.body;
        
        if (name && content) {
            if (existingScriptId && existingScriptId !== "") {
                await sql`UPDATE scripts SET name = ${name}, content = ${content} WHERE id = ${existingScriptId}`;
            } else {
                await sql`INSERT INTO scripts (id, name, content) VALUES (${'sc_' + Math.random().toString(36).substring(2, 9)}, ${name}, ${content})`;
            }
            return res.status(200).json({ success: true });
        }
        
        if (action === 'createKey') {
            let expiryDate = new Date();
            let finalKey = customName;
            if (duration === 'perm') {
                expiryDate = new Date('9999-12-31T23:59:59Z');
                if(!finalKey) finalKey = 'NX-PERM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            } else {
                expiryDate.setDate(expiryDate.getDate() + (parseInt(duration) || 1));
                if (!finalKey) finalKey = 'NX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            }
            const target = await sql`SELECT name FROM scripts WHERE id = ${scriptId}`;
            await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices) VALUES (${finalKey}, ${scriptId}, ${target[0]?.name || 'Unknown'}, ${expiryDate}, ${parseInt(maxDevices) || 1})`;
            return res.status(200).json({ key: finalKey });
        }
    }

    if (req.method === 'GET') {
        // --- REALTIME DATABASE STORAGE HEALTH SYSTEM ---
        if (type === 'dbhealth') {
            const countScripts = await sql`SELECT COUNT(*) as total FROM scripts`;
            const countKeys = await sql`SELECT COUNT(*) as total FROM keys`;
            const totalRows = (parseInt(countScripts[0].total) || 0) + (parseInt(countKeys[0].total) || 0);
            return res.status(200).json({ totalRows });
        }
        
        return res.status(200).json(type === 'keys' ? await sql`SELECT * FROM keys` : await sql`SELECT * FROM scripts`);
    }

    if (req.method === 'DELETE') {
        if (deleteKey) await sql`DELETE FROM keys WHERE key = ${deleteKey}`;
        if (id) await sql`DELETE FROM scripts WHERE id = ${id}`;
        return res.status(200).json({ success: true });
    }
}
