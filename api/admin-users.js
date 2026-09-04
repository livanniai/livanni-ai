// Bu dosya sadece is_admin=true olan kullanıcılara kullanıcı listesini
// göstermeye ve limit güncellemeye izin verir.

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function requireAdmin(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return { error: "Giriş yapmalısın." };

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return { error: "Oturum geçersiz." };

  const { data: limitRow } = await supabaseAdmin
    .from("user_limits")
    .select("is_admin")
    .eq("id", userData.user.id)
    .single();

  if (!limitRow?.is_admin) return { error: "Bu sayfaya erişim yetkin yok." };

  return { userId: userData.user.id };
}

export default async function handler(req, res) {
  const authCheck = await requireAdmin(req);
  if (authCheck.error) {
    return res.status(403).json({ error: authCheck.error });
  }

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin
      .from("user_limits")
      .select("id, email, usage_today, daily_limit")
      .order("email");

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ users: data });
  }

  if (req.method === "POST") {
    const { userId, newLimit } = req.body;
    if (!userId || typeof newLimit !== "number") {
      return res.status(400).json({ error: "Geçersiz istek." });
    }

    const { error } = await supabaseAdmin
      .from("user_limits")
      .update({ daily_limit: newLimit })
      .eq("id", userId);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Desteklenmeyen metod." });
}
