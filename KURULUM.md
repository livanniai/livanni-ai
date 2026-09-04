# Livanni AI Stüdyo — Kurulum Rehberi

Bu proje: kayıt/giriş sistemi olan, Claude ile sohbet + Gemini (Nano Banana)
ile görsel üretimi yapan bir site. Görsel üretiminde kullanıcı başı günlük
limit var (varsayılan 10), sen kendi admin panelinden bu limiti kullanıcı
bazında artırabiliyorsun.

## Elinde olması gerekenler
- GitHub hesabı
- Anthropic API key (console.anthropic.com)
- Gemini API key (aistudio.google.com/app/apikey)
- Supabase hesabı (supabase.com — ücretsiz, kayıt/giriş ve veritabanını o sağlıyor)

## Adım 1 — Supabase projesi oluştur
1. supabase.com adresine git, ücretsiz hesap aç
2. "New Project" de, bir isim ver (örnek: livanni-ai), şifre oluştur, bölge seç
3. Proje oluşunca sol menüden "SQL Editor" a gir
4. Bu projedeki `supabase-setup.sql` dosyasının tüm içeriğini kopyala,
   SQL Editor'e yapıştır, "Run" de — bu, kullanıcı/limit tablosunu oluşturur
5. Sol menüden "Settings" > "API" ya gir, şu üç değeri not al:
   - Project URL (örnek: https://xxxx.supabase.co)
   - anon public key
   - service_role key (BUNU KİMSEYLE PAYLAŞMA, tam yetkili)
6. Kendini admin yapmak için: siteye normal şekilde kayıt olduktan sonra,
   Supabase panelinde "Table Editor" > "user_limits" tablosuna gir,
   kendi satırında "is_admin" sütununu "true" yap

## Adım 2 — Kod içindeki iki dosyada Supabase bilgilerini gir
`public/index.html` ve `public/admin.html` dosyalarını aç, en üstteki
`<script>` kısmında şu satırları bul ve değiştir:

    const SUPABASE_URL = "SUPABASE_PROJE_URLINI_BURAYA_YAPISTIR";
    const SUPABASE_ANON_KEY = "SUPABASE_ANON_KEYINI_BURAYA_YAPISTIR";

Buraya Adım 1.5'te aldığın Project URL ve anon public key'i yapıştır.
(service_role key bu dosyalara GİRMEYECEK, o sadece backend'de kullanılacak.)

## Adım 3 — Kodu GitHub'a yükle
1. github.com'da "New repository" ile boş bir repo oluştur
2. Bu klasördeki tüm dosyaları o repoya yükle (GitHub Desktop ile
   sürükle-bırak en kolay yöntem)

## Adım 4 — Vercel'e bağla
1. vercel.com'a GitHub hesabınla giriş yap
2. "Add New..." > "Project", repoyu seç, "Import" de
3. "Deploy" de (ilk seferde hata verebilir, key'leri ekleyince düzelecek)

## Adım 5 — Vercel'de gizli key'leri ekle
Vercel projende "Settings" > "Environment Variables" kısmına şunları ekle:

    ANTHROPIC_API_KEY        → Anthropic'ten aldığın key
    GEMINI_API_KEY           → Gemini'den aldığın key
    SUPABASE_URL              → Supabase Project URL
    SUPABASE_SERVICE_ROLE_KEY → Supabase service_role key (gizli olan)

Ekledikten sonra "Deployments" sekmesinden en son deployment'ı
"Redeploy" et.

## Adım 6 — Test et
- Ana site: `senin-linkin.vercel.app` → kayıt ol, giriş yap, sohbet/görsel dene
- Admin panel: `senin-linkin.vercel.app/admin.html` → admin hesabınla gir,
  kullanıcı listesini ve limitleri gör/değiştir

## Notlar
- Yeni kayıt olan her kullanıcı otomatik olarak günde 10 görsel hakkıyla başlar
  (SQL dosyasındaki `daily_limit default 10` bunu ayarlıyor)
- Sen admin panelinden istediğin kullanıcının limitini istediğin sayıya çekebilirsin
- Sohbet (Claude) kısmında şu an limit yok — istersen ona da aynı mantıkla
  limit ekleyebiliriz, söylemen yeterli
