export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' });
  }

  const token = process.env.REPLICATE_API_TOKEN;

  if (!token) {
    return res.status(401).json({ 
      error: 'Vercel ortam değişkenlerinde REPLICATE_API_TOKEN bulunamadı.' 
    });
  }

  try {
    const { prompt, image, imageBase64 } = req.body;
    const inputImage = image || imageBase64;

    if (!prompt && !inputImage) {
      return res.status(400).json({ error: 'Prompt veya görsel gereklidir.' });
    }

    // 1. DURUM: Resim Düzenleme / Arka Plan Değiştirme / Odaya Yerleştirme (Image-to-Image / Inpainting)
    if (inputImage) {
      const cleanBase64 = inputImage.includes(',') ? inputImage.split(',')[1] : inputImage;
      const formattedDataUri = `data:image/png;base64,${cleanBase64}`;

      // Replicate Resmi FLUX Fill [dev] modeli
      const response = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-fill-dev/predictions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Prefer": "wait" // İşlem tamamlanana kadar yanıtı bekletir (Polling gerekmez)
        },
        body: JSON.stringify({
          input: {
            image: formattedDataUri,
            prompt: prompt || "place the furniture in a modern luxury living room with soft lighting",
            guidance: 30,
            output_format: "png"
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Replicate API Hatası (${response.status}): ${errorText}`);
      }

      const prediction = await response.json();
      const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;

      if (!outputUrl) {
        throw new Error("Görsel oluşturulamadı, model boş yanıt döndürdü.");
      }

      // Oluşan resmi indirip Base64 formatına çevirme
      const imgRes = await fetch(outputUrl);
      const arrayBuffer = await imgRes.arrayBuffer();
      const resultBase64 = Buffer.from(arrayBuffer).toString('base64');

      return res.status(200).json({ imageBase64: resultBase64 });
    }

    // 2. DURUM: Sıfırdan Görsel Üretme (Text-to-Image)
    const response = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Prefer": "wait"
      },
      body: JSON.stringify({
        input: { 
          prompt: prompt,
          output_format: "png"
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Replicate API Hatası (${response.status}): ${errorText}`);
    }

    const prediction = await response.json();
    const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;

    const imgRes = await fetch(outputUrl);
    const arrayBuffer = await imgRes.arrayBuffer();
    const resultBase64 = Buffer.from(arrayBuffer).toString('base64');

    return res.status(200).json({ imageBase64: resultBase64 });

  } catch (error) {
    console.error("Image API Error:", error);
    return res.status(500).json({ error: `Hata oluştu: ${error.message}` });
  }
}
