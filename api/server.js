import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';
import { Resend } from 'resend';

const sql = neon(process.env.POSTGRES_URL);
const resend = new Resend('re_4oSf2AhG_8LZpxypXR9NWadRSB3TaitN9');

function hashPass(pw) { return createHash('sha256').update(pw + '_nx_postgres_salt').digest('hex'); }
function makeSession(email, hash) { return createHash('md5').update(email + hash + 'session_token').digest('hex'); }

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id, type, validate, device, deleteKey } = req.query;
    const host = req.headers.host;

    // RAW SCRIPT DISPATCH (PUBLIC ENDPOINT CALL FROM CLIENT GAME)
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

    // LICENSE PROTECTION LOOP
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

    // AUTH LAYER & SESSION TOKEN PARSING
    const sessionToken = req.headers['x-session'];
    let authenticatedUser = null;
    let isAdmin = false;

    if (sessionToken) {
        const accounts = await sql`SELECT * FROM accounts`;
        for (const acc of accounts) {
            if (makeSession(acc.email, acc.password) === sessionToken) { 
                authenticatedUser = acc.email; 
                if (acc.email === 'kiriskae@gmail.com' || acc.email.includes('nexus')) {
                    isAdmin = true;
                }
                break; 
            }
        }
    }

    // NON-AUTHENTICATED ROUTER ACTIONS
    if (!authenticatedUser) {
        if (req.method === 'POST') {
            const { action, email, password, code } = req.body;
            
            if (action === 'register') {
                const secretCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                
                // Save temp user state with unverified status flag
                await sql`INSERT INTO accounts (email, password, code, verified) VALUES (${email}, ${hashPass(password)}, ${secretCode}, false) ON CONFLICT (email) DO UPDATE SET code = ${secretCode}`;
                
                try {
                    await resend.emails.send({
                        from: 'onboarding@resend.dev',
                        to: 'kiriskae@gmail.com', // Log copy destination
                        subject: 'NEXUS Security Authentication Token',
                        html: `<p>User <strong>${email}</strong> requested token registration.</p><p>Security Activation Token Code: <strong>${secretCode}</strong></p>`
                    });
                } catch(e) {
                    console.error("Resend delivery failure:", e);
                }

                return res.status(200).json({ success: true });
            }

            if (action === 'verifyToken') {
                const match = await sql`SELECT * FROM accounts WHERE email = ${email} AND code = ${code}`;
                if (match.length > 0) {
                    await sql`UPDATE accounts SET verified = true WHERE email = ${email}`;
                    return res.status(200).json({ success: true });
                }
                return res.status(400).json({ error: 'Invalid authentication tokens' });
            }

            if (action === 'login') {
                // HARDCODED ADMIN BACKDOOR PROTECTION BY-PASS
                if (email === 'kiriskae@gmail.com' && password === '2409') {
                    const admPassHash = hashPass('2409');
                    await sql`INSERT INTO accounts (email, password, verified) VALUES (${email}, ${admPassHash}, true) ON CONFLICT (email) DO UPDATE SET password=${admPassHash}`;
                    return res.status(200).json({ session: makeSession(email, admPassHash) });
                }

                const acc = await sql`SELECT * FROM accounts WHERE email = ${email}`;
                if (acc.length > 0 && acc[0].password === hashPass(password)) {
                    return res.status(200).json({ session: makeSession(email, acc[0].password) });
                }
                return res.status(401).json({ error: 'Auth failed' });
            }
        }
        return res.status(401).json({ error: 'Access Denied' });
    }

    // ==========================================
    // MULTI-TENANT ISOLATED BACKEND DATABASE PROCESS
    // ==========================================
    if (req.method === 'POST') {
        const { name, content, scriptId, duration, maxDevices, customName, existingScriptId, action } = req.body;
        
        if (name && content) {
            if (existingScriptId && existingScriptId !== "") {
                // Verifikasi kepemilikan sebelum update
                if (isAdmin) {
                    await sql`UPDATE scripts SET name = ${name}, content = ${content} WHERE id = ${existingScriptId}`;
                } else {
                    await sql`UPDATE scripts SET name = ${name}, content = ${content} WHERE id = ${existingScriptId} AND owner = ${authenticatedUser}`;
                }
            } else {
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
            
            const target = await sql`SELECT name FROM scripts WHERE id = ${scriptId}`;
            await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices, owner) VALUES (${finalKey}, ${scriptId}, ${target[0]?.name || 'Unknown'}, ${expiryDate}, ${parseInt(maxDevices) || 1}, ${authenticatedUser})`;
            return res.status(200).json({ key: finalKey });
        }
    }

    if (req.method === 'GET') {
        if (type === 'keys') {
            // Admin melihat semua key, user biasa hanya melihat miliknya sendiri
            const keyResult = isAdmin ? await sql`SELECT * FROM keys` : await sql`SELECT * FROM keys WHERE owner = ${authenticatedUser}`;
            return res.status(200).json(keyResult);
        } else {
            // Admin melihat semua skrip, user biasa hanya melihat miliknya sendiri
            const scrResult = isAdmin ? await sql`SELECT * FROM scripts` : await sql`SELECT * FROM scripts WHERE owner = ${authenticatedUser}`;
            return res.status(200).json(scrResult);
        }
    }

    if (req.method === 'DELETE') {
        if (deleteKey) {
            if (isAdmin) await sql`DELETE FROM keys WHERE key = ${deleteKey}`;
            else await sql`DELETE FROM keys WHERE key = ${deleteKey} AND owner = ${authenticatedUser}`;
        }
        if (id) {
            if (isAdmin) await sql`DELETE FROM scripts WHERE id = ${id}`;
            else await sql`DELETE FROM scripts WHERE id = ${id} AND owner = ${authenticatedUser}`;
        }
        return res.status(200).json({ success: true });
    }
}
