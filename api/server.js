import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';
import { Resend } from 'resend';

const sql = neon(process.env.POSTGRES_URL);
const resend = new Resend(process.env.RESEND_API_KEY || 're_4oSf2AhG_8LZpxypXR9NWadRSB3TaitN9');
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'kiriskae@gmail.com').toLowerCase();

function hashPass(pw) {
    return createHash('sha256').update(pw + '_nx_postgres_salt').digest('hex');
}
function makeSession(email, hash) {
    return createHash('md5').update(email + hash + 'session_token').digest('hex');
}
function genCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/* ===== AUTO MIGRATION ===== */
let migrated = false;
async function ensureMigrations() {
    if (migrated) return;
    try {
        await sql`ALTER TABLE scripts ADD COLUMN IF NOT EXISTS owner_email TEXT DEFAULT ''`;
        await sql`ALTER TABLE keys ADD COLUMN IF NOT EXISTS owner_email TEXT DEFAULT ''`;
        await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS verification_code TEXT DEFAULT ''`;
        await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false`;
        await sql`UPDATE scripts SET owner_email = ${OWNER_EMAIL} WHERE owner_email = '' OR owner_email IS NULL`;
        await sql`UPDATE keys SET owner_email = ${OWNER_EMAIL} WHERE owner_email = '' OR owner_email IS NULL`;
        migrated = true;
    } catch (e) {
        console.error('Migration error:', e);
        migrated = true;
    }
}

/* ===== SEND VERIFICATION EMAIL ===== */
async function sendVerificationEmail(email, code) {
    try {
        await resend.emails.send({
            from: 'NEXUS X <onboarding@resend.dev>',
            to: email,
            subject: 'NEXUS X - Kode Verifikasi Akun',
            html: `<div style="font-family:'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:16px">
                <div style="text-align:center;margin-bottom:24px">
                    <div style="display:inline-block;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;font-weight:900;font-size:20px;padding:10px 20px;border-radius:12px;letter-spacing:2px">NEXUS X</div>
                    <p style="color:#94a3b8;font-size:11px;margin-top:8px;text-transform:uppercase;letter-spacing:1px">Cloud Service Verification</p>
                </div>
                <div style="background:#fff;border-radius:12px;padding:28px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
                    <p style="color:#334155;font-size:13px;margin:0 0 16px">Kode verifikasi akun kamu:</p>
                    <div style="font-size:36px;font-weight:900;letter-spacing:10px;color:#4f46e5;font-family:'Courier New',monospace;background:#eef2ff;padding:16px;border-radius:12px;border:2px dashed #c7d2fe">${code}</div>
                    <p style="color:#94a3b8;font-size:10px;margin-top:16px">Berlaku selama 10 menit. Jangan bagikan kode ini.</p>
                </div>
                <p style="color:#cbd5e1;font-size:9px;text-align:center;margin-top:20px">Jika kamu tidak meminta ini, abaikan email ini.</p>
            </div>`
        });
        return true;
    } catch (err) {
        console.error('Resend error:', err);
        return false;
    }
}

/* ===== AUTHENTICATE SESSION ===== */
async function getSessionUser(sessionToken) {
    if (!sessionToken) return null;
    const accounts = await sql`SELECT * FROM accounts`;
    for (const acc of accounts) {
        if (makeSession(acc.email, acc.password) === sessionToken) {
            return { email: acc.email, isOwner: acc.email.toLowerCase() === OWNER_EMAIL };
        }
    }
    return null;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    if (req.method === 'OPTIONS') return res.status(200).end();

    await ensureMigrations();

    const { id, type, validate, device, deleteKey, s: sessionParam } = req.query;
    const host = req.headers.host;

    /* ============================================================
       ENDPOINT UNTUK GAMEGUARDIAN (PUBLIC - TANPA SESSION)
       ============================================================ */

    // LOADER: Raw hook yang butuh session owner
    if (req.method === 'GET' && type === 'loader') {
        const ownerSession = sessionParam || '';
        const user = await getSessionUser(ownerSession);
        if (!user || !user.isOwner) {
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send('gg.alert("[X] Unauthorized - Owner session required for raw access")');
        }
        const targetScriptId = id || 'default';
        const code = [
            'gg.setVisible(false)',
            'local r = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + targetScriptId + '&s=' + ownerSession + '")',
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

    // MENU: Hanya bisa diakses dengan owner session
    if (req.method === 'GET' && type === 'menu' && id) {
        const ownerSession = sessionParam || '';
        const user = await getSessionUser(ownerSession);
        if (!user || !user.isOwner) {
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send('gg.alert("[X] Access Denied - Script content is protected")');
        }
        const sc = await sql`SELECT content FROM scripts WHERE id = ${id} AND owner_email = ${OWNER_EMAIL}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : 'gg.alert("[X] Script Not Found!")');
    }

    // LOGIN: Endpoint untuk license key system
    if (req.method === 'GET' && type === 'login') {
        const targetScriptId = id || '';

        // Jika tidak ada parameter validate, kembalikan form input key
        if (!validate) {
            const c = [
                'gg.setVisible(false)',
                'local key = gg.prompt({"Masukkan License Key:"}, {""}, {"text"})',
                'if not key then return end',
                'local hwid = ""',
                'local ok, dev = pcall(function() return gg.getDevice():getSerialNumber() end)',
                'if ok and dev then hwid = dev else hwid = "NX-UNKNOWN" end',
                'local url = "https://' + host + '/api/server?type=login&id=' + targetScriptId + '&validate=" .. tostring(key[1]) .. "&device=" .. hwid',
                'local r = gg.makeRequest(url)',
                'if r and r.code == 200 then',
                '    local fn = load(r.content)',
                '    if fn then fn() end',
                'end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(c);
        }

        // Validasi license key
        const checkKey = await sql`SELECT * FROM keys WHERE key = ${validate} AND owner_email = ${OWNER_EMAIL}`;
        if (checkKey.length === 0) {
            const c = [
                'os.remove("/sdcard/.nexus_auth")',
                'gg.alert("[X] License Key tidak valid untuk modul ini!")',
                'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                'if r and r.code == 200 then load(r.content)() end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(c);
        }

        if (targetScriptId !== '' && checkKey[0].script_id !== targetScriptId) {
            const c = [
                'os.remove("/sdcard/.nexus_auth")',
                'gg.alert("[X] Key tidak cocok dengan modul ini!")',
                'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                'if r and r.code == 200 then load(r.content)() end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(c);
        }

        const license = checkKey[0];
        const isPermanent = license.expiry && license.expiry.startsWith('9999');

        if (!isPermanent && new Date() > new Date(license.expiry)) {
            const c = [
                'os.remove("/sdcard/.nexus_auth")',
                'gg.alert("[X] License Key sudah EXPIRED!")',
                'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                'if r and r.code == 200 then load(r.content)() end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(c);
        }

        const clientHwid = device || 'NX-UNKNOWN';
        let registeredDevices = license.registered_devices || [];
        if (device && !registeredDevices.includes(clientHwid)) {
            if (registeredDevices.length >= license.max_devices) {
                const c = [
                    'os.remove("/sdcard/.nexus_auth")',
                    'gg.alert("[X] Slot device sudah penuh! Maksimal " .. ' + license.max_devices + ' .. " device.")',
                    'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                    'if r and r.code == 200 then load(r.content)() end'
                ].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(c);
            }
            registeredDevices.push(clientHwid);
            await sql`UPDATE keys SET registered_devices = ${registeredDevices} WHERE key = ${validate}`;
        }

        // AMAN: Kembalikan script content langsung di response ini
        // Tidak perlu endpoint terpisah yang bisa diakses langsung
        const sc = await sql`SELECT content FROM scripts WHERE id = ${license.script_id} AND owner_email = ${OWNER_EMAIL}`;
        const scriptContent = sc.length > 0 ? sc[0].content : 'gg.alert("[X] Script payload not found!")';
        const labelExp = isPermanent ? "PERMANENT ACCESS" : "Valid until " + license.expiry;

        const c = [
            'local f = io.open("/sdcard/.nexus_auth", "w")',
            'if f then f:write("' + validate + '"); f:close() end',
            'gg.toast("ACCESS GRANTED | ' + labelExp + '")',
            '-- NEXUS PROTECTED PAYLOAD START',
            scriptContent,
            '-- NEXUS PROTECTED PAYLOAD END'
        ].join('\n');
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(c);
    }

    /* ============================================================
       ENDPOINT YANG BUTUH AUTENTIKASI SESSION
       ============================================================ */

    const sessionToken = req.headers['x-session'];
    const authUser = await getSessionUser(sessionToken);

    // PUBLIC AUTH ENDPOINTS (register, verify, resend, login)
    if (req.method === 'POST' && !authUser) {
        const { action, email, password, code } = req.body;
        if (!action) return res.status(400).json({ error: 'No action specified' });

        // REGISTER: Buat akun + kirim kode verifikasi via email
        if (action === 'register') {
            if (!email || !password) return res.status(400).json({ error: 'Email & password required' });
            const existing = await sql`SELECT email FROM accounts WHERE email = ${email}`;
            if (existing.length > 0 && existing[0].verified) {
                return res.status(400).json({ error: 'Email sudah terdaftar dan terverifikasi' });
            }
            const vCode = genCode();
            const hashed = hashPass(password);
            // Upsert: update jika belum verified, insert jika baru
            if (existing.length > 0) {
                await sql`UPDATE accounts SET password = ${hashed}, verification_code = ${vCode}, verified = false WHERE email = ${email}`;
            } else {
                await sql`INSERT INTO accounts (email, password, verification_code, verified) VALUES (${email}, ${hashed}, ${vCode}, false)`;
            }
            const sent = await sendVerificationEmail(email, vCode);
            if (sent) {
                return res.status(200).json({ success: true });
            } else {
                // Fallback: kembalikan kode langsung jika Resend gagal
                return res.status(200).json({ success: true, fallback: true, code: vCode });
            }
        }

        // VERIFY: Validasi kode verifikasi
        if (action === 'verify') {
            if (!email || !code) return res.status(400).json({ error: 'Missing params' });
            const acc = await sql`SELECT * FROM accounts WHERE email = ${email}`;
            if (acc.length === 0) return res.status(400).json({ error: 'Akun tidak ditemukan' });
            if (acc[0].verification_code !== code) return res.status(400).json({ error: 'Kode salah' });
            await sql`UPDATE accounts SET verified = true, verification_code = '' WHERE email = ${email}`;
            return res.status(200).json({ success: true });
        }

        // RESEND: Kirim ulang kode verifikasi
        if (action === 'resend') {
            if (!email || !password) return res.status(400).json({ error: 'Missing params' });
            const acc = await sql`SELECT * FROM accounts WHERE email = ${email}`;
            if (acc.length === 0) return res.status(400).json({ error: 'Akun tidak ditemukan' });
            if (acc[0].verified) return res.status(400).json({ error: 'Akun sudah terverifikasi' });
            const vCode = genCode();
            await sql`UPDATE accounts SET verification_code = ${vCode} WHERE email = ${email}`;
            const sent = await sendVerificationEmail(email, vCode);
            if (sent) {
                return res.status(200).json({ success: true });
            } else {
                return res.status(200).json({ success: true, fallback: true, code: vCode });
            }
        }

        // LOGIN
        if (action === 'login') {
            if (!email || !password) return res.status(400).json({ error: 'Missing params' });
            const acc = await sql`SELECT * FROM accounts WHERE email = ${email}`;
            if (acc.length === 0) return res.status(401).json({ error: 'Akun tidak ditemukan' });
            if (acc[0].password !== hashPass(password)) return res.status(401).json({ error: 'Password salah' });
            if (!acc[0].verified) return res.status(401).json({ error: 'Akun belum diverifikasi. Cek email kamu.' });
            const isOwner = email.toLowerCase() === OWNER_EMAIL;
            return res.status(200).json({
                session: makeSession(email, acc[0].password),
                owner: isOwner
            });
        }

        return res.status(401).json({ error: 'Access Denied' });
    }

    // Semua endpoint selanjutnya butuh session + harus owner
    if (!authUser) return res.status(401).json({ error: 'Access Denied' });
    if (!authUser.isOwner) return res.status(403).json({ error: 'Not authorized - owner only' });

    /* ============================================================
       OWNER-ONLY ENDPOINTS
       ============================================================ */

    if (req.method === 'POST') {
        const { name, content, scriptId, duration, maxDevices, customName, existingScriptId, action } = req.body;

        // CREATE / UPDATE SCRIPT
        if (name && content) {
            if (existingScriptId && existingScriptId !== '') {
                await sql`UPDATE scripts SET name = ${name}, content = ${content} WHERE id = ${existingScriptId} AND owner_email = ${OWNER_EMAIL}`;
            } else {
                const newId = 'sc_' + Math.random().toString(36).substring(2, 9);
                await sql`INSERT INTO scripts (id, name, content, owner_email) VALUES (${newId}, ${name}, ${content}, ${OWNER_EMAIL})`;
            }
            return res.status(200).json({ success: true });
        }

        // CREATE LICENSE KEY
        if (action === 'createKey') {
            if (!scriptId) return res.status(400).json({ error: 'Script ID required' });
            let expiryDate = new Date();
            let finalKey = customName ? customName.trim() : '';
            if (duration === 'perm') {
                expiryDate = new Date('9999-12-31T23:59:59Z');
                if (!finalKey) finalKey = 'NX-PERM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            } else {
                expiryDate.setDate(expiryDate.getDate() + (parseInt(duration) || 1));
                if (!finalKey) finalKey = 'NX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            }
            const target = await sql`SELECT name FROM scripts WHERE id = ${scriptId} AND owner_email = ${OWNER_EMAIL}`;
            if (target.length === 0) return res.status(400).json({ error: 'Script not found' });
            await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices, owner_email) VALUES (${finalKey}, ${scriptId}, ${target[0].name}, ${expiryDate}, ${parseInt(maxDevices) || 1}, ${OWNER_EMAIL})`;
            return res.status(200).json({ key: finalKey });
        }

        return res.status(400).json({ error: 'Invalid request' });
    }

    if (req.method === 'GET') {
        if (type === 'keys') {
            return res.status(200).json(await sql`SELECT * FROM keys WHERE owner_email = ${OWNER_EMAIL}`);
        }
        return res.status(200).json(await sql`SELECT * FROM scripts WHERE owner_email = ${OWNER_EMAIL}`);
    }

    if (req.method === 'DELETE') {
        if (deleteKey) {
            await sql`DELETE FROM keys WHERE key = ${deleteKey} AND owner_email = ${OWNER_EMAIL}`;
        }
        if (id) {
            await sql`DELETE FROM scripts WHERE id = ${id} AND owner_email = ${OWNER_EMAIL}`;
        }
        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
