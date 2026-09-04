import Jimp from 'jimp';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' });
  }

  try {
    const { prompt, image, imageBase64 } = req.body;
    const inputImage = image || imageBase64;

    // 1. DURUM: Resim Üzerine "Livanni" Yazısı / Filigran Ekleme (Pure JS Canvas / Jimp)
    if (inputImage) {
      const cleanBase64 = inputImage.includes(',') ? inputImage.split(',')[1] : inputImage;
      const imageBuffer = Buffer.from(cleanBase64, 'base64');

      // Görseli yükle
      const jimpImage = await Jimp.read(imageBuffer);

      // Metin için font yükle
      const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);

      const textToWrite = prompt && !prompt.toLowerCase().includes('üzerine') ? prompt : 'Livanni';

      // Metin genişliğini hesapla ve sağ alt köşeye hizala
      const textWidth = Jimp.measureText(font, textToWrite);
      const textHeight = Jimp.measureTextHeight(font, textToWrite, jimpImage.getWidth());

      const padding = 20;
      const x = jimpImage.getWidth() - textWidth - padding;
      const y = jimpImage.getHeight() - textHeight - padding;

      // Metni yaz
      jimpImage.print(font, Math.max(10, x), Math.max(10, y), textToWrite);

      // Buffer'a çevir ve Base64 dön
      const processedBuffer = await jimpImage.getBufferAsync(Jimp.MIME_PNG);
      const resultBase64 = processedBuffer.toString('base64');

      return res.status(200).json({ imageBase64: resultBase64 });
    }

    // 2. DURUM: Sıfırdan Görsel Üretme (Pollinations AI)
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt gereklidir.' });
    }

    const seed = Math.floor(Math.random() * 1000000);
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?seed=${seed}&width=1024&height=1024&nologo=true&model=flux`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

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
    return res.status(500).json({ error: `Hata oluştu: ${error.message}` });
  }
}
