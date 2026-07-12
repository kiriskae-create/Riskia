import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';
import { Resend } from 'resend';

const sql = neon(process.env.POSTGRES_URL);
const resend = new Resend('re_4oSf2AhG_8LZpxypXR9NWadRSB3TaitN9');
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
        console.error('Migration:', e.message);
        migrated = true;
    }
}

async function sendVerificationEmail(email, code) {
    try {
        const result = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: email,
            subject: 'NEXUS X - Kode Verifikasi Akun',
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif">
<div style="max-width:440px;margin:20px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
<div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 24px;text-align:center">
<div style="color:#fff;font-weight:900;font-size:22px;letter-spacing:3px">NEXUS X</div>
<div style="color:rgba(255,255,255,0.7);font-size:10px;margin-top:6px;text-transform:uppercase;letter-spacing:2px">Cloud Verification Service</div>
</div>
<div style="padding:32px 24px;text-align:center">
<p style="color:#374151;font-size:14px;margin:0 0 8px">Masukkan kode ini untuk verifikasi:</p>
<div style="background:#f5f3ff;border:2px dashed #c4b5fd;border-radius:12px;padding:18px 12px;margin:16px 0">
<span style="font-size:38px;font-weight:900;letter-spacing:12px;color:#4f46e5;font-family:'Courier New',monospace">${code}</span>
</div>
<p style="color:#9ca3af;font-size:11px;margin:12px 0 0">Kode berlaku 10 menit. Jangan bagikan ke siapapun.</p>
</div>
<div style="background:#f9fafb;padding:16px 24px;border-top:1px solid #f3f4f6;text-align:center">
<p style="color:#d1d5db;font-size:9px;margin:0">Jika kamu tidak meminta ini, abaikan email ini.</p>
</div>
</div>
</body></html>`
        });
        console.log('Resend result:', JSON.stringify(result));
        if (result.error) {
            console.error('Resend API error:', result.error);
            return false;
        }
        return true;
    } catch (err) {
        console.error('Resend catch error:', err.message || err);
        return false;
    }
}

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

    /* ========== GAMEGUARDIAN PUBLIC ENDPOINTS ========== */

    if (req.method === 'GET' && type === 'loader') {
        const ownerSession = sessionParam || '';
        const user = await getSessionUser(ownerSession);
        if (!user || !user.isOwner) {
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send('gg.alert("[X] Unauthorized")');
        }
        const tid = id || 'default';
        const code = [
            'gg.setVisible(false)',
            'local r = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + tid + '&s=' + ownerSession + '")',
            'if r and r.code == 200 then',
            '    local fn = load(r.content)',
            '    if fn then fn() else gg.alert("Script Empty!") end',
            'else gg.alert("Connection Failed!") end'
        ].join('\n');
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(code);
    }

    if (req.method === 'GET' && type === 'menu' && id) {
        const ownerSession = sessionParam || '';
        const user = await getSessionUser(ownerSession);
        if (!user || !user.isOwner) {
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send('gg.alert("[X] Access Denied - Protected Content")');
        }
        const sc = await sql`SELECT content FROM scripts WHERE id = ${id} AND owner_email = ${OWNER_EMAIL}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : 'gg.alert("[X] Script Not Found!")');
    }

    if (req.method === 'GET' && type === 'login') {
        const tid = id || '';
        if (!validate) {
            const c = [
                'gg.setVisible(false)',
                'local key = gg.prompt({"Masukkan License Key:"},{""},{"text"})',
                'if not key then return end',
                'local hwid = ""',
                'local ok,dev = pcall(function() return gg.getDevice():getSerialNumber() end)',
                'if ok and dev then hwid=dev else hwid="NX-UNKNOWN" end',
                'local url="https://' + host + '/api/server?type=login&id=' + tid + '&validate="..tostring(key[1]).."&device="..hwid',
                'local r=gg.makeRequest(url)',
                'if r and r.code==200 then local fn=load(r.content) if fn then fn() end end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(c);
        }

        const checkKey = await sql`SELECT * FROM keys WHERE key = ${validate} AND owner_email = ${OWNER_EMAIL}`;
        if (checkKey.length === 0 || (tid !== '' && checkKey[0].script_id !== tid)) {
            const c = ['os.remove("/sdcard/.nexus_auth")','gg.alert("[X] License Key tidak valid!")','local r=gg.makeRequest("https://' + host + '/api/server?type=login&id=' + tid + '")','if r and r.code==200 then load(r.content)() end'].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(c);
        }

        const license = checkKey[0];
        const isPerm = license.expiry && license.expiry.startsWith('9999');
        if (!isPerm && new Date() > new Date(license.expiry)) {
            const c = ['os.remove("/sdcard/.nexus_auth")','gg.alert("[X] License EXPIRED!")','local r=gg.makeRequest("https://' + host + '/api/server?type=login&id=' + tid + '")','if r and r.code==200 then load(r.content)() end'].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(c);
        }

        const clientHwid = device || 'NX-UNKNOWN';
        let devs = license.registered_devices || [];
        if (device && !devs.includes(clientHwid)) {
            if (devs.length >= license.max_devices) {
                const c = ['os.remove("/sdcard/.nexus_auth")','gg.alert("[X] Slot device penuh! Max ' + license.max_devices + '")','local r=gg.makeRequest("https://' + host + '/api/server?type=login&id=' + tid + '")','if r and r.code==200 then load(r.content)() end'].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(c);
            }
            devs.push(clientHwid);
            await sql`UPDATE keys SET registered_devices = ${devs} WHERE key = ${validate}`;
        }

        const sc = await sql`SELECT content FROM scripts WHERE id = ${license.script_id} AND owner_email = ${OWNER_EMAIL}`;
        const payload = sc.length > 0 ? sc[0].content : 'gg.alert("[X] Payload not found!")';
        const lbl = isPerm ? "PERMANENT" : "until " + license.expiry;
        const c = [
            'local f=io.open("/sdcard/.nexus_auth","w")',
            'if f then f:write("' + validate + '");f:close() end',
            'gg.toast("ACCESS GRANTED | ' + lbl + '")',
            payload
        ].join('\n');
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(c);
    }

    /* ========== PUBLIC AUTH (tanpa session) ========== */

    const sessionToken = req.headers['x-session'];
    const authUser = await getSessionUser(sessionToken);

    if (req.method === 'POST' && !authUser) {
        const { action, email, password, code } = req.body;
        if (!action) return res.status(400).json({ error: 'No action' });

        if (action === 'register') {
            if (!email || !password) return res.status(400).json({ error: 'Email & password wajib diisi' });
            if (password.length < 4) return res.status(400).json({ error: 'Password min 4 karakter' });

            const existing = await sql`SELECT email, verified FROM accounts WHERE email = ${email}`;
            if (existing.length > 0 && existing[0].verified) {
                return res.status(400).json({ error: 'Email sudah terdaftar & terverifikasi' });
            }

            const vCode = genCode();
            const hashed = hashPass(password);

            if (existing.length > 0) {
                await sql`UPDATE accounts SET password = ${hashed}, verification_code = ${vCode}, verified = false WHERE email = ${email}`;
            } else {
                await sql`INSERT INTO accounts (email, password, verification_code, verified) VALUES (${email}, ${hashed}, ${vCode}, false)`;
            }

            const sent = await sendVerificationEmail(email, vCode);
            if (sent) {
                return res.status(200).json({ success: true, sent: true });
            } else {
                return res.status(200).json({ success: true, sent: false, code: vCode });
            }
        }

        if (action === 'verify') {
            if (!email || !code) return res.status(400).json({ error: 'Parameter kurang' });
            const acc = await sql`SELECT * FROM accounts WHERE email = ${email}`;
            if (acc.length === 0) return res.status(400).json({ error: 'Akun tidak ditemukan' });
            if (acc[0].verification_code !== code) return res.status(400).json({ error: 'Kode verifikasi salah!' });
            await sql`UPDATE accounts SET verified = true, verification_code = '' WHERE email = ${email}`;
            return res.status(200).json({ success: true });
        }

        if (action === 'resend') {
            if (!email) return res.status(400).json({ error: 'Email wajib' });
            const acc = await sql`SELECT * FROM accounts WHERE email = ${email}`;
            if (acc.length === 0) return res.status(400).json({ error: 'Akun tidak ditemukan' });
            if (acc[0].verified) return res.status(400).json({ error: 'Sudah terverifikasi' });

            const vCode = genCode();
            await sql`UPDATE accounts SET verification_code = ${vCode} WHERE email = ${email}`;
            const sent = await sendVerificationEmail(email, vCode);
            if (sent) {
                return res.status(200).json({ success: true, sent: true });
            } else {
                return res.status(200).json({ success: true, sent: false, code: vCode });
            }
        }

        if (action === 'login') {
            if (!email || !password) return res.status(400).json({ error: 'Email & password wajib' });
            const acc = await sql`SELECT * FROM accounts WHERE email = ${email}`;
            if (acc.length === 0) return res.status(401).json({ error: 'Akun tidak ditemukan' });
            if (acc[0].password !== hashPass(password)) return res.status(401).json({ error: 'Password salah' });
            if (!acc[0].verified) return res.status(401).json({ error: 'Akun belum diverifikasi! Cek email kamu.' });
            const isOwner = email.toLowerCase() === OWNER_EMAIL;
            return res.status(200).json({ session: makeSession(email, acc[0].password), owner: isOwner });
        }

        return res.status(401).json({ error: 'Access Denied' });
    }

    /* ========== OWNER-ONLY ENDPOINTS ========== */

    if (!authUser) return res.status(401).json({ error: 'Access Denied' });
    if (!authUser.isOwner) return res.status(403).json({ error: 'Owner only' });

    if (req.method === 'POST') {
        const { name, content, duration, maxDevices, customName, existingScriptId, action, scriptId } = req.body;

        if (name && content) {
            if (existingScriptId && existingScriptId !== '') {
                await sql`UPDATE scripts SET name = ${name}, content = ${content} WHERE id = ${existingScriptId} AND owner_email = ${OWNER_EMAIL}`;
            } else {
                const newId = 'sc_' + Math.random().toString(36).substring(2, 9);
                await sql`INSERT INTO scripts (id, name, content, owner_email) VALUES (${newId}, ${name}, ${content}, ${OWNER_EMAIL})`;
            }
            return res.status(200).json({ success: true });
        }

        if (action === 'createKey') {
            if (!scriptId) return res.status(400).json({ error: 'Script ID required' });
            let exp = new Date();
            let finalKey = (customName || '').trim();
            if (duration === 'perm') {
                exp = new Date('9999-12-31T23:59:59Z');
                if (!finalKey) finalKey = 'NX-PERM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            } else {
                exp.setDate(exp.getDate() + (parseInt(duration) || 1));
                if (!finalKey) finalKey = 'NX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            }
            const tgt = await sql`SELECT name FROM scripts WHERE id = ${scriptId} AND owner_email = ${OWNER_EMAIL}`;
            if (tgt.length === 0) return res.status(400).json({ error: 'Script not found' });
            await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices, owner_email) VALUES (${finalKey}, ${scriptId}, ${tgt[0].name}, ${exp}, ${parseInt(maxDevices) || 1}, ${OWNER_EMAIL})`;
            return res.status(200).json({ key: finalKey });
        }
        return res.status(400).json({ error: 'Invalid request' });
    }

    if (req.method === 'GET') {
        if (type === 'keys') return res.status(200).json(await sql`SELECT * FROM keys WHERE owner_email = ${OWNER_EMAIL}`);
        return res.status(200).json(await sql`SELECT * FROM scripts WHERE owner_email = ${OWNER_EMAIL}`);
    }

    if (req.method === 'DELETE') {
        if (deleteKey) await sql`DELETE FROM keys WHERE key = ${deleteKey} AND owner_email = ${OWNER_EMAIL}`;
        if (id) await sql`DELETE FROM scripts WHERE id = ${id} AND owner_email = ${OWNER_EMAIL}`;
        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
