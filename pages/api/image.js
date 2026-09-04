import Jimp from 'jimp';

// Gelen isteğin (yüksek çözünürlüklü görsel) limitini 10MB yapıyoruz
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST istekleri desteklenmektedir.' });
  }

  try {
    const { prompt, image, imageBase64 } = req.body || {};
    const inputImage = image || imageBase64;

    // 1. Görsel Üzerine Yazı Ekleme (Jimp)
    if (inputImage) {
      const cleanBase64 = inputImage.includes(',') ? inputImage.split(',')[1] : inputImage;
      const imageBuffer = Buffer.from(cleanBase64, 'base64');

      const jimpImage = await Jimp.read(imageBuffer);
      
      // Yüklenen görsel çok büyükse işleme kolaylığı için önce boyutunu makul bir seviyeye düşürelim (opsiyonel & güvenli)
      if (jimpImage.getWidth() > 2000 || jimpImage.getHeight() > 2000) {
        jimpImage.resize(2000, Jimp.AUTO);
      }

      const textToWrite = prompt && prompt.trim().length > 0 ? prompt : 'Livanni';

      const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
      const textWidth = Jimp.measureText(font, textToWrite);
      const textHeight = Jimp.measureTextHeight(font, textToWrite, jimpImage.getWidth());

      const padding = 25;
      const x = jimpImage.getWidth() - textWidth - padding;
      const y = jimpImage.getHeight() - textHeight - padding;

      const overlay = new Jimp(textWidth + 20, textHeight + 10, 0x00000088);
      jimpImage.composite(overlay, Math.max(10, x - 10), Math.max(10, y - 5));
      jimpImage.print(font, Math.max(10, x), Math.max(10, y), textToWrite);

      // Çıktıyı PNG yerine JPEG formatında ve %85 kalitede alarak yanıt boyutunu küçültüyoruz
      const processedBuffer = await jimpImage.quality(85).getBufferAsync(Jimp.MIME_JPEG);
      const resultBase64 = processedBuffer.toString('base64');

      return res.status(200).json({ imageBase64: `data:image/jpeg;base64,${resultBase64}` });
    }

    // 2. Yapay Zeka Görsel Üretimi (Pollinations)
    if (!prompt) {
      return res.status(400).json({ error: 'Lütfen bir görsel tarifi (prompt) girin.' });
    }

    const seed = Math.floor(Math.random() * 1000000);
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?seed=${seed}&width=1024&height=1024&nologo=true&model=flux`;

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Görsel üretme servisi yanıt vermedi (${imageResponse.status})`);
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const resultBase64 = Buffer.from(arrayBuffer).toString('base64');

    return res.status(200).json({ imageBase64: `data:image/jpeg;base64,${resultBase64}` });

  } catch (error) {
    return res.status(500).json({ error: `Görsel işlenirken hata oluştu: ${error.message}` });
  }
}
