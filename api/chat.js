import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Sadece POST istekleri kabul edilir');

  const { userId, message, model } = req.body;

  // 1. Supabase Limit Kontrolü
  const { data: userLimit, error } = await supabase
    .from('user_limits')
    .select('chat_usage_today, daily_chat_limit')
    .eq('id', userId)
    .single();

  if (error || !userLimit) return res.status(401).json({ error: 'Kullanıcı bulunamadı veya oturum açılmamış.' });
  if (userLimit.chat_usage_today >= userLimit.daily_chat_limit) {
    return res.status(429).json({ error: 'Günlük sohbet limitinize ulaştınız.' });
  }

  try {
    let aiResponseText = "";

    // 2. Seçilen Modele Göre API İsteği
    if (model === 'llama') {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama3-70b-8192",
          messages: [{ role: "user", content: message }]
        })
      });
      const data = await response.json();
      aiResponseText = data.choices[0].message.content;
    } 
    else if (model === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: message }] }]
        })
      });
      const data = await response.json();
      aiResponseText = data.candidates[0].content.parts[0].text;
    }

    // 3. Kullanımı 1 Arttır
    await supabase.rpc('increment_chat_usage', { user_id: userId }); 

    res.status(200).json({ reply: aiResponseText });

  } catch (err) {
    res.status(500).json({ error: 'Yapay zeka ile iletişim kurulamadı.' });
  }
}
