import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Sadece POST istekleri kabul edilir');

  const { userId, imageBase64, prompt } = req.body;

  // 1. Supabase Limit Kontrolü (Görsel için)
  const { data: userLimit, error } = await supabase
    .from('user_limits')
    .select('image_usage_today, daily_image_limit')
    .eq('id', userId)
    .single();

  if (error || !userLimit) return res.status(401).json({ error: 'Kullanıcı bulunamadı.' });
  if (userLimit.image_usage_today >= userLimit.daily_image_limit) {
    return res.status(429).json({ error: 'Günlük görsel işleme limitinize ulaştınız.' });
  }

  try {
    // 2. Gemini API Görsel İsteği
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt || "Bu görselde ne görüyorsun?" },
            { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
          ]
        }]
      })
    });
    
    const data = await response.json();
    const aiResponseText = data.candidates[0].content.parts[0].text;

    // 3. Görsel Kullanımını 1 Arttır
    await supabase.rpc('increment_image_usage', { user_id: userId });

    res.status(200).json({ reply: aiResponseText });

  } catch (err) {
    res.status(500).json({ error: 'Görsel işlenirken hata oluştu.' });
  }
}
