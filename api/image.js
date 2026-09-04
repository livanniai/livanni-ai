import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || "https://zqwfucqqbwrcevxohdby.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' });
  }

  try {
    const { prompt, image, imageBase64 } = req.body;
    const inputImage = image || imageBase64;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt gereklidir.' });
    }

    // EĞER RESİMLİ DÜZENLEME YAPILIYORSA
    if (inputImage) {
      // Base64 başlığını temizleyip standart Data URI formatına getiriyoruz
      const cleanBase64 = inputImage.includes(',') ? inputImage.split(',')[1] : inputImage;
      const formattedDataUri = `data:image/png;base64,${cleanBase64}`;

      // Replicate veya dış API isteği (Time-out süresini uzun tutmak için AbortController ekli)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 saniye zaman aşımı

      const response = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          // img2img için uygun model seçimi
          version: "39ed52f2a78e93213afbd9e240183188b0e1cecc301a55517b135865a2a22c1d", 
          input: {
            prompt: prompt,
            image: formattedDataUri,
            prompt_strength: 0.8
          }
        })
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Model API hatası: ${response.status} - ${errorText}`);
      }

      const prediction = await response.json();

      // Sonuç çıktısını bekleme döngüsü (Polling)
      let predictionResult = prediction;
      while (predictionResult.status !== "succeeded" && predictionResult.status !== "failed") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const checkRes = await fetch(predictionResult.urls.get, {
          headers: { "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}` }
        });
        predictionResult = await checkRes.json();
      }

      if (predictionResult.status === "failed") {
        throw new Error("Görsel işleme modeli işlemi tamamlayamadı.");
      }

      // Üretilen çıktıyı Base64 olarak geri döndürme
      const outputUrl = Array.isArray(predictionResult.output) ? predictionResult.output[0] : predictionResult.output;
      const imgRes = await fetch(outputUrl);
      const arrayBuffer = await imgRes.arrayBuffer();
      const resultBase64 = Buffer.from(arrayBuffer).toString('base64');

      return res.status(200).json({ imageBase64: resultBase64 });
    }

    // EĞER SADECE TEXT PROMPT İLE SIFIRDAN RESİM ÜRETİLİYORSA
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        version: "ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4", // SDXL Text-to-Image
        input: { prompt: prompt }
      })
    });

    const prediction = await response.json();
    let predictionResult = prediction;

    while (predictionResult.status !== "succeeded" && predictionResult.status !== "failed") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const checkRes = await fetch(predictionResult.urls.get, {
        headers: { "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}` }
      });
      predictionResult = await checkRes.json();
    }

    if (predictionResult.status === "failed") {
      throw new Error("Görsel üretimi başarısız oldu.");
    }

    const outputUrl = Array.isArray(predictionResult.output) ? predictionResult.output[0] : predictionResult.output;
    const imgRes = await fetch(outputUrl);
    const arrayBuffer = await imgRes.arrayBuffer();
    const resultBase64 = Buffer.from(arrayBuffer).toString('base64');

    return res.status(200).json({ imageBase64: resultBase64 });

  } catch (error) {
    console.error("Image API Error:", error);
    return res.status(500).json({ 
      error: error.name === 'AbortError' 
        ? "Görsel işleme zaman aşımına uğradı. Lütfen daha küçük boyutlu bir resim deneyin." 
        : `Görsel işlenirken bir hata oluştu: ${error.message}` 
    });
  }
}
