import { client } from "../lib/db"; 
import jwt from "jsonwebtoken"; 

export default async function handler(req, res) {
    const sessionToken = req.headers['x-session'];
    let userEmail = null;

    if (sessionToken) {
        try {
            const decoded = jwt.verify(sessionToken, process.env.JWT_SECRET);
            userEmail = decoded.email;
        } catch (err) {
            // Sesi token tidak valid
        }
    }

    const { method } = req;
    const { type, id, deleteKey } = req.query;

    if (method === 'GET' && (type === 'loader' || type === 'login')) {
        const script = await client.table('scripts').find({ id });
        if (!script) return res.status(404).send('-- Script Not Found');
        return res.status(200).send(script.content);
    }

    if (!userEmail) {
        return res.status(401).json({ error: "Unauthorized. Silakan login terlebih dahulu." });
    }

    if (method === 'GET') {
        if (type === 'keys') {
            const userScripts = await client.table('scripts').find({ owner: userEmail });
            const scriptIds = userScripts.map(s => s.id);
            const keys = await client.table('keys').find({ script_id: { $in: scriptIds } });
            return res.status(200).json(keys);
        }
        const myScripts = await client.table('scripts').find({ owner: userEmail });
        return res.status(200).json(myScripts);
    }

    if (method === 'POST') {
        const body = req.body;
        if (body.action === 'createKey') {
            const verifyOwner = await client.table('scripts').find({ id: body.scriptId, owner: userEmail });
            if (!verifyOwner) return res.status(403).json({ error: "Forbidden access" });

            const newKey = {
                key: body.customName || "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase(),
                script_id: body.scriptId,
                target_script_name: verifyOwner.name,
                max_devices: parseInt(body.maxDevices) || 1,
                expiry: body.duration === 'perm' ? '9999-12-31' : new Date(Date.now() + body.duration * 86400000).toISOString(),
                registered_devices: []
            };
            await client.table('keys').insert(newKey);
            return res.status(200).json({ success: true });
        }

        if (body.existingScriptId) {
            const check = await client.table('scripts').find({ id: body.existingScriptId, owner: userEmail });
            if (!check) return res.status(403).json({ error: "Bukan pemilik skrip ini!" });

            await client.table('scripts').update({ id: body.existingScriptId }, { name: body.name, content: body.content });
            return res.status(200).json({ success: true });
        } else {
            const newScript = {
                id: "sc_" + Math.random().toString(36).substring(2, 10),
                name: body.name,
                content: body.content,
                owner: userEmail
            };
            await client.table('scripts').insert(newScript);
            return res.status(200).json({ success: true });
        }
    }

    if (method === 'DELETE') {
        if (id) {
            const check = await client.table('scripts').find({ id, owner: userEmail });
            if (!check) return res.status(403).json({ error: "Bukan pemilik skrip!" });

            await client.table('scripts').delete({ id });
            return res.status(200).json({ success: true });
        }
        if (deleteKey) {
            const userScripts = await client.table('scripts').find({ owner: userEmail });
            const scriptIds = userScripts.map(s => s.id);
            await client.table('keys').delete({ key: deleteKey, script_id: { $in: scriptIds } });
            return res.status(200).json({ success: true });
        }
    }
}
