import { GoogleGenAI } from '@google/genai';

const [, , model, mimeType, encodedAudio] = process.argv;
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('GEMINI_API_KEY is not set.');
  process.exit(2);
}

if (!model || !encodedAudio) {
  console.error('Usage: node gemini_transcribe.mjs <model> <mime-type> <base64-audio>');
  process.exit(2);
}

const ai = new GoogleGenAI({ apiKey });

try {
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              'Transcribe this health journal audio accurately. Return only the transcript text, with no diagnosis, advice, markdown, labels, or commentary.',
          },
          {
            inlineData: {
              mimeType: mimeType || 'audio/webm',
              data: encodedAudio,
            },
          },
        ],
      },
    ],
    config: {
      temperature: 0,
    },
  });

  const transcript = String(response.text || '').trim();
  if (!transcript) {
    console.error('Gemini returned an empty transcript.');
    process.exit(3);
  }
  process.stdout.write(JSON.stringify({ transcript }));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
