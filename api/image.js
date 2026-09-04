import { createCanvas, loadImage } from '@napi-rs/canvas';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' });
  }

  try {
    const { prompt, image, imageBase64 } = req.body;
    const inputImage = image || imageBase64;

    // 1. DURUM: Resim Üzerine Yazı / Filigran Ekleme (Yerel Canvas İşlemi)
    if (inputImage) {
      const cleanBase64 = inputImage.includes(',') ? inputImage.split(',')[1] : inputImage;
      const imageBuffer = Buffer.from(cleanBase64, 'base64');

      const img = await loadImage(imageBuffer);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');

      ctx.drawImage(img, 0, 0);

      // Yazı boyutu ve stil ayarları
      const fontSize = Math.max(28, Math.floor(img.width * 0.05));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      const textToWrite = prompt && !prompt.toLowerCase().includes('üzerine') ? prompt : 'Livanni';

      // Sağ alt köşeye konumlandırma
      const textMetrics = ctx.measureText(textToWrite);
      const padding = fontSize * 0.8;
      const x = img.width - textMetrics.width - padding;
      const y = img.height - padding;

      ctx.fillText(textToWrite, x, y);

      const resultBase64 = canvas.toBuffer('image/png').toString('base64');
      return res.status(200).json({ imageBase64: resultBase64 });
    }

    // 2. DURUM: Sıfırdan Görsel Üretme (Text-to-Image via Pollinations AI)
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
      throw new Error(`Görsel oluşturma servisi yanıt vermedi (${imageResponse.status})`);
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const resultBase64 = Buffer.from(arrayBuffer).toString('base64');

    return res.status(200).json({ imageBase64: resultBase64 });

  } catch (error) {
    console.error("Image API Error:", error);
    return res.status(500).json({ error: `Hata oluştu: ${error.message}` });
  }
}
