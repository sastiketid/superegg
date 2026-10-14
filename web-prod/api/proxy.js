// File: api/proxy.js
// Meneruskan request frontend ke backend. Sejak migrasi: API_URL = API Super Muncul di VPS
// (wajib header x-api-key = API_KEY). Kalau API_URL kosong, jatuh ke GAS_API_URL lama --
// rollback cukup dengan menghapus env API_URL di Vercel lalu redeploy.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: "Metode tidak diizinkan." });
  }

  const targetUrl = process.env.API_URL || process.env.GAS_API_URL;

  if (!targetUrl) {
    return res.status(500).json({ success: false, message: "Environment variable API_URL/GAS_API_URL belum disetting di Vercel!" });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const headers = { "Content-Type": "application/json" };
    if (process.env.API_URL && process.env.API_KEY) headers["x-api-key"] = process.env.API_KEY;

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body),
      signal: controller.signal
    });

    const data = await response.json();

    res.status(200).json(data);

  } catch (error) {
    console.error("Proxy Error:", error);
    if (error.name === 'AbortError') {
      res.status(504).json({ success: false, message: "Server tidak merespons dalam 45 detik. Coba lagi." });
    } else {
      res.status(500).json({ success: false, message: "Gagal meneruskan request ke server." });
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
