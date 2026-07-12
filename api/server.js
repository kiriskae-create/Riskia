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

    const { id, type, key, device, reqStage, deleteKey, validate } = req.query;
    const host = req.headers.host;

    // ═══════════════════════════════════════
    //  LINK 1 — LOADER (unique URL per key)
    // ═══════════════════════════════════════
    if (req.method === 'GET' && type === 'loader') {
        const lk = key || '';
        const kp = lk ? '&key=' + lk : '';
        const code = 'gg.setVisible(false)\ngg.toast("[X] NEXUS X - Connecting...")\nlocal r = gg.makeRequest("https://' + host + '/api/server?type=login' + kp + '")\nif r and r.code == 200 then\n    load(r.content)()\nelse\n    gg.alert("[X] NEXUS X\\n\\nConnection Failed!")\nend';
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(code);
    }

    // ═══════════════════════════════════════
    //  LINK 3 — MENU
    // ═══════════════════════════════════════
    if (req.method === 'GET' && type === 'menu' && id) {
        const sc = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : 'gg.alert("[X] Menu script not found!")');
    }

    // ═══════════════════════════════════════
    //  LINK 2 — LOGIN (gg.dialog = system keyboard)
    // ═══════════════════════════════════════
    if (req.method === 'GET' && type === 'login') {

        // --- VALIDATE KEY ---
        if (validate) {
            const checkKey = await sql`SELECT * FROM keys WHERE key = ${validate}`;
            if (checkKey.length === 0) {
                const c = [
                    'os.remove("/sdcard/.nexus_auth")',
                    'gg.alert("[X] NEXUS X CLOUD\\n\\nInvalid license key!")',
                    'local r = gg.makeRequest("https://' + host + '/api/server?type=login")',
                    'if r and r.code == 200 then load(r.content)() end'
                ].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(c);
            }
            const license = checkKey[0];
            const expDate = new Date(license.expiry);

            if (new Date() > expDate) {
                const fd = expDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
                const c = [
                    'os.remove("/sdcard/.nexus_auth")',
                    'gg.alert("[X] NEXUS X CLOUD\\n\\nLicense EXPIRED!\\nExpired on: ' + fd + '\\n\\nContact admin for renewal.")',
                    'local r = gg.makeRequest("https://' + host + '/api/server?type=login")',
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
                        'gg.alert("[X] NEXUS X CLOUD\\n\\nMax Device Limit Reached!\\n\\nContact admin to reset devices.")',
                        'local r = gg.makeRequest("https://' + host + '/api/server?type=login")',
                        'if r and r.code == 200 then load(r.content)() end'
                    ].join('\n');
                    res.setHeader('Content-Type', 'text/plain');
                    return res.status(200).send(c);
                }
                registeredDevices.push(clientHwid);
                await sql`UPDATE keys SET registered_devices = ${registeredDevices} WHERE key = ${validate}`;
            }

            const fd = expDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
            const c = [
                'local f = io.open("/sdcard/.nexus_auth", "w")',
                'if f then f:write("' + validate + '"); f:close() end',
                'gg.alert("[X] NEXUS X CLOUD\\n\\nACCESS GRANTED\\n\\nExp: ' + fd + '")',
                'local r = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + license.script_id + '")',
                'local fn = load(r.content)',
                'if fn then fn() else gg.alert("[X] Failed to load menu!") end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(c);
        }

        // --- LOGIN UI (gg.dialog = system keyboard, pre-fill key from URL) ---
        const prefillKey = key || '';
        const loginLua = `gg.setVisible(false)
local BASE = "https://${host}"
local KEY_FILE = "/sdcard/.nexus_auth"
local PREFILL = "${prefillKey}"

local function getHwid()
    local raw = "NX-" .. tostring(gg.getTargetPackage())
    local enc = ""
    for i = 1, #raw do enc = enc .. string.format("%02X", string.byte(raw, i)) end
    return enc
end

local function doValidate(k)
    gg.toast("[X] Verifying license...")
    local r = gg.makeRequest(BASE .. "/api/server?type=login&validate=" .. k .. "&device=" .. getHwid())
    if r and r.code == 200 then
        local fn = load(r.content)
        if fn then fn() end
        return true
    end
    return false
end

local function showLogin(pf)
    if type(gg.dialog) == "function" then
        local ok, btn, data = pcall(gg.dialog,
            {
                "  [X]  NEXUS X CLOUD",
                "  License Verification",
                "",
                {text = pf or "", hint = "Enter your license key", tag = "key"}
            },
            "AUTHENTICATION",
            {"VERIFY", "EXIT"}
        )
        if ok then
            if type(btn) == "number" and btn == 1 then
                if type(data) == "table" then
                    local k = tostring(data.key or data[1] or ""):match("^%s*(.-)%s*$")
                    if k ~= "" then return k end
                end
            end
            return nil
        end
    end
    local input = gg.prompt({"License Key"}, {pf or ""}, {"text"})
    if type(input) == "table" then
        local k = tostring(input[1] or ""):match("^%s*(.-)%s*$")
        if k ~= "" then return k end
    end
    return nil
end

local savedKey = nil
local f = io.open(KEY_FILE, "r")
if f then savedKey = f:read("*a"):match("^%s*(.-)%s*$"); f:close() end

if savedKey and savedKey ~= "" then
    gg.toast("[X] Restoring session...")
    if doValidate(savedKey) then return end
end

local inputKey = showLogin(PREFILL)
if not inputKey or inputKey == "" then
    if inputKey == "" then gg.alert("[X] Key cannot be empty!") end
    return
end

if not doValidate(inputKey) then
    gg.alert("[X] Connection failed!\\nCheck your internet.")
end`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(loginLua);
    }

    // ═══════════════════════════════════════
    //  RAW SCRIPT CONTENT
    // ═══════════════════════════════════════
    if (req.method === 'GET' && type === 'raw' && id) {
        const sc = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : '-- [NEXUS X] Script not found.');
    }

    // ═══════════════════════════════════════
    //  LEGACY KEY MULTI-STAGE
    // ═══════════════════════════════════════
    if (key) {
        const checkKey = await sql`SELECT * FROM keys WHERE key = ${key}`;
        if (checkKey.length === 0) {
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send('gg.alert("[X] License tidak valid!")\nos.exit()');
        }
        const license = checkKey[0];
        const expDate = new Date(license.expiry);
        if (new Date() > expDate) {
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send('gg.alert("[X] License kedaluwarsa!")\nos.exit()');
        }
        const clientHwid = device || 'NX-INIT-DEVICE';
        let registeredDevices = license.registered_devices || [];
        if (device && !registeredDevices.includes(clientHwid)) {
            if (registeredDevices.length >= license.max_devices) {
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send('gg.alert("[X] Max Device Terlampaui!")\nos.exit()');
            }
            registeredDevices.push(clientHwid);
            await sql`UPDATE keys SET registered_devices = ${registeredDevices} WHERE key = ${key}`;
        }
        if (!reqStage) {
            const p = `gg.setVisible(false)
local raw_hwid = "NX-" .. tostring(gg.getTargetPackage())
local encoded_hwid = ""
for i = 1, #raw_hwid do encoded_hwid = encoded_hwid .. string.format("%02X", string.byte(raw_hwid, i)) end
local r = gg.makeRequest("https://${host}/api/server?key=${key}&device="..encoded_hwid.."&reqStage=2")
if r and r.code == 200 then load(r.content)() else gg.alert("[X] Jaringan Terputus!") os.exit() end`;
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(p);
        }
        if (reqStage === '2') {
            const fd = expDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
            const p = `gg.alert("[X] NEXUS X CLOUD\\n\\nACCESS GRANTED\\n\\nExp: ${fd}")
local r = gg.makeRequest("https://${host}/api/server?key=${key}&device=${clientHwid}&reqStage=3")
if r and r.code == 200 then load(r.content)() else os.exit() end`;
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(p);
        }
        if (reqStage === '3') {
            const sc = await sql`SELECT content FROM scripts WHERE id = ${license.script_id}`;
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(sc.length > 0 ? sc[0].content : 'gg.alert("[X] Script Kosong!"); os.exit()');
        }
    }

    // ═══════════════════════════════════════
    //  SESSION AUTH
    // ═══════════════════════════════════════
    const sessionToken = req.headers['x-session'];
    let authenticatedUser = null;
    if (sessionToken) {
        const accounts = await sql`SELECT * FROM accounts`;
        for (const acc of accounts) {
            if (makeSession(acc.email, acc.password) === sessionToken) { authenticatedUser = acc.email; break; }
        }
    }

    // ═══════════════════════════════════════
    //  POST
    // ═══════════════════════════════════════
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
            if (existingScriptId && existingScriptId !== "") {
                await sql`UPDATE scripts SET name = ${name}, content = ${content} WHERE id = ${existingScriptId}`;
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

    // ═══════════════════════════════════════
    //  GET (ADMIN)
    // ═══════════════════════════════════════
    if (req.method === 'GET') {
        if (!authenticatedUser) return res.status(401).json({ error: 'Access Denied' });
        return res.status(200).json(type === 'keys' ? await sql`SELECT * FROM keys` : await sql`SELECT * FROM scripts`);
    }

    // ═══════════════════════════════════════
    //  DELETE
    // ═══════════════════════════════════════
    if (req.method === 'DELETE') {
        if (!authenticatedUser) return res.status(401).json({ error: 'Access Denied' });
        if (deleteKey) await sql`DELETE FROM keys WHERE key = ${deleteKey}`;
        if (id) await sql`DELETE FROM scripts WHERE id = ${id}`;
        return res.status(200).json({ success: true });
    }
}
