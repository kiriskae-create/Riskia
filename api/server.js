import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';

const sql = neon(process.env.POSTGRES_URL);

/* ================================================================
   SECURITY: Hardcoded Admin + SQL Injection Protection
   ================================================================ */

const ADMIN_USER = 'riski';
const ADMIN_PASS = '2409';

function hashPass(pw) {
    return createHash('sha256').update(pw + '_nx_postgres_salt').digest('hex');
}

function makeSession(user, hash) {
    return createHash('md5').update(user + hash + 'session_token').digest('hex');
}

// Sanitasi input string — hapus control chars, batasi panjang
function sanitize(str, maxLen) {
    maxLen = maxLen || 500;
    if (typeof str !== 'string') return '';
    str = str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
    return str.trim().substring(0, maxLen);
}

// Sanitasi key name — hanya alphanumeric, dash, underscore
function sanitizeKey(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[^a-zA-Z0-9\-_]/g, '').toUpperCase().substring(0, 64);
}

// Deteksi pola SQL injection
function isCleanInput(str) {
    if (typeof str !== 'string' || str.length === 0 || str.length > 500) return false;
    const dangerous = [
        /(\bunion\b[\s\S]*\bselect\b)/gi,
        /(\binsert\b[\s\S]*\binto\b)/gi,
        /(\bdelete\b[\s\S]*\bfrom\b)/gi,
        /(\bdrop\b[\s\S]*\btable\b)/gi,
        /(\balter\b[\s\S]*\btable\b)/gi,
        /(\bexec\b[\s\S]*\()/gi,
        /(\bexecute\b[\s\S]*\()/gi,
        /(;\s*(drop|alter|delete|insert|update|create)\b)/gi,
        /(--|#|\/\*|\*\/)/g,
        /(char\s*\(|concat\s*\(|0x[0-9a-f]{6,})/gi
    ];
    return !dangerous.some(function(p) { return p.test(str); });
}

// Validasi format yang aman untuk username
function isValidUsername(str) {
    if (typeof str !== 'string') return false;
    return /^[a-zA-Z0-9_\-\.]{1,100}$/.test(str.trim());
}

/* ================================================================
   MAIN HANDLER
   ================================================================ */

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    if (req.method === 'OPTIONS') return res.status(200).end();

    var id = req.query.id || '';
    var type = req.query.type || '';
    var validate = req.query.validate || '';
    var device = req.query.device || '';
    var deleteKey = req.query.deleteKey || '';
    var host = req.headers.host || 'localhost';

    // Sanitasi query params
    id = sanitize(id, 50);
    type = sanitize(type, 20);
    validate = sanitize(validate, 100);
    device = sanitize(device, 200);
    deleteKey = sanitizeKey(deleteKey);

    /* ============================================================
       PUBLIC ENDPOINTS — Tidak perlu auth
       ============================================================ */

    // === LOADER: Return bootstrapper code (type=loader) ===
    if (req.method === 'GET' && type === 'loader') {
        var loaderCode = [
            'gg.setVisible(false)',
            'local V = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + id + '").content',
            'if V then pcall(load(V)) else gg.alert("Connection Failed!") end'
        ].join('\n');
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(loaderCode);
    }

    // === MENU: Return raw script content (type=menu) ===
    if (req.method === 'GET' && type === 'menu' && id) {
        var sc = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : 'gg.alert("[X] Script Not Found!")');
    }

    // === LOGIN: License key system (type=login) ===
    if (req.method === 'GET' && type === 'login') {

        // Tanpa validate → tampilkan prompt input key
        if (!validate) {
            var promptCode = [
                'local key = gg.prompt({"[NEXUS] Enter License Key:"}, {""}, {"text"})',
                'if not key then return end',
                'local d = gg.getFile() or "NX-UNKNOWN"',
                'local V = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + id + '&validate=" .. key .. "&device=" .. d).content',
                'if V then pcall(load(V)) end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(promptCode);
        }

        // Dengan validate → cek key di database
        var cleanKey = sanitizeKey(validate);
        var cleanDevice = sanitize(device, 200);

        var checkKey = await sql`SELECT * FROM keys WHERE key = ${cleanKey}`;

        // Key tidak ditemukan atau salah target
        if (checkKey.length === 0 || (id !== '' && checkKey[0].script_id !== id)) {
            var errInvalid = [
                'os.remove("/sdcard/.nexus_auth")',
                'gg.alert("Invalid License Key!")',
                'local V = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + id + '").content',
                'if V then pcall(load(V)) end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(errInvalid);
        }

        var license = checkKey[0];
        var isPerm = license.expiry && license.expiry.startsWith('9999');

        // Cek expiry
        if (!isPerm && new Date() > new Date(license.expiry)) {
            var errExpired = [
                'os.remove("/sdcard/.nexus_auth")',
                'gg.alert("License Key EXPIRED!")',
                'local V = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + id + '").content',
                'if V then pcall(load(V)) end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(errExpired);
        }

        // Cek device slot
        var devices = license.registered_devices || [];
        if (cleanDevice && cleanDevice !== 'NX-UNKNOWN' && devices.indexOf(cleanDevice) === -1) {
            if (devices.length >= license.max_devices) {
                var errDevice = [
                    'os.remove("/sdcard/.nexus_auth")',
                    'gg.alert("Max Device Limit Reached! (" + ' + devices.length + ' / ' + license.max_devices + ')")',
                    'local V = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + id + '").content',
                    'if V then pcall(load(V)) end'
                ].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(errDevice);
            }
            devices.push(cleanDevice);
            await sql`UPDATE keys SET registered_devices = ${devices} WHERE key = ${cleanKey}`;
        }

        // SUKSES — grant access
        var accessLabel = isPerm ? 'PERMANENT ACCESS' : 'Valid Until ' + String(license.expiry).split('T')[0];
        var successCode = [
            'local f = io.open("/sdcard/.nexus_auth", "w")',
            'if f then f:write("' + cleanKey + '"); f:close() end',
            'gg.toast("ACCESS GRANTED | ' + accessLabel + '")',
            'local V = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + license.script_id + '").content',
            'if V then pcall(load(V)) else gg.alert("Failed to load script!") end'
        ].join('\n');
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(successCode);
    }

    /* ============================================================
       SESSION AUTH CHECK
       ============================================================ */

    var sessionToken = req.headers['x-session'] || '';
    var authUser = null;

    // Cek admin hardcoded (tanpa query DB — instant)
    if (sessionToken === makeSession(ADMIN_USER, hashPass(ADMIN_PASS))) {
        authUser = ADMIN_USER;
    }

    // Cek session dari database accounts
    if (!authUser && sessionToken) {
        try {
            var accounts = await sql`SELECT email, password FROM accounts`;
            for (var i = 0; i < accounts.length; i++) {
                if (makeSession(accounts[i].email, accounts[i].password) === sessionToken) {
                    authUser = accounts[i].email;
                    break;
                }
            }
        } catch (e) { /* table might not exist yet */ }
    }

    /* ============================================================
       UNAUTHENTICATED — hanya boleh login
       ============================================================ */

    if (!authUser) {
        if (req.method === 'POST') {
            var body = req.body || {};
            var action = sanitize(body.action || '', 20);
            var username = sanitize(body.username || body.email || '', 100);
            var password = sanitize(body.password || '', 100);

            if (action === 'login') {
                // SQL injection detection
                if (!isCleanInput(username) || !isCleanInput(password)) {
                    return res.status(400).json({ error: 'Malformed input detected' });
                }

                // Cek hardcoded admin
                if (username === ADMIN_USER && password === ADMIN_PASS) {
                    return res.status(200).json({
                        session: makeSession(username, hashPass(password))
                    });
                }

                // Cek database accounts
                try {
                    var acc = await sql`SELECT * FROM accounts WHERE email = ${username}`;
                    if (acc.length > 0 && acc[0].password === hashPass(password)) {
                        return res.status(200).json({
                            session: makeSession(username, acc[0].password)
                        });
                    }
                } catch (e) { /* table might not exist */ }

                return res.status(401).json({ error: 'Authentication failed' });
            }

            if (action === 'register') {
                var regEmail = sanitize(body.email || '', 100);
                var regPass = sanitize(body.password || '', 100);

                if (!isCleanInput(regEmail) || !isCleanInput(regPass)) {
                    return res.status(400).json({ error: 'Malformed input detected' });
                }

                var secretCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                try {
                    await sql`INSERT INTO accounts (email, password, code) VALUES (${regEmail}, ${hashPass(regPass)}, ${secretCode}) ON CONFLICT (email) DO NOTHING`;
                } catch (e) { /* table might not exist */ }
                return res.status(200).json({ success: true, code: secretCode });
            }
        }
        return res.status(401).json({ error: 'Access Denied' });
    }

    /* ============================================================
       AUTHENTICATED OPERATIONS
       ============================================================ */

    if (req.method === 'POST') {
        var body = req.body || {};
        var name = sanitize(body.name || '', 200);
        var content = body.content || '';
        var existingScriptId = sanitize(body.existingScriptId || '', 50);
        var postAction = sanitize(body.action || '', 20);
        var scriptId = sanitize(body.scriptId || '', 50);
        var maxDevices = parseInt(body.maxDevices) || 1;
        var duration = sanitize(body.duration || '', 20);
        var customName = body.customName || '';

        // Clamp maxDevices
        maxDevices = Math.min(Math.max(maxDevices, 1), 100);

        // Save/Update script
        if (name && content) {
            if (existingScriptId && existingScriptId !== '') {
                await sql`UPDATE scripts SET name = ${name}, content = ${content} WHERE id = ${existingScriptId}`;
            } else {
                var newId = 'sc_' + Math.random().toString(36).substring(2, 9);
                await sql`INSERT INTO scripts (id, name, content) VALUES (${newId}, ${name}, ${content})`;
            }
            return res.status(200).json({ success: true });
        }

        // Generate license key
        if (postAction === 'createKey' && scriptId) {
            var expiryDate;
            var finalKey = '';

            if (duration === 'perm') {
                expiryDate = new Date('9999-12-31T23:59:59Z');
                finalKey = 'NX-PERM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            } else {
                expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + (parseInt(duration) || 1));
                if (customName && typeof customName === 'string' && customName.trim()) {
                    finalKey = sanitizeKey(customName);
                }
                if (!finalKey) {
                    finalKey = 'NX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
                }
            }

            var target = await sql`SELECT name FROM scripts WHERE id = ${scriptId}`;
            var targetName = (target.length > 0) ? target[0].name : 'Unknown';

            try {
                await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices, registered_devices) VALUES (${finalKey}, ${scriptId}, ${targetName}, ${expiryDate.toISOString()}, ${maxDevices}, ${[]})`;
            } catch (e) {
                // Duplicate key — generate baru
                finalKey = 'NX-' + Math.random().toString(36).substring(2, 10).toUpperCase();
                await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices, registered_devices) VALUES (${finalKey}, ${scriptId}, ${targetName}, ${expiryDate.toISOString()}, ${maxDevices}, ${[]})`;
            }

            return res.status(200).json({ key: finalKey });
        }
    }

    // GET: list scripts or keys
    if (req.method === 'GET') {
        if (type === 'keys') {
            var keys = await sql`SELECT * FROM keys ORDER BY created_at DESC NULLS LAST`;
            return res.status(200).json(keys);
        }
        var scripts = await sql`SELECT * FROM scripts ORDER BY id`;
        return res.status(200).json(scripts);
    }

    // DELETE: hapus script atau key
    if (req.method === 'DELETE') {
        if (deleteKey) {
            await sql`DELETE FROM keys WHERE key = ${deleteKey}`;
        }
        if (id) {
            await sql`DELETE FROM keys WHERE script_id = ${id}`;
            await sql`DELETE FROM scripts WHERE id = ${id}`;
        }
        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
