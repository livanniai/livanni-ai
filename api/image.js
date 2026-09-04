export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' });
  }

  try {
    const { prompt, image, imageBase64 } = req.body;
    const inputImage = image || imageBase64;

    if (!prompt && !inputImage) {
      return res.status(400).json({ error: 'Prompt veya görsel gereklidir.' });
    }

    const seed = Math.floor(Math.random() * 10000000);
    let imageUrl = '';

    // 1. DURUM: Resim Düzenleme / Odaya Yerleştirme / Üzerine Yazı (Image-to-Image)
    if (inputImage) {
      const cleanBase64 = inputImage.includes(',') ? inputImage.split(',')[1] : inputImage;
      const formattedDataUri = `data:image/png;base64,${cleanBase64}`;
      const encodedPrompt = encodeURIComponent(prompt || "put the product in a modern luxury living room");

      // Pollinations Img2Img Endpoint
      imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?image=${encodeURIComponent(formattedDataUri)}&seed=${seed}&width=1024&height=1024&nologo=true&model=flux`;
    } else {
      // 2. DURUM: Sıfırdan Görsel Üretme (Text-to-Image)
      const encodedPrompt = encodeURIComponent(prompt);
      imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?seed=${seed}&width=1024&height=1024&nologo=true&model=flux`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 sn timeout

    const imageResponse = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!imageResponse.ok) {
      throw new Error(`Görsel servisi yanıt vermedi (${imageResponse.status})`);
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const resultBase64 = Buffer.from(arrayBuffer).toString('base64');

    return res.status(200).json({ imageBase64: resultBase64 });

  } catch (error) {
    console.error("Image API Error:", error);

    if (error.name === 'AbortError') {
      return res.status(504).json({ error: "İşlem zaman aşıma uğradı, lütfen tekrar deneyin." });
    }

    return res.status(500).json({ error: `Hata oluştu: ${error.message}` });
  }
}
