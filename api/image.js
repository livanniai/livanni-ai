export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' });
  }

  const token = process.env.HF_ACCESS_TOKEN || process.env.HF_TOKEN;

  if (!token) {
    return res.status(401).json({ 
      error: 'Vercel ortam değişkenlerinde HF_ACCESS_TOKEN bulunamadı.' 
    });
  }

  try {
    const { prompt, image, imageBase64 } = req.body;
    const inputImage = image || imageBase64;

    if (!prompt && !inputImage) {
      return res.status(400).json({ error: 'Prompt veya görsel gereklidir.' });
    }

    let response;

    // Bağlantı kopmalarını önlemek için zaman aşımı kontrolü (60 saniye)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    // 1. DURUM: Resim Düzenleme (Image-to-Image)
    if (inputImage) {
      const cleanBase64 = inputImage.includes(',') ? inputImage.split(',')[1] : inputImage;
      const imageBuffer = Buffer.from(cleanBase64, 'base64');

      response = await fetch(
        "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "image/png",
          },
          body: imageBuffer,
          signal: controller.signal,
        }
      );
    } 
    // 2. DURUM: Sıfırdan Resim Üretme (Text-to-Image)
    else {
      response = await fetch(
        "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: prompt }),
          signal: controller.signal,
        }
      );
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();

      if (response.status === 503) {
        return res.status(503).json({ 
          error: "Model yükleniyor, lütfen 10-15 saniye sonra tekrar deneyin." 
        });
      }

      throw new Error(`Hugging Face API Hatası (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const resultBase64 = Buffer.from(arrayBuffer).toString('base64');

    return res.status(200).json({ imageBase64: resultBase64 });

  } catch (error) {
    console.error("Image API Error:", error);

    if (error.name === 'AbortError') {
      return res.status(504).json({ 
        error: "İstek zaman aşımına uğradı. Hugging Face yanıt vermekte gecikti, lütfen tekrar deneyin." 
      });
    }

    return res.status(500).json({ 
      error: `Görsel işlenirken bir hata oluştu: ${error.message}` 
    });
  }
}
