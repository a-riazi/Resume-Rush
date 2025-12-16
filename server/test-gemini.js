require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  try {
    console.log('Checking available models...\n');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Try different model names
    const modelsToTry = [
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-pro'
    ];
    
    for (const modelName of modelsToTry) {
      try {
        console.log(`Trying ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Say 'works!'");
        const text = result.response.text();
        
        console.log(`✓ SUCCESS with ${modelName}!`);
        console.log('Response:', text);
        console.log('\n✓ API is working correctly!');
        return;
      } catch (err) {
        console.log(`✗ ${modelName} failed:`, err.message.split('\n')[0]);
      }
    }
    
    console.log('\n✗ None of the models worked. Check your API key.');
  } catch (error) {
    console.error('\n✗ ERROR:', error.message);
  }
}

listModels();
