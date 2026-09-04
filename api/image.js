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

    // 1. DURUM: Resim Düzenleme / Arka Plan Değiştirme / Oda Dekoru (Img2Img)
    if (inputImage) {
      const cleanBase64 = inputImage.includes(',') ? inputImage.split(',')[1] : inputImage;
      const formattedDataUri = `data:image/png;base64,${cleanBase64}`;

      // Flux Inpainting / Redesign Modeli
      const response = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          version: "c0b930819c922a6117326aa6a3eb77fb0b932822a153205776d54d1933f44503",
          input: {
            image: formattedDataUri,
            prompt: prompt || "place the product in a modern luxury living room",
            prompt_strength: 0.7
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Replicate API Hatası (${response.status}): ${errorText}`);
      }

      let prediction = await response.json();

      // İşlem bitene kadar bekle (Polling)
      while (prediction.status !== "succeeded" && prediction.status !== "failed") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const checkRes = await fetch(prediction.urls.get, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        prediction = await checkRes.json();
      }

      if (prediction.status === "failed") {
        throw new Error("Görsel işleme modeli işlemi tamamlayamadı.");
      }

      const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      const imgRes = await fetch(outputUrl);
      const arrayBuffer = await imgRes.arrayBuffer();
      const resultBase64 = Buffer.from(arrayBuffer).toString('base64');

      return res.status(200).json({ imageBase64: resultBase64 });
    }

    // 2. DURUM: Sıfırdan Görsel Üretme (Text-to-Image)
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        version: "black-forest-labs/flux-schnell",
        input: { prompt: prompt }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Hatası: ${errorText}`);
    }

    let prediction = await response.json();

    while (prediction.status !== "succeeded" && prediction.status !== "failed") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const checkRes = await fetch(prediction.urls.get, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      prediction = await checkRes.json();
    }

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
