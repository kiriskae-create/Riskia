import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';

const sql = neon(process.env.POSTGRES_URL);

function hashPass(pw) { return createHash('sha256').update(pw + '_nx_postgres_salt').digest('hex'); }
function makeSession(email, hash) { return createHash('md5').update(email + hash + 'session_token').digest('hex'); }

function obfuscateLua(code) {
    const key = "NexusVip";
    let b64 = Buffer.from(code).toString('base64');
    let xorArr = [];
    
    for (let i = 0; i < b64.length; i++) {
        let kChar = key.charCodeAt((i % key.length));
        xorArr.push(b64.charCodeAt(i) ^ kChar);
    }
    
    let encryptedRawStr = String.fromCharCode(...xorArr);
    let finalPayloadBase64 = Buffer.from(encryptedRawStr, 'binary').toString('base64');

    return `
gg.setVisible(false)

-- ===============================
-- LOADER REAL ANTI-DUMP (NEXUS)
-- ===============================
local function __Nexus_loader(enc)
    local key = "${key}"

    local function xorDec(data)
        local out = {}
        for i = 1, #data do
            local k = key:byte(((i - 1) % #key) + 1)
            out[i] = string.char(bit32.bxor(data:byte(i), k))
        end
        return table.concat(out)
    end

    local decoded = xorDec((function(d)
        local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
        d=d:gsub('[^'..b..'=]','')
        return (d:gsub('.',function(x)
            if x=='=' then return '' end
            local r,f='',(b:find(x)-1)
            for i=6,1,-1 do
                r=r..(f%2^i-f%2^(i-1)>0 and '1' or '0')
            end
            return r
        end):gsub('%d%d%d?%d?%d?%d?%d?%d?',function(x)
            if #x~=8 then return '' end
            local c=0
            for i=1,8 do
                c=c+(x:sub(i,i)=='1' and 2^(8-i) or 0)
            end
            return string.char(c)
        end))
    end)(enc))

    local tmp_dir = gg.EXT_CACHE_DIR or gg.EXT_STORAGE or "/sdcard"
    local tmp = tmp_dir .. "/.nx_" .. tostring(os.time()) .. "_" .. tostring(math.random(1000,9999)) .. ".tmp"

    local f = io.open(tmp, "wb")
    if not f then return end
    f:write(decoded)
    f:close()

    local loader = loadfile(tmp)
    os.remove(tmp)

    if loader then
        pcall(loader)
    end
end

-- ===============================
-- PAYLOAD CRIPTOGRAFADO (NEXUS FULL)
-- ===============================
local PAYLOAD = [[${finalPayloadBase64}]]

__Nexus_loader(PAYLOAD)

-- ===============================
-- RETORNO FAKE (ANTI-DUMP)
-- ===============================
return {
    msg = "Protegido por NexusXGuard - Uso nao autorizado proibido."
}
`.trim();
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id, type, device, validate, deleteKey } = req.query;
    const host = req.headers.host;

    if (req.method === 'GET' && type === 'loader') {
        const targetScriptId = id || 'default';
        const code = [
            'gg.setVisible(false)',
            'local function getHwid()',
            '    local di = gg.getTargetInfo() or {}',
            '    local raw = tostring(di.uid or "0") .. tostring(di.pid or "0") .. (di.processName or "unknown")',
            '    local enc = ""',
            '    for i = 1, #raw do enc = enc .. string.format("%02X", string.byte(raw, i)) end',
            '    return enc',
            'end',
            'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '&device=" .. getHwid())',
            'if r and r.code == 200 then',
            '    local fn = load(r.content)',
            '    if fn then fn() else gg.alert("[X] Gagal membaca muatan!") end',
            'else',
            '    gg.alert("[X] Server tidak merespon!")',
            'end'
        ].join('\n');
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(code);
    }

    if (req.method === 'GET' && type === 'menu' && id) {
        const sc = await sql`SELECT content, encrypted FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        if (sc.length > 0) {
            const isEncrypted = sc[0].encrypted === true || sc[0].encrypted === 'true' || sc[0].encrypted === 1;
            return res.status(200).send(isEncrypted ? obfuscateLua(sc[0].content) : sc[0].content);
        }
        return res.status(200).send('gg.alert("[X] Menu tidak ditemukan!")');
    }

    if (req.method === 'GET' && type === 'login') {
        const targetScriptId = id || '';
        const clientHwid = device || 'NX-UNKNOWN';

        if (!validate && clientHwid !== 'NX-UNKNOWN') {
            const activeKeys = await sql`SELECT * FROM keys WHERE script_id = ${targetScriptId}`;
            const matchingKey = activeKeys.find(k => {
                let devList = [];
                try {
                    devList = typeof k.registered_devices === 'string' ? JSON.parse(k.registered_devices) : (k.registered_devices || []);
                } catch(e) { devList = []; }
                let isExpired = k.expiry ? (new Date() > new Date(k.expiry)) : false;
                return devList.includes(clientHwid) && !isExpired;
            });

            if (matchingKey) {
                const c = [
                    'gg.toast("⚡ Terverifikasi Otomatis Perangkat!")',
                    'local r = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + matchingKey.script_id + '")',
                    'local fn = load(r.content)',
                    'if fn then fn() else gg.alert("[X] Gagal memuat menu!") end'
                ].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(c);
            }
        }

        if (validate) {
            const checkKey = await sql`SELECT * FROM keys WHERE key = ${validate}`;
            if (checkKey.length === 0 || (targetScriptId !== '' && checkKey[0].script_id !== targetScriptId)) {
                return res.status(200).send(`gg.alert("[X] Lisensi Salah!"); load(gg.makeRequest("https://${host}/api/server?type=login&id=${targetScriptId}").content)()`);
            }
            const license = checkKey[0];
            if (license.expiry && new Date() > new Date(license.expiry)) {
                return res.status(200).send(`gg.alert("[X] Masa aktif habis!"); load(gg.makeRequest("https://${host}/api/server?type=login&id=${targetScriptId}").content)()`);
            }

            let registeredDevices = [];
            try {
                registeredDevices = typeof license.registered_devices === 'string' ? JSON.parse(license.registered_devices) : (license.registered_devices || []);
            } catch(e) { registeredDevices = []; }

            if (clientHwid !== 'NX-UNKNOWN' && !registeredDevices.includes(clientHwid)) {
                if (registeredDevices.length >= license.max_devices) {
                    return res.status(200).send(`gg.alert("[X] Batas perangkat tercapai!"); load(gg.makeRequest("https://${host}/api/server?type=login&id=${targetScriptId}").content)()`);
                }
                registeredDevices.push(clientHwid);
                await sql`UPDATE keys SET registered_devices = ${JSON.stringify(registeredDevices)}::jsonb WHERE key = ${validate}`;
            }

            return res.status(200).send(`gg.alert("🔓 Akses Diberikan!"); load(gg.makeRequest("https://${host}/api/server?type=menu&id=${license.script_id}").content)()`);
        }

        const loginLua = `
gg.setVisible(false)
local BASE = "https://${host}"
local SCRIPT_ID = "${targetScriptId}"

local function getHwid()
    local di = gg.getTargetInfo() or {}
    local raw = tostring(di.uid or "0") .. tostring(di.pid or "0") .. (di.processName or "unknown")
    local enc = ""
    for i = 1, #raw do enc = enc .. string.format("%02X", string.byte(raw, i)) end
    return enc
end

while true do
    if not gg.isVisible() then
        local input = gg.prompt({"[NEXUS CONTROLLER]\\nMasukkan Kode Lisensi Anda:"}, {""}, {"text"})
        if not input then
            gg.setVisible(true)
            break
        else
            local key = (input[1]):match("^%s*(.-)%s*$")
            if key ~= "" then
                gg.toast("Memverifikasi...")
                local r = gg.makeRequest(BASE .. "/api/server?type=login&validate=" .. key .. "&device=" .. getHwid() .. "&id=" .. SCRIPT_ID)
                if r and r.code == 200 then
                    local fn = load(r.content)
                    if fn then fn() break end
                end
            end
        end
    end
    gg.sleep(200)
end`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(loginLua);
    }

    const sessionToken = req.headers['x-session'];
    let authenticatedUser = null;
    if (sessionToken) {
        const accounts = await sql`SELECT * FROM accounts`;
        for (const acc of accounts) {
            if (makeSession(acc.email, acc.password) === sessionToken) { authenticatedUser = acc.email; break; }
        }
    }

    if (req.method === 'POST') {
        const { action, email, password, name, content, encrypted, scriptId, expiry, maxDevices, customName, existingScriptId } = req.body;
        if (action === 'login') {
            const acc = await sql`SELECT * FROM accounts WHERE email = ${email}`;
            if (acc.length > 0 && acc[0].password === hashPass(password)) return res.status(200).json({ session: makeSession(email, acc[0].password) });
            return res.status(401).json({ error: 'Auth failed' });
        }
        if (!authenticatedUser) return res.status(401).json({ error: 'Access Denied' });

        if (name && content !== undefined) {
            // Memastikan nama file berakhiran .lua
            let sanitizedName = name.trim();
            if (!sanitizedName.toLowerCase().endsWith('.lua')) {
                sanitizedName += '.lua';
            }

            const isEnc = encrypted ? true : false;
            
            try {
                if (existingScriptId) {
                    await sql`UPDATE scripts SET name = ${sanitizedName}, content = ${content}, encrypted = ${isEnc} WHERE id = ${existingScriptId}`;
                } else {
                    await sql`INSERT INTO scripts (id, name, content, encrypted) VALUES (${'sc_' + Math.random().toString(36).substring(2, 9)}, ${sanitizedName}, ${content}, ${isEnc})`;
                }
                return res.status(200).json({ success: true });
            } catch (err) {
                return res.status(500).json({ error: err.message });
            }
        }
        if (action === 'createKey') {
            const finalKey = customName || 'NX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            const target = await sql`SELECT name FROM scripts WHERE id = ${scriptId}`;
            const expiryValue = expiry === 'permanent' ? null : new Date(expiry);
            await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices, registered_devices) VALUES (${finalKey}, ${scriptId}, ${target[0]?.name || 'Unknown'}, ${expiryValue}, ${parseInt(maxDevices) || 1}, '[]'::jsonb)`;
            return res.status(200).json({ key: finalKey });
        }
    }

    if (req.method === 'GET') {
        if (!authenticatedUser) return res.status(401).json({ error: 'Access Denied' });
        return res.status(200).json(type === 'keys' ? await sql`SELECT * FROM keys` : await sql`SELECT * FROM scripts`);
    }

    if (req.method === 'DELETE') {
        if (!authenticatedUser) return res.status(401).json({ error: 'Access Denied' });
        if (deleteKey) await sql`DELETE FROM keys WHERE key = ${deleteKey}`;
        if (id) await sql`DELETE FROM scripts WHERE id = ${id}`;
        return res.status(200).json({ success: true });
    }
}
