// backend (/api/image.js) örneği
export async function handler(event, context) {
  try {
    const { prompt, imageBase64 } = JSON.parse(event.body);

    // Pollinations URL tabanlı dinamik istek gönderimi
    // Prompt ve model parametreleri URL üzerinden iletilir
    const encodedPrompt = encodeURIComponent(prompt || "improve furniture background, studio light, 4k");
    
    // Eğer mevcut bir görsel yüklendiyse prompt'a stil ve img-to-img komutları eklenir
    let apiUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;

    const response = await fetch(apiUrl);
    const arrayBuffer = await response.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: `data:image/jpeg;base64,${base64Image}`
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}
