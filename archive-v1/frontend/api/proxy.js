// File: api/proxy.js
export default async function handler(req, res) {
  // Keamanan ekstra: Hanya izinkan request dengan metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: "Metode tidak diizinkan." });
  }

  const gasUrl = process.env.GAS_API_URL;
  
  if (!gasUrl) {
    return res.status(500).json({ success: false, message: "Environment variable GAS_API_URL belum disetting di Vercel!" });
  }

  try {
    // Vercel menjadi "kurir": Menerima data dari index.html, lalu meneruskannya ke GAS
    const response = await fetch(gasUrl, {
      method: "POST",
      headers: {
        // Penting untuk memastikan format yang dikirim ke GAS tetap konsisten
        "Content-Type": "application/json", 
      },
      // req.body otomatis di-parse oleh Vercel, kita jadikan string lagi untuk GAS
      body: JSON.stringify(req.body) 
    });

    // Mengambil balasan dari GAS
    const data = await response.json();
    
    // Meneruskan balasan GAS tersebut kembali ke frontend (index.html)
    res.status(200).json(data);

  } catch (error) {
    console.error("Proxy Error:", error);
    res.status(500).json({ success: false, message: "Gagal meneruskan request ke server internal (GAS)." });
  }
}