const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

exports.handler = async (event) => {
  const { query } = event;
  if (!query) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing query" }) };
  }

  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

  const prompt = `
You are an AI assistant that returns structured data. Given a user message:
1. Identify intents as an array of strings. Intents can include FindProduct, Recipe, HealthAdvice.
2. If they ask for a recipe, produce:
- title
- ingredients: full list of ingredients including everything needed. 
- steps (as an array of short sentences)
- categoryFilter = "vegetables, fruits"
Output as strict JSON.

User message: ${query}`;

  try {
    const command = new InvokeModelCommand({
      modelId: "nova-pro",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({ input: prompt })
    });

    const response = await client.send(command);
    let payload = '';
    for await (const chunk of response.body) {
      payload += new TextDecoder('utf-8').decode(chunk); // decode the Uint8Array
    }

    const json = JSON.parse(payload.trim());
    return {
      statusCode: 200,
      body: JSON.stringify(json)
    };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
