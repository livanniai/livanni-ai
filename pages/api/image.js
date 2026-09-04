export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Sadece POST istekleri kabul edilir." });
  }

  try {
    const { prompt, image, imageBase64 } = req.body;
    const inputImage = image || imageBase64;

    if (!prompt && !inputImage) {
      return res.status(400).json({ error: "Lütfen bir metin (prompt) veya görsel girin." });
    }

    // Mobilya ve Kalite Odaklı Otomatik İngilizce İyileştirici Ekip
    let finalPrompt = prompt || "modern furniture in a beautiful interior design background, 8k resolution, professional photography";

    // Türkçe karakter ve genel detay iyileştirmesi
    finalPrompt = `${finalPrompt}, highly detailed, photorealistic, studio lighting, 4k resolution`;

    // Rastgele tohum (seed) üreterek her defasında farklı ve özgün resim basmasını sağlıyoruz
    const seed = Math.floor(Math.random() * 999999);
    
    // Pollinations FLUX Engine Endpoint
    const encodedPrompt = encodeURIComponent(finalPrompt);
    let imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;

    // Pollinations servisine istek atıyoruz
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Görsel üretici sunucusu hata döndürdü: ${response.statusText}`);
    }

    // Gelen resmi arrayBuffer olarak alıp Base64 formatına dönüştürüyoruz
    const arrayBuffer = await response.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");
    const resultBase64 = `data:image/jpeg;base64,${base64Image}`;

    return res.status(200).json({ 
      imageBase64: resultBase64,
      image: resultBase64 
    });

  } catch (error) {
    console.error("Görsel Üretim Hatası:", error);
    return res.status(500).json({ 
      error: "Görsel üretilirken bir hata oluştu: " + error.message 
    });
  }
}
