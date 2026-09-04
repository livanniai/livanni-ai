import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Sadece POST istekleri kabul edilir');

  // Token'ı alıp kullanıcıyı doğrulayalım
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Yetkilendirme tokenı bulunamadı.' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Kullanıcı bulunamadı.' });
  }

  const userId = user.id;
  const { prompt } = req.body;

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
    // 2. Doğrudan görsel üreten servis üzerinden resmi oluşturalım
    const encodedPrompt = encodeURIComponent(prompt || "A futuristic modern furniture design");
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`;

    // Görseli indirip base64 formatına çevirelim ki arayüzün beklediği formata tam uysun
    const imageRes = await fetch(imageUrl);
    const arrayBuffer = await imageRes.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    // 3. Görsel Kullanımını 1 Arttır
    await supabase.rpc('increment_image_usage', { user_id: userId });

    res.status(200).json({ imageBase64: base64Image });

  } catch (err) {
    res.status(500).json({ error: 'Görsel üretilirken hata oluştu: ' + err.message });
  }
}
