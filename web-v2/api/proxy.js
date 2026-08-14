// File: api/proxy.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: "Metode tidak diizinkan." });
  }

  const gasUrl = process.env.GAS_API_URL;

  if (!gasUrl) {
    return res.status(500).json({ success: false, message: "Environment variable GAS_API_URL belum disetting di Vercel!" });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(gasUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
      signal: controller.signal
    });

    const data = await response.json();

    res.status(200).json(data);

  } catch (error) {
    console.error("Proxy Error:", error);
    if (error.name === 'AbortError') {
      res.status(504).json({ success: false, message: "Server internal (GAS) tidak merespons dalam 45 detik. Coba lagi." });
    } else {
      res.status(500).json({ success: false, message: "Gagal meneruskan request ke server internal (GAS)." });
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
