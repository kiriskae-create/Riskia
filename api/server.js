import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id, type, device, deleteKey, validate } = req.query;
    const host = req.headers.host;

    if (req.method === 'GET' && type === 'loader') {
        const targetScriptId = id || 'default';
        const code = [
            'gg.setVisible(false)',
            'gg.toast("[X] NEXUS X - Connecting...")',
            'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
            'if r and r.code == 200 then',
            '    local fn = load(r.content)',
            '    if fn then fn() else gg.alert("[X] Script Empty!") end',
            'else',
            '    gg.alert("[X] NEXUS X\\n\\nConnection Failed!")',
            'end'
        ].join('\n');
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(code);
    }

    if (req.method === 'GET' && type === 'menu' && id) {
        const sc = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : 'gg.alert("[X] Menu script not found!")');
    }

    if (req.method === 'GET' && type === 'login') {
        const targetScriptId = id || '';

        if (validate) {
            const clientHwid = device || 'NX-UNKNOWN';

            // JIKA KEY PERMANEN DIAWALI DENGAN TEMPLATE NX-PERM ATAU TULISAN PERMANENT
            if (validate.startsWith('NX-PERM-') || validate === 'PERMANENT') {
                const checkPermKey = await sql`SELECT * FROM keys WHERE key = ${validate}`;
                if (checkPermKey.length > 0) {
                    const license = checkPermKey[0];
                    let registeredDevices = license.registered_devices || [];
                    if (device && !registeredDevices.includes(clientHwid)) {
                        if (registeredDevices.length >= license.max_devices) {
                            const c = [
                                'os.remove("/sdcard/.nexus_auth")',
                                'gg.alert("[X] NEXUS X CLOUD\\n\\nMax Device Limit Reached!\\n\\nContact admin.")',
                                'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                                'if r and r.code == 200 then load(r.content)() end'
                            ].join('\n');
                            res.setHeader('Content-Type', 'text/plain');
                            return res.status(200).send(c);
                        }
                        registeredDevices.push(clientHwid);
                        await sql`UPDATE keys SET registered_devices = ${registeredDevices} WHERE key = ${validate}`;
                    }
                }
                
                const c = [
                    'local f = io.open("/sdcard/.nexus_auth", "w")',
                    'if f then f:write("' + validate + '"); f:close() end',
                    'gg.toast("⚡ NEXUS X UNLIMITED PERMANENT ACCESS GRANTED ⚡")',
                    'local r = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + targetScriptId + '")',
                    'local fn = load(r.content)',
                    'if fn then fn() else gg.alert("[X] Failed to load menu!") end'
                ].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(c);
            }

            const checkKey = await sql`SELECT * FROM keys WHERE key = ${validate}`;
            
            if (checkKey.length === 0 || (targetScriptId !== '' && checkKey[0].script_id !== targetScriptId)) {
                const c = [
                    'os.remove("/sdcard/.nexus_auth")',
                    'gg.alert("[X] NEXUS X CLOUD\\n\\nLicense Key tidak valid untuk Script ini!")',
                    'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                    'if r and r.code == 200 then load(r.content)() end'
                ].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(c);
            }
            
            const license = checkKey[0];

            if (license.expiry !== 'PERMANENT') {
                const expDate = new Date(license.expiry);
                if (new Date() > expDate) {
                    const fd = expDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
                    const c = [
                        'os.remove("/sdcard/.nexus_auth")',
                        'gg.alert("[X] NEXUS X CLOUD\\n\\nLicense EXPIRED!\\nExpired on: ' + fd + '")',
                        'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                        'if r and r.code == 200 then load(r.content)() end'
                    ].join('\n');
                    res.setHeader('Content-Type', 'text/plain');
                    return res.status(200).send(c);
                }
            }

            let registeredDevices = license.registered_devices || [];
            if (device && !registeredDevices.includes(clientHwid)) {
                if (registeredDevices.length >= license.max_devices) {
                    const c = [
                        'os.remove("/sdcard/.nexus_auth")',
                        'gg.alert("[X] NEXUS X CLOUD\\n\\nMax Device Limit Reached!")',
                        'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                        'if r and r.code == 200 then load(r.content)() end'
                    ].join('\n');
                    res.setHeader('Content-Type', 'text/plain');
                    return res.status(200).send(c);
                }
                registeredDevices.push(clientHwid);
                await sql`UPDATE keys SET registered_devices = ${registeredDevices} WHERE key = ${validate}`;
            }

            const expDisplay = license.expiry === 'PERMANENT' ? 'PERMANENT' : new Date(license.expiry).toLocaleDateString('id-ID');
            const c = [
                'local f = io.open("/sdcard/.nexus_auth", "w")',
                'if f then f:write("' + validate + '"); f:close() end',
                'gg.alert("[X] NEXUS X CLOUD\\n\\nACCESS GRANTED\\n\\nExp: ' + expDisplay + '")',
                'local r = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + license.script_id + '")',
                'local fn = load(r.content)',
                'if fn then fn() else gg.alert("[X] Failed to load menu!") end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(c);
        }

        const loginLua = `gg.setVisible(false)
local BASE = "https://${host}"
local KEY_FILE = "/sdcard/.nexus_auth"
local SCRIPT_ID = "${targetScriptId}"

local function getHwid()
    local raw = "NX-" .. tostring(gg.getTargetPackage())
    local enc = ""
    for i = 1, #raw do enc = enc .. string.format("%02X", string.byte(raw, i)) end
    return enc
end

local function doValidate(k)
    gg.toast("[X] Verifying license...")
    local r = gg.makeRequest(BASE .. "/api/server?type=login&validate=" .. k .. "&device=" .. getHwid() .. "&id=" .. SCRIPT_ID)
    if r and r.code == 200 then
        local fn = load(r.content)
        if fn then fn() end
        return true
    end
    return false
end

local savedKey = nil
local f = io.open(KEY_FILE, "r")
if f then savedKey = f:read("*a"):match("^%s*(.-)%s*$"); f:close() end

if savedKey and savedKey ~= "" then
    gg.toast("[X] Restoring session...")
    if doValidate(savedKey) then return end
end

while true do
    gg.setVisible(false)
    local input = gg.prompt(
        {"[NEXUS X CLOUD]\\nEnter License Key:"},
        {""},
        {"text"}
    )
    
    if input then
        local targetKey = (input[1]):match("^%s*(.-)%s*$")
        if targetKey ~= "" then
            if doValidate(targetKey) then break end
        else
            gg.alert("[X] Key tidak boleh kosong!")
        end
    else
        gg.toast("💡 Script running in background. Tap GG icon to login.")
        while true do
            if gg.isVisible() then
                break
            end
            gg.sleep(200)
        end
    end
end`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(loginLua);
    }

    const sessionToken = req.headers['x-session'];
    if (!sessionToken || sessionToken !== 'NEXUS_RISKI_SECURE_TOKEN') {
        if (req.method === 'POST') {
            const { action, username, password } = req.body;
            if (action === 'login' && username === 'riski' && password === '2409') {
                return res.status(200).json({ session: 'NEXUS_RISKI_SECURE_TOKEN' });
            }
        }
        return res.status(401).json({ error: 'Access Denied.' });
    }

    if (req.method === 'POST') {
        const { name, content, scriptId, expiry, maxDevices, customName, existingScriptId, action } = req.body;
        
        if (action === 'createKey') {
            let finalKey = '';
            if (expiry === 'PERMANENT') {
                finalKey = customName ? ('NX-PERM-' + customName.replace(/\s+/g, '-').toUpperCase()) : ('NX-PERM-' + Math.random().toString(36).substring(2, 8).toUpperCase());
            } else {
                finalKey = customName ? customName.replace(/\s+/g, '-').toUpperCase() : ('NX-' + Math.random().toString(36).substring(2, 8).toUpperCase());
            }
            const target = await sql`SELECT name FROM scripts WHERE id = ${scriptId}`;
            await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices) VALUES (${finalKey}, ${scriptId}, ${target[0]?.name || 'Unknown'}, ${expiry}, ${parseInt(maxDevices) || 1})`;
            return res.status(200).json({ key: finalKey });
        }

        if (name && content) {
            if (existingScriptId && existingScriptId !== "") {
                await sql`UPDATE scripts SET name = ${name}, content = ${content} WHERE id = ${existingScriptId}`;
            } else {
                await sql`INSERT INTO scripts (id, name, content) VALUES (${'sc_' + Math.random().toString(36).substring(2, 9)}, ${name}, ${content})`;
            }
            return res.status(200).json({ success: true });
        }
    }

    if (req.method === 'GET') {
        return res.status(200).json(type === 'keys' ? await sql`SELECT * FROM keys` : await sql`SELECT * FROM scripts`);
    }

    if (req.method === 'DELETE') {
        if (deleteKey) await sql`DELETE FROM keys WHERE key = ${deleteKey}`;
        if (id) await sql`DELETE FROM scripts WHERE id = ${id}`;
        return res.status(200).json({ success: true });
    }
}
