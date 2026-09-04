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

    // 🟢 DURUM 1: Kullanıcı Fotoğraf Yükledi ve Düzenleme İstedi (Image-to-Image)
    if (image) {
      // Base64 verisinin başındaki "data:image/png;base64," kısmını temizle
      const cleanBase64 = image.includes(',') ? image.split(',')[1] : image;

      // Gemini REST API Çağrısı (Vercel'deki GEMINI_API_KEY kullanılır)
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inline_data: {
                      mime_type: 'image/jpeg',
                      data: cleanBase64
                    }
                  },
                  {
                    text: `Edit this image according to this user prompt: "${prompt}". Maintain original composition and object structures unless asked to remove or modify. Return only the edited image.`
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: "image/jpeg"
            }
          })
        }
      );

      if (!geminiRes.ok) {
        const errData = await geminiRes.text();
        throw new Error(`Gemini API Hatası: ${errData}`);
      }

      const data = await geminiRes.json();
      
      // Gemini'dan gelen görsel verisini alma
      const imagePart = data.candidates?.[0]?.content?.parts?.find(p => p.inline_data);
      if (imagePart && imagePart.inline_data) {
        base64Image = imagePart.inline_data.data;
      } else {
        throw new Error('Gemini görsel çıktısı üretemedi.');
      }

    } else {
      // 🔵 DURUM 2: Fotoğraf Yok, Sıfırdan Çiz (Text-to-Image) -> Pollinations AI veya Gemini
      const randomSeed = Math.floor(Math.random() * 10000000);
      const cleanPrompt = encodeURIComponent(prompt || "A modern furniture design");
      const finalImageUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&nologo=true&seed=${randomSeed}&model=flux`;

      const imageRes = await fetch(finalImageUrl);
      if (!imageRes.ok) throw new Error('Görsel servisi yanıt vermedi.');

      const arrayBuffer = await imageRes.arrayBuffer();
      base64Image = Buffer.from(arrayBuffer).toString('base64');
    }

    // 3. Kullanım Limitini 1 Arttır
    await supabase.rpc('increment_image_usage', { user_id: userId });

    res.status(200).json({ imageBase64: base64Image });

  } catch (err) {
    console.error("Görsel İşleme Hatası:", err.message);
    res.status(500).json({ error: 'Görsel işlenirken bir hata oluştu: ' + err.message });
  }
}
