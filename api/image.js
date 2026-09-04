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
  // Arayüzden gelen 'prompt' (metin) ve 'image' (varsa yüklenen fotoğraf URL'si veya base64)
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
    const randomSeed = Math.floor(Math.random() * 10000000);
    let finalImageUrl = '';

    // --- KONTROL BÖLÜMÜ ---
    if (image) {
      // 🟢 DURUM 1: Kullanıcı Fotoğraf Yükledi (Image-to-Image)
      // Yüklenen fotoğrafı ve kullanıcının isteğini yapay zekaya birlikte gönderiyoruz
      const cleanPrompt = encodeURIComponent(`${prompt}, keep original composition, add text or edit`);
      const encodedImageUrl = encodeURIComponent(image);
      
      // Fotoğraflı düzenleme bağlantısı
      finalImageUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?image=${encodedImageUrl}&width=1024&height=1024&nologo=true&seed=${randomSeed}&model=flux`;

    } else {
      // 🔵 DURUM 2: Fotoğraf Yok, Sıfırdan Resim Çiz (Text-to-Image)
      const cleanPrompt = encodeURIComponent(prompt || "A futuristic modern furniture design");
      
      // Sıfırdan resim çizme bağlantısı
      finalImageUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&nologo=true&seed=${randomSeed}&model=flux`;
    }

    // Görseli indirip Base64 formatına çevirme
    const imageRes = await fetch(finalImageUrl);
    
    if (!imageRes.ok) {
      throw new Error('Görsel servisi yanıt vermedi.');
    }

    const arrayBuffer = await imageRes.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    // 3. Kullanım Limitini 1 Arttır
    await supabase.rpc('increment_image_usage', { user_id: userId });

    // Başarılı sonucu döndür
    res.status(200).json({ imageBase64: base64Image });

  } catch (err) {
    res.status(500).json({ error: 'Görsel işlenirken bir hata oluştu: ' + err.message });
  }
}
