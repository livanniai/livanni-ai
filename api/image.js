export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' });
  }

  // Vercel'deki HF_ACCESS_TOKEN değişkenini okuyoruz
  const token = process.env.HF_ACCESS_TOKEN || process.env.HF_TOKEN;

  if (!token) {
    return res.status(401).json({ 
      error: 'Vercel ortam değişkenlerinde HF_ACCESS_TOKEN bulunamadı. Lütfen Vercel panelini kontrol edin.' 
    });
  }

  try {
    const { prompt, image, imageBase64 } = req.body;
    const inputImage = image || imageBase64;

    if (!prompt && !inputImage) {
      return res.status(400).json({ error: 'Prompt veya görsel gereklidir.' });
    }

    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    let response;

    // 1. DURUM: Resim Düzenleme (Image-to-Image)
    if (inputImage) {
      const cleanBase64 = inputImage.includes(',') ? inputImage.split(',')[1] : inputImage;

      response = await fetch(
        "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-refiner-1.0",
        {
          method: "POST",
          headers: headers,
          body: JSON.stringify({
            inputs: prompt || "modify image",
            parameters: {
              image: cleanBase64
            }
          }),
        }
      );
    } 
    // 2. DURUM: Sıfırdan Resim Üretme (Text-to-Image)
    else {
      response = await fetch(
        "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
        {
          method: "POST",
          headers: headers,
          body: JSON.stringify({ inputs: prompt }),
        }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      
      if (response.status === 503) {
        return res.status(503).json({ error: "Model yükleniyor, lütfen 10 saniye sonra tekrar deneyin." });
      }

      throw new Error(`Hugging Face API Hatası (${response.status}): ${errorText}`);
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
