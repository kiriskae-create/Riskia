import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';

// Inisialisasi Database Serverless Client Neon
const sql = neon(process.env.POSTGRES_URL);

function hashPass(pw) {
    return createHash('sha256').update(pw + '_nx_postgres_salt').digest('hex');
}

function makeSession(email, hash) {
    return createHash('md5').update(email + hash + 'session_token').digest('hex');
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id, type, authKey, device, reqStage, loader, deleteKey } = req.query;

    // 1. ANONYMOUS SYSTEM: LOADER SCRIPT UNTUK GAME GUARDIAN
    if (loader === '1') {
        const payload = `
        gg.setVisible(false)
        local inp = gg.prompt({"Masukkan Key Nexus X:"},{"","text"})
        if not inp then return end
        local r = gg.makeRequest("${'https://' + req.headers.host}/api/server?authKey="..inp[1].."&device=termux_hwid&reqStage=1")
        if r and r.code == 200 then load(r.content)() else gg.alert("Auth Error!") end`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(payload);
    }

    // 2. CLIENT VALIDATION (GAME GUARDIAN DIRECT RUNTIME EXECUTION)
    if (authKey) {
        const keys = await sql`SELECT * FROM keys WHERE key = ${authKey}`;
        if (keys.length === 0) return res.status(200).send('gg.alert("Key Tidak Valid!")');

        const license = keys[0];
        if (new Date() > new Date(license.expiry)) return res.status(200).send('gg.alert("Key Kadaluwarsa!")');

        if (!reqStage || reqStage === '1') {
            const nextUrl = `https://${req.headers.host}/api/server?authKey=${authKey}&reqStage=2`;
            return res.status(200).send(`local r=gg.makeRequest("${nextUrl}") if r.code==200 then load(r.content)() end`);
        }

        if (reqStage === '2') {
            const scripts = await sql`SELECT content FROM scripts WHERE id = ${license.script_id}`;
            return res.status(200).send(scripts.length > 0 ? scripts[0].content : 'gg.alert("Script Hilang!")');
        }
    }

    // 3. SECURE MIDDLEWARE: SESSION VALIDATION VIA POSTGRES ACCOUNTS TABLE
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

    // 4. ROUTING LOGIC & CORE CONTROLLERS
    if (req.method === 'POST') {
        const { action, email, password, name, content, scriptId, expiry, customName } = req.body;

        if (action === 'register') {
            const secretCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const encryptedPassword = hashPass(password);
            await sql`INSERT INTO accounts (email, password, code) VALUES (${email}, ${encryptedPassword}, ${secretCode}) ON CONFLICT (email) DO NOTHING`;
            return res.status(200).json({ success: true, code: secretCode });
        }

        if (action === 'login') {
            const account = await sql`SELECT * FROM accounts WHERE email = ${email}`;
            if (account.length > 0 && account[0].password === hashPass(password)) {
                return res.status(200).json({ session: makeSession(email, account[0].password) });
            }
            return res.status(401).json({ error: 'Sandi Salah' });
        }

        if (!authenticatedUser) return res.status(401).json({ error: 'Expired session' });

        // UPLOAD ATAU INSERT SCRIPT BARU
        if (name && content) {
            const generatedId = 'sc_' + Math.random().toString(36).substring(2, 9);
            await sql`INSERT INTO scripts (id, name, content) VALUES (${generatedId}, ${name}, ${content})`;
            return res.status(200).json({ success: true });
        }

        // BUAT LISENSI SCRIPT / GENERATE KEY
        if (action === 'createKey') {
            const finalKey = customName || 'KEY-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            const targetScript = await sql`SELECT name FROM scripts WHERE id = ${scriptId}`;
            const scriptName = targetScript.length > 0 ? targetScript[0].name : 'Unknown Script';
            
            await sql`INSERT INTO keys (key, script_id, target_script_name, expiry) VALUES (${finalKey}, ${scriptId}, ${scriptName}, ${new Date(expiry)})`;
            return res.status(200).json({ key: finalKey });
        }
    }

    if (req.method === 'GET') {
        if (!authenticatedUser) return res.status(401).json({ error: 'Access denied' });
        if (type === 'keys') {
            const allKeys = await sql`SELECT * FROM keys`;
            return res.status(200).json(allKeys);
        }
        const allScripts = await sql`SELECT * FROM scripts`;
        return res.status(200).json(allScripts);
    }

    if (req.method === 'DELETE') {
        if (!authenticatedUser) return res.status(401).json({ error: 'Access denied' });
        if (deleteKey) {
            await sql`DELETE FROM keys WHERE key = ${deleteKey}`;
            return res.status(200).json({ success: true });
        }
        if (id) {
            await sql`DELETE FROM scripts WHERE id = ${id}`;
            return res.status(200).json({ success: true });
        }
    }

    return res.status(405).end();
}
