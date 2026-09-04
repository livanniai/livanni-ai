import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Sadece POST istekleri kabul edilir." });
  }

  try {
    const { prompt, image, imageBase64 } = req.body;
    const inputImage = image || imageBase64;

    if (!inputImage) {
      return res.status(400).json({ error: "Lütfen düzenlenmesini istediğiniz görseli yükleyin." });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Base64 verisini temizleme
    const cleanBase64 = inputImage.replace(/^data:image\/(png|jpeg|webp);base64,/, "");

    const imagePart = {
      inlineData: {
        data: cleanBase64,
        mimeType: "image/jpeg"
      },
    };

    const userPrompt = prompt || "Bu mobilyayı koruyarak arka planını modern, lüks bir salon stüdyo ortamına çevir.";

    const result = await model.generateContent([
      userPrompt,
      imagePart
    ]);

    const response = await result.response;
    const textResponse = response.text();

    return res.status(200).json({
      reply: textResponse
    });

  } catch (error) {
    console.error("Görsel İşleme Hatası:", error);
    return res.status(500).json({ error: "İşlem sırasında bir hata oluştu: " + error.message });
  }
}
