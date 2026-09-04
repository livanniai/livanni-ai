export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' });
  }

  try {
    const { prompt, image, imageBase64 } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt gereklidir.' });
    }

    // İstek parametrelerini düzenleme
    const encodedPrompt = encodeURIComponent(prompt);
    const seed = Math.floor(Math.random() * 1000000);

    // Resim ve metin harmanlaması için Pollinations Image Endpoint'i
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?seed=${seed}&width=1024&height=1024&nologo=true&model=flux`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 sn timeout

    const imageResponse = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!imageResponse.ok) {
      throw new Error("Görsel oluşturma servisine erişilemedi.");
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const resultBase64 = Buffer.from(arrayBuffer).toString('base64');

    return res.status(200).json({ imageBase64: resultBase64 });

  } catch (error) {
    console.error("Image API Error:", error);

    if (error.name === 'AbortError') {
      return res.status(504).json({ error: "Sunucu yanıt vermekte gecikti, lütfen tekrar deneyin." });
    }

    return res.status(500).json({ 
      error: `Görsel işlenirken bir hata oluştu: ${error.message}` 
    });
  }
}
