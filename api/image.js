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
  const { prompt, image } = req.body;

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

  try {
    let base64Image = '';

    if (image) {
      // 🟢 DURUM 1: Fotoğraf Yüklendi -> Image-to-Image (Arka plan değiştirme, oda oluşturma, düzenleme)
      const cleanBase64 = image.includes(',') ? image.split(',')[1] : image;

      // Hugging Face üzerindeki Image-to-Image modeline gönderiyoruz
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
              prompt: prompt || "placed in a modern living room background, high quality",
              strength: 0.65 // 0.65 seviyesi ana objeyi korur, arka planı prompt'a göre yeniden çizer
            }
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Görsel düzenleme servisi hatası: ${errText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      base64Image = Buffer.from(arrayBuffer).toString('base64');

    } else {
      // 🔵 DURUM 2: Fotoğraf Yok -> Sıfırdan Resim Çiz (Text-to-Image)
      const randomSeed = Math.floor(Math.random() * 10000000);
      const encodedPrompt = encodeURIComponent(prompt || "A modern furniture design in a luxury room");
      const finalImageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${randomSeed}&model=flux`;

      const imageRes = await fetch(finalImageUrl);
      if (!imageRes.ok) throw new Error('Görsel üretme servisi yanıt vermedi.');

      const arrayBuffer = await imageRes.arrayBuffer();
      base64Image = Buffer.from(arrayBuffer).toString('base64');
    }

    // 3. Kullanım Limitini 1 Arttır
    await supabase.rpc('increment_image_usage', { user_id: userId });

    res.status(200).json({ imageBase64: base64Image });

  } catch (err) {
    console.error("Görsel İşleme Hatası:", err);
    res.status(500).json({ error: 'Görsel işlenirken bir hata oluştu: ' + err.message });
  }
}
