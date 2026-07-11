import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false }
});

// Inisialisasi tabel jika belum ada
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nexus_storage (
      id SERIAL PRIMARY KEY,
      key VARCHAR(50) UNIQUE NOT NULL,
      data JSONB NOT NULL
    )
  `);
  
  const res = await pool.query("SELECT * FROM nexus_storage WHERE key = 'state'");
  if (res.rows.length === 0) {
    await pool.query(
      "INSERT INTO nexus_storage (key, data) VALUES ('state', $1)",
      [JSON.stringify({ files: [], keys: [], accounts: [] })]
    );
  }
}

export default async function handler(req, res) {
  // Mengizinkan CORS agar frontend bisa mengakses API tanpa kendala
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    await initDb();
    
    // 1. MENGAMBIL DATA (GET)
    if (req.method === 'GET') {
      const result = await pool.query("SELECT data FROM nexus_storage WHERE key = 'state'");
      return res.status(200).json(result.rows[0].data);
    }
    
    // 2. MENYIMPAN / UPDATE DATA (POST)
    if (req.method === 'POST') {
      const incomingData = req.body;
      
      // Ambil data state terbaru dari database terlebih dahulu
      const currentRes = await pool.query("SELECT data FROM nexus_storage WHERE key = 'state'");
      let currentState = currentRes.rows[0].data;

      // Skenario A: Frontend mengirimkan struktur penuh
      if (incomingData.files && incomingData.keys && incomingData.accounts) {
        currentState = incomingData;
      } 
      // Skenario B: Frontend melakukan registrasi (mengirim data account baru saja)
      else if (incomingData.email || incomingData.username || incomingData.password) {
        if (!currentState.accounts) currentState.accounts = [];
        
        // Cek apakah akun sudah terdaftar agar tidak duplikat
        const exists = currentState.accounts.some(acc => acc.email === incomingData.email);
        if (exists) {
          return res.status(400).json({ error: "Email sudah terdaftar!" });
        }
        
        currentState.accounts.push(incomingData);
      } 
      // Skenario C: Update data partial lainnya
      else {
        // Jika format tidak dikenal, coba gabungkan ke root state atau sesuaikan kebutuhan
        currentState = { ...currentState, ...incomingData };
      }

      // Simpan kembali data yang sudah digabungkan secara permanen
      await pool.query(
        "UPDATE nexus_storage SET data = $1 WHERE key = 'state'",
        [JSON.stringify(currentState)]
      );
      
      // Kembalikan response sukses sesuai format yang diharapkan frontend kamu
      return res.status(200).json({ 
        status: "success", 
        success: true,
        message: "Database updated permanently!",
        data: currentState 
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
