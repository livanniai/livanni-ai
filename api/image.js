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

    // 1. DURUM: Yüklenen Görseli Düzenleme (Image-to-Image / Inpainting)
    if (inputImage) {
      const cleanBase64 = inputImage.includes(',') ? inputImage.split(',')[1] : inputImage;

      // Hugging Face JSON Formatlı Img2Img / Inpainting İsteği
      response = await fetch(
        "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-refiner-1.0",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: prompt || "add text livanni",
            parameters: {
              image: cleanBase64,
              strength: 0.5
            }
          }),
        }
      );
    } 
    // 2. DURUM: Sıfırdan Görsel Üretme (Text-to-Image)
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
        }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();

      if (response.status === 503) {
        return res.status(503).json({ 
          error: "Model şu an hazırlanıyor (uyanıyor), lütfen 10 saniye sonra tekrar deneyin." 
        });
      }

      // Eğer SDXL Refiner 400 verirse alternatif hafif Img2Img modeline düş
      if (inputImage && response.status === 400) {
        const fallbackRes = await fetch(
          "https://api-inference.huggingface.co/models/timbrooks/instruct-pix2pix",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              inputs: prompt || "write livanni on image",
              parameters: { image: inputImage.includes(',') ? inputImage.split(',')[1] : inputImage }
            }),
          }
        );

        if (fallbackRes.ok) {
          const fbBuffer = await fallbackRes.arrayBuffer();
          const fbBase64 = Buffer.from(fbBuffer).toString('base64');
          return res.status(200).json({ imageBase64: fbBase64 });
        }
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
