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

    // 1. DURUM: Resim Üzerine Yazı / Düzenleme (Image-to-Image)
    if (inputImage) {
      const cleanBase64 = inputImage.includes(',') ? inputImage.split(',')[1] : inputImage;
      const imageBuffer = Buffer.from(cleanBase64, 'base64');

      // Resim üzerine doğrudan modifikasyon yapan doğru Hugging Face modeli
      const response = await fetch(
        "https://api-inference.huggingface.co/models/pix2pix/instruct-pix2pix",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "image/png",
            "x-use-cache": "false"
          },
          body: imageBuffer,
        }
      );

      if (!response.ok) {
        // Alternatif olarak ControlNet Inpainting Endpoint'ine yönlendirme
        const fallbackRes = await fetch(
          "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              inputs: prompt || "add text Livanni on image",
              parameters: {
                image: cleanBase64,
                strength: 0.35 // Orijinal resmi %65 korur, sadece metni işler
              }
            }),
          }
        );

        if (!fallbackRes.ok) {
          const errText = await fallbackRes.text();
          throw new Error(`Resim işleme başarısız oldu: ${errText}`);
        }

        const fbBuffer = await fallbackRes.arrayBuffer();
        const fbBase64 = Buffer.from(fbBuffer).toString('base64');
        return res.status(200).json({ imageBase64: fbBase64 });
      }

      const arrayBuffer = await response.arrayBuffer();
      const resultBase64 = Buffer.from(arrayBuffer).toString('base64');
      return res.status(200).json({ imageBase64: resultBase64 });
    }

    // 2. DURUM: Sıfırdan Görsel Üretme (Text-to-Image)
    const response = await fetch(
      "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: prompt }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hugging Face API Hatası: ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const resultBase64 = Buffer.from(arrayBuffer).toString('base64');
    return res.status(200).json({ imageBase64: resultBase64 });

  } catch (error) {
    console.error("Image API Error:", error);
    return res.status(500).json({ 
      error: `Görsel işlenirken bir hata oluştu: ${error.message}` 
    });
  }
}
