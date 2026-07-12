import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';

const sql = neon(process.env.POSTGRES_URL);
const RESEND_API_KEY = 're_bWxAizyb_4be1XPRBHdG2vTKbQ2b1G3Mh';

function hashPass(pw) { return createHash('sha256').update(pw + '_nx_postgres_salt').digest('hex'); }
function makeSession(email, hash) { return createHash('md5').update(email + hash + 'session_token').digest('hex'); }

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id, type, validate, device, deleteKey } = req.query;
    const host = req.headers.host;

    // ==========================================
    // ANONYMOUS ENDPOINTS (PUBLIC UNTUK GAME GUARDIAN)
    // ==========================================
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

    // ==========================================
    // AUTHENTICATION PROTOCOL (POST LOGIN/REGISTER)
    // ==========================================
    if (req.method === 'POST') {
        const { action, email, password, code } = req.body;
        
        // 1. Send OTP via Resend API
        if (action === 'sendOtp') {
            const secretCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            
            // Simpan data sementara ke tabel accounts dengan flag status belum terverifikasi
            await sql`INSERT INTO accounts (email, password, code) 
                     VALUES (${email}, ${hashPass(password)}, ${secretCode}) 
                     ON CONFLICT (email) DO UPDATE SET code = ${secretCode}, password = ${hashPass(password)}`;

            // Kirim email via Resend API
            const emailPayload = {
                from: "NEXUS X <onboarding@resend.dev>",
                to: [email],
                subject: "Nexus X Verification Code",
                html: `<!DOCTYPE html><html><body style="background:#000;color:#fff;padding:20px;"><h2 style="color:#00f5ff;">NEXUS X CODE</h2><p>Kode Registrasi: <b style="font-size:20px;color:#fff;">${secretCode}</b></p></body></html>`,
                text: `NEXUS X CODE. Kode Registrasi: ${secretCode}`
            };

            const resendReq = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(emailPayload)
            });

            if(resendReq.ok) {
                return res.status(200).json({ success: true });
            } else {
                return res.status(500).json({ error: 'Gagal mengirim email via Resend API' });
            }
        }

        // 2. Verify OTP untuk menyelesaikan registrasi
        if (action === 'verifyOtp') {
            const acc = await sql`SELECT * FROM accounts WHERE email = ${email} AND code = ${code}`;
            if(acc.length > 0) {
                // Aktifkan user dengan menghapus/mengosongkan field code tanda sudah terverifikasi
                await sql`UPDATE accounts SET code = 'VERIFIED' WHERE email = ${email}`;
                return res.status(200).json({ success: true });
            }
            return res.status(400).json({ error: 'Kode OTP Salah!' });
        }

        // 3. Login User
        if (action === 'login') {
            const acc = await sql`SELECT * FROM accounts WHERE email = ${email}`;
            if (acc.length > 0 && acc[0].password === hashPass(password)) {
                if (acc[0].code !== 'VERIFIED') {
                    return res.status(401).json({ error: 'Email belum diverifikasi via OTP!' });
                }
                return res.status(200).json({ session: makeSession(email, acc[0].password) });
            }
            return res.status(401).json({ error: 'Auth failed' });
        }
    }

    // ==========================================
    // SESSION SECURITY GUARD (ISOLASI DATA)
    // ==========================================
    const sessionToken = req.headers['x-session'];
    let authenticatedUser = null;
    if (sessionToken) {
        const accounts = await sql`SELECT * FROM accounts`;
        for (const acc of accounts) {
            if (makeSession(acc.email, acc.password) === sessionToken) { 
                authenticatedUser = acc.email; 
                break; 
            }
        }
    }

    if (!authenticatedUser) {
        return res.status(401).json({ error: 'Access Denied' });
    }

    // ==========================================
    // PROTECTED CRUD ENDPOINTS (DAPAT DIKONTROL OLEH USER LOGIN)
    // ==========================================
    if (req.method === 'POST') {
        const { name, content, scriptId, duration, maxDevices, customName, existingScriptId, action } = req.body;
        
        if (name && content) {
            if (existingScriptId && existingScriptId !== "") {
                // Pastikan yang update adalah pemilik script asli (owner check)
                await sql`UPDATE scripts SET name = ${name}, content = ${content} WHERE id = ${existingScriptId} AND owner = ${authenticatedUser}`;
            } else {
                // Insert script baru berserta field owner
                await sql`INSERT INTO scripts (id, name, content, owner) VALUES (${'sc_' + Math.random().toString(36).substring(2, 9)}, ${name}, ${content}, ${authenticatedUser})`;
            }
            return res.status(200).json({ success: true });
        }
        
        if (action === 'createKey') {
            let expiryDate = new Date();
            let finalKey = customName;
            if (duration === 'perm') {
                expiryDate = new Date('9999-12-31T23:59:59Z');
                finalKey = 'NX-PERM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            } else {
                expiryDate.setDate(expiryDate.getDate() + (parseInt(duration) || 1));
                if (!finalKey) finalKey = 'NX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            }
            
            // Cari data script target & pastikan script itu milik user yang sedang login
            const target = await sql`SELECT name FROM scripts WHERE id = ${scriptId} AND owner = ${authenticatedUser}`;
            if (target.length === 0) return res.status(403).json({ error: 'Unauthorized Script Owner' });

            await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices, owner) 
                     VALUES (${finalKey}, ${scriptId}, ${target[0].name, expiryDate}, ${parseInt(maxDevices) || 1}, ${authenticatedUser})`;
            return res.status(200).json({ key: finalKey });
        }
    }

    if (req.method === 'GET') {
        // FILTERISASI TOTAL: Hanya mengambil data miliknya sendiri berdasarkan Email Login (owner)
        if (type === 'keys') {
            const myKeys = await sql`SELECT * FROM keys WHERE owner = ${authenticatedUser}`;
            return res.status(200).json(myKeys);
        } else {
            const myScripts = await sql`SELECT * FROM scripts WHERE owner = ${authenticatedUser}`;
            return res.status(200).json(myScripts);
        }
    }

    if (req.method === 'DELETE') {
        // Pengamanan data saat proses penghapusan
        if (deleteKey) await sql`DELETE FROM keys WHERE key = ${deleteKey} AND owner = ${authenticatedUser}`;
        if (id) await sql`DELETE FROM scripts WHERE id = ${id} AND owner = ${authenticatedUser}`;
        return res.status(200).json({ success: true });
    }
}
