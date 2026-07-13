import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';

const sql = neon(process.env.POSTGRES_URL);

const ADMIN_USER = 'riski';
const ADMIN_PASS = '2409';

function hashPass(pw) { return createHash('sha256').update(pw + '_nx_postgres_salt').digest('hex'); }
function makeSession(user, hash) { return createHash('md5').update(user + hash + 'session_token').digest('hex'); }

function sanitize(str, max) {
    max = max || 500;
    if (typeof str !== 'string') return '';
    return str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().substring(0, max);
}

function sanitizeKey(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[^a-zA-Z0-9\-_]/g, '').toUpperCase().substring(0, 64);
}

function isCleanInput(str) {
    if (typeof str !== 'string' || str.length === 0 || str.length > 500) return false;
    var patterns = [
        /(\bunion\b[\s\S]*\bselect\b)/gi,
        /(\binsert\b[\s\S]*\binto\b)/gi,
        /(\bdelete\b[\s\S]*\bfrom\b)/gi,
        /(\bdrop\b[\s\S]*\btable\b)/gi,
        /(\balter\b[\s\S]*\btable\b)/gi,
        /(;\s*(drop|alter|delete|insert|update|create)\b)/gi,
        /(--|#|\/\*|\*\/)/g,
        /(char\s*\(|concat\s*\(|0x[0-9a-f]{6,})/gi
    ];
    return !patterns.some(function(p) { return p.test(str); });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    if (req.method === 'OPTIONS') return res.status(200).end();

    var id = sanitize(req.query.id || '', 50);
    var type = sanitize(req.query.type || '', 20);
    var validate = sanitize(req.query.validate || '', 100);
    var device = sanitize(req.query.device || '', 200);
    var deleteKey = sanitizeKey(req.query.deleteKey || '');
    var host = req.headers.host || 'localhost';

    /* ═══════════════════════════════════════════
       LINK 1 — LOADER (→ routes to LOGIN)
       ═══════════════════════════════════════════ */
    if (req.method === 'GET' && type === 'loader') {
        var loaderLines = [
            'gg.setVisible(false)',
            'local A = gg.getFile()',
            'gg.getFile = function() return A end',
            'local V = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + id + '").content',
            'if V then pcall(load(V)) end'
        ];
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(loaderLines.join('\n'));
    }

    /* ═══════════════════════════════════════════
       LINK 3 — MENU (raw script content)
       ═══════════════════════════════════════════ */
    if (req.method === 'GET' && type === 'menu' && id) {
        var sc = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : 'gg.alert("[X] Script not found!")');
    }

    /* ═══════════════════════════════════════════
       LINK 3b — RAW (alt direct access)
       ═══════════════════════════════════════════ */
    if (req.method === 'GET' && type === 'raw' && id) {
        var raw = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(raw.length > 0 ? raw[0].content : '-- [NEXUS X] Script not found.');
    }

    /* ═══════════════════════════════════════════
       LINK 2 — LOGIN & VALIDATION SYSTEM
       ═══════════════════════════════════════════ */
    if (req.method === 'GET' && type === 'login') {
        var targetScriptId = id || '';

        // ── WITH VALIDATE: check key in DB ──
        if (validate) {
            var cleanKey = sanitizeKey(validate);
            var cleanDevice = sanitize(device, 200);
            var checkKey = await sql`SELECT * FROM keys WHERE key = ${cleanKey}`;

            // FAIL: key not found or wrong target script
            if (checkKey.length === 0 || (targetScriptId !== '' && checkKey[0].script_id !== targetScriptId)) {
                var errInvalid = [
                    'os.remove("/sdcard/.nexus_auth")',
                    'gg.alert("[X] NEXUS X CLOUD\\n\\nLicense Key tidak valid untuk Script ini!")',
                    'local V = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '").content',
                    'if V then pcall(load(V)) end'
                ].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(errInvalid);
            }

            var license = checkKey[0];
            var expDate = new Date(license.expiry);
            var isPerm = license.expiry && license.expiry.startsWith('9999');

            // FAIL: expired
            if (!isPerm && new Date() > expDate) {
                var fd = expDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
                var errExpired = [
                    'os.remove("/sdcard/.nexus_auth")',
                    'gg.alert("[X] NEXUS X CLOUD\\n\\nLicense EXPIRED!\\nExpired on: ' + fd + '\\n\\nContact admin for renewal.")',
                    'local V = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '").content',
                    'if V then pcall(load(V)) end'
                ].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(errExpired);
            }

            // FAIL: max device
            var devices = license.registered_devices || [];
            if (cleanDevice && cleanDevice !== 'NX-UNKNOWN' && devices.indexOf(cleanDevice) === -1) {
                if (devices.length >= license.max_devices) {
                    var errDevice = [
                        'os.remove("/sdcard/.nexus_auth")',
                        'gg.alert("[X] NEXUS X CLOUD\\n\\nMax Device Limit Reached!\\nDevices: ' + devices.length + '/' + license.max_devices + '\\n\\nContact admin to reset.")',
                        'local V = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '").content',
                        'if V then pcall(load(V)) end'
                    ].join('\n');
                    res.setHeader('Content-Type', 'text/plain');
                    return res.status(200).send(errDevice);
                }
                devices.push(cleanDevice);
                await sql`UPDATE keys SET registered_devices = ${devices} WHERE key = ${cleanKey}`;
            }

            // SUCCESS: grant access → load menu
            var label = isPerm ? 'PERMANENT ACCESS' : 'Valid Until: ' + expDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
            var successCode = [
                'local f = io.open("/sdcard/.nexus_auth", "w")',
                'if f then f:write("' + cleanKey + '"); f:close() end',
                'gg.alert("[X] NEXUS X CLOUD\\n\\nACCESS GRANTED\\n\\n' + label + '")',
                'local V = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + license.script_id + '").content',
                'if V then pcall(load(V)) end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(successCode);
        }

        // ── WITHOUT VALIDATE: show login UI (gg.prompt) ──
        var loginLines = [
            'gg.setVisible(false)',
            'local BASE = "https://' + host + '"',
            'local KEY_FILE = "/sdcard/.nexus_auth"',
            'local SCRIPT_ID = "' + targetScriptId + '"',
            '',
            'local function getHwid()',
            '    local raw = "NX-" .. tostring(gg.getTargetPackage())',
            '    local enc = ""',
            '    for i = 1, #raw do enc = enc .. string.format("%02X", string.byte(raw, i)) end',
            '    return enc',
            'end',
            '',
            'local function doValidate(k)',
            '    gg.toast("[X] Verifying license...")',
            '    local R = gg.makeRequest(BASE .. "/api/server?type=login&validate=" .. k .. "&device=" .. getHwid() .. "&id=" .. SCRIPT_ID)',
            '    if R then',
            '        local V = R.content',
            '        if V then pcall(load(V)) end',
            '    end',
            'end',
            '',
            'local function showLogin()',
            '    local input = gg.prompt(',
            '        {"[NEXUS X CLOUD]\\nMasukkan License Key Anda:"},',
            '        {""},',
            '        {"text"}',
            '    )',
            '    if input and input[1] then',
            '        return (input[1]):match("^%s*(.-)%s*$")',
            '    end',
            '    return nil',
            'end',
            '',
            'local savedKey = nil',
            'local f = io.open(KEY_FILE, "r")',
            'if f then savedKey = f:read("*a"):match("^%s*(.-)%s*$"); f:close() end',
            '',
            'if savedKey and savedKey ~= "" then',
            '    gg.toast("[X] Restoring session...")',
            '    doValidate(savedKey)',
            '    return',
            'end',
            '',
            'local inputKey = showLogin()',
            'if not inputKey or inputKey == "" then',
            '    if inputKey == "" then gg.alert("[X] Key tidak boleh kosong!") end',
            '    return',
            'end',
            '',
            'doValidate(inputKey)'
        ];
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(loginLines.join('\n'));
    }

    /* ═══════════════════════════════════════════
       SESSION AUTH CHECK
       ═══════════════════════════════════════════ */
    var sessionToken = req.headers['x-session'] || '';
    var authUser = null;

    // Cek admin hardcoded (instant, no DB query)
    if (sessionToken === makeSession(ADMIN_USER, hashPass(ADMIN_PASS))) {
        authUser = ADMIN_USER;
    }

    // Cek session dari DB accounts
    if (!authUser && sessionToken) {
        try {
            var accounts = await sql`SELECT email, password FROM accounts`;
            for (var i = 0; i < accounts.length; i++) {
                if (makeSession(accounts[i].email, accounts[i].password) === sessionToken) {
                    authUser = accounts[i].email;
                    break;
                }
            }
        } catch (e) { /* table might not exist */ }
    }

    /* ═══════════════════════════════════════════
       UNAUTHENTICATED — only login action
       ═══════════════════════════════════════════ */
    if (!authUser) {
        if (req.method === 'POST') {
            var body = req.body || {};
            var action = sanitize(body.action || '', 20);
            var username = sanitize(body.username || body.email || '', 100);
            var password = sanitize(body.password || '', 100);

            if (action === 'login') {
                if (!isCleanInput(username) || !isCleanInput(password)) {
                    return res.status(400).json({ error: 'Malformed input detected' });
                }

                // Hardcoded admin check
                if (username === ADMIN_USER && password === ADMIN_PASS) {
                    return res.status(200).json({ session: makeSession(username, hashPass(password)) });
                }

                // DB accounts check
                try {
                    var acc = await sql`SELECT * FROM accounts WHERE email = ${username}`;
                    if (acc.length > 0 && acc[0].password === hashPass(password)) {
                        return res.status(200).json({ session: makeSession(username, acc[0].password) });
                    }
                } catch (e) { /* table might not exist */ }

                return res.status(401).json({ error: 'Auth failed' });
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

    /* ═══════════════════════════════════════════
       AUTHENTICATED OPERATIONS
       ═══════════════════════════════════════════ */
    if (req.method === 'POST') {
        var body = req.body || {};
        var name = sanitize(body.name || '', 200);
        var content = body.content || '';
        var existingScriptId = sanitize(body.existingScriptId || '', 50);
        var postAction = sanitize(body.action || '', 20);
        var scriptId = sanitize(body.scriptId || '', 50);
        var maxDevices = Math.min(Math.max(parseInt(body.maxDevices) || 1, 1), 100);
        var expiry = body.expiry || '';
        var customName = body.customName || '';

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
            var finalKey = '';
            if (customName && typeof customName === 'string' && customName.trim()) {
                finalKey = sanitizeKey(customName);
            }
            if (!finalKey) {
                finalKey = 'NX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            }

            var expiryDate;
            if (body.permanent === 'true' || body.permanent === true) {
                expiryDate = new Date('9999-12-31T23:59:59Z');
            } else {
                expiryDate = new Date(expiry);
                if (isNaN(expiryDate.getTime())) expiryDate = new Date(Date.now() + 86400000);
            }

            var target = await sql`SELECT name FROM scripts WHERE id = ${scriptId}`;
            var targetName = (target.length > 0) ? target[0].name : 'Unknown';

            try {
                await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices, registered_devices) VALUES (${finalKey}, ${scriptId}, ${targetName}, ${expiryDate.toISOString()}, ${maxDevices}, ${[]})`;
            } catch (e) {
                finalKey = 'NX-' + Math.random().toString(36).substring(2, 10).toUpperCase();
                await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices, registered_devices) VALUES (${finalKey}, ${scriptId}, ${targetName}, ${expiryDate.toISOString()}, ${maxDevices}, ${[]})`;
            }

            return res.status(200).json({ key: finalKey });
        }
    }

    // GET: list data
    if (req.method === 'GET') {
        if (type === 'keys') {
            var keys = await sql`SELECT * FROM keys ORDER BY created_at DESC NULLS LAST`;
            return res.status(200).json(keys);
        }
        var scripts = await sql`SELECT * FROM scripts ORDER BY id`;
        return res.status(200).json(scripts);
    }

    // DELETE
    if (req.method === 'DELETE') {
        if (deleteKey) await sql`DELETE FROM keys WHERE key = ${deleteKey}`;
        if (id) {
            await sql`DELETE FROM keys WHERE script_id = ${id}`;
            await sql`DELETE FROM scripts WHERE id = ${id}`;
        }
        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
