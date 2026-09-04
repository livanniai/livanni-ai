import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Sadece POST istekleri kabul edilir');

  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Oturum açılmamış veya token eksik.' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Kullanıcı bulunamadı veya oturum geçersiz.' });
    }

    const userId = user.id;
    const { messages, model } = req.body;
    
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'Mesaj içeriği boş olamaz.' });
    }

    // Supabase Limit Kontrolü
    const { data: userLimit, error: limitError } = await supabase
      .from('user_limits')
      .select('chat_usage_today, daily_chat_limit')
      .eq('id', userId)
      .single();

    if (limitError || !userLimit) {
      return res.status(401).json({ error: 'Kullanıcı limit bilgisi bulunamadı.' });
    }
    if (userLimit.chat_usage_today >= userLimit.daily_chat_limit) {
      return res.status(429).json({ error: 'Günlük sohbet limitinize ulaştınız.' });
    }

    let aiResponseText = "";

    if (model === 'llama') {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
        })
      });
      const data = await response.json();
      if (data.error) throw new Error("Groq API Hatası: " + (data.error.message || JSON.stringify(data.error)));
      aiResponseText = data.choices[0].message.content;
    } 
    else {
      // Güncel Gemini modeli
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          }))
        })
      });
      const data = await response.json();
      if (data.error) throw new Error("Gemini API Hatası: " + (data.error.message || JSON.stringify(data.error)));
      aiResponseText = data.candidates[0].content.parts[0].text;
    }

    await supabase.rpc('increment_chat_usage', { user_id: userId }); 

    return res.status(200).json({ reply: aiResponseText });

  } catch (err) {
    console.error("Detaylı Sunucu Hatası:", err);
    return res.status(500).json({ error: 'Sunucu Hatası: ' + err.message });
  }
}
