import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Sadece POST istekleri kabul edilir');

  // Token'ı header'dan alıp kullanıcıyı doğrulayalım
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Yetkilendirme tokenı bulunamadı.' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Kullanıcı bulunamadı.' });
  }

  const userId = user.id;
  const { imageBase64, prompt } = req.body;

  // 1. Supabase Limit Kontrolü
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
    // 2. Google Imagen Görsel Üretim API İsteği
    const imagenResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [
          { prompt: prompt || "A high quality professional image" }
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio: "1:1",
          outputMimeType: "image/jpeg"
        }
      })
    });

    const data = await imagenResponse.json();
    if (data.error) throw new Error(data.error.message);

    // Üretilen görselin base64 verisini alıyoruz
    const generatedImageBase64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!generatedImageBase64) {
      throw new Error("Görsel verisi alınamadı.");
    }

    // 3. Görsel Kullanımını 1 Arttır
    await supabase.rpc('increment_image_usage', { user_id: userId });

    res.status(200).json({ imageBase64: generatedImageBase64 });

  } catch (err) {
    res.status(500).json({ error: 'Görsel üretilirken hata oluştu: ' + err.message });
  }
}
