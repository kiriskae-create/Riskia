import pg from 'pg';
const { Pool } = pg;

// Menggunakan Environment Variable Vercel Postgres (Neon) secara otomatis
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

// Fungsi pembantu untuk inisialisasi tabel database saat pertama kali dijalankan
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nexus_storage (
      id SERIAL PRIMARY KEY,
      key VARCHAR(50) UNIQUE NOT NULL,
      data JSONB NOT NULL
    )
  `);
  
  // Isi data awal jika database masih kosong
  const res = await pool.query("SELECT * FROM nexus_storage WHERE key = 'state'");
  if (res.rows.length === 0) {
    await pool.query(
      "INSERT INTO nexus_storage (key, data) VALUES ('state', $1)",
      [JSON.stringify({ files: [], keys: [], accounts: [] })]
    );
  }
}

export default async function handler(req, res) {
  try {
    await initDb();
    
    // MENGAMBIL DATA (READ)
    if (req.method === 'GET') {
      const result = await pool.query("SELECT data FROM nexus_storage WHERE key = 'state'");
      return res.status(200).json(result.rows[0].data);
    }
    
    // MENYIMPAN DATA (WRITE)
    if (req.method === 'POST') {
      const incomingData = req.body;
      
      // Validasi struktur data agar tidak merusak sistem
      if (!incomingData.files || !incomingData.keys || !incomingData.accounts) {
        return res.status(400).json({ error: "Struktur data tidak valid" });
      }

      await pool.query(
        "UPDATE nexus_storage SET data = $1 WHERE key = 'state'",
        [JSON.stringify(incomingData)]
      );
      
      return res.status(200).json({ status: "success", message: "Database permanently updated!" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
