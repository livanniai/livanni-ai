import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Sadece POST istekleri kabul edilir');

  // 1. Kullanıcı Token Doğrulama
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Yetkilendirme tokenı bulunamadı.' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Kullanıcı bulunamadı.' });
  }

  const userId = user.id;

  // Frontend'den gelebilecek farklı değişken isimlerini (image, selectedImage, imageData) tek tek kontrol ediyoruz
  const prompt = req.body.prompt;
  const image = req.body.image || req.body.selectedImage || req.body.imageData || req.body.file;

  // 2. Supabase Limit Kontrolü
  const { data: userLimit, error } = await supabase
    .from('user_limits')
    .select('image_usage_today, daily_image_limit')
    .eq('id', userId)
    .single();

  if (error || !userLimit) return res.status(401).json({ error: 'Kullanıcı limit bilgisi bulunamadı.' });
  if (userLimit.image_usage_today >= userLimit.daily_image_limit) {
    return res.status(429).json({ error: 'Günlük görsel işleme limitinize ulaştınız.' });
  }

  // 3. Fotoğraf Yüklenmediyse Kesin Hata Ver (Pollinations KESİNLİKLE YOK)
  if (!image) {
    return res.status(400).json({ error: 'Düzenlenecek resim backend tarafına ulaşmadı. Lütfen resmi tekrar yükleyin.' });
  }

  // 4. HuggingFace Token Kontrolü
  if (!process.env.HF_ACCESS_TOKEN) {
    return res.status(400).json({ error: 'Vercel ortamında HF_ACCESS_TOKEN bulunamadı.' });
  }

  try {
    const cleanBase64 = typeof image === 'string' && image.includes(',') ? image.split(',')[1] : image;

    // Yüklenen fotoğrafı alıp Stable Diffusion ile düzenleyen kısım
    const response = await fetch(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-refiner-1.0",
      {
        headers: {
          Authorization: `Bearer ${process.env.HF_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({
          inputs: cleanBase64,
          parameters: {
            prompt: prompt || "high quality image edit",
            strength: 0.65
          }
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HuggingFace İşleme Hatası: ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    // Limit Arttır
    await supabase.rpc('increment_image_usage', { user_id: userId });

    res.status(200).json({ imageBase64: base64Image });

  } catch (err) {
    console.error("Hata Detayı:", err.message);
    res.status(500).json({ error: 'Görsel işlenirken bir hata oluştu: ' + err.message });
  }
}
