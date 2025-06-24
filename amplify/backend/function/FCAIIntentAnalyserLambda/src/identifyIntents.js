// identifyIntents.js
const { BedrockRuntimeClient, ConverseCommand } = require("@aws-sdk/client-bedrock-runtime");

const client = new BedrockRuntimeClient({ region: "ap-south-1" });
const modelId = "arn:aws:bedrock:ap-south-1:383865785149:inference-profile/apac.amazon.nova-micro-v1:0";

async function identifyIntents(inputText) {
  const messages = [
    {
      role: "user",
      content: [{ text: inputText }]
    }
  ];

  const system = [
    {
      text: `
You are an intent classifier for a fresh fruits & vegetables app.
Classify the user's message into one or more of:
FindProduct, Recipe, Health, GeneralKnowledge, Agriculture, FAQ, Irrelevant, Objectionable.
Do NOT return any text if the message is about non veg, fish, egg, eggs, meat, alcohol, wine, tobacco, or any other objectionable content.
Respond *only* with a JSON array of intent strings.`
    }
  ];

  const command = new ConverseCommand({
    modelId,
    system,
    messages,
    inferenceConfig: { maxTokens: 50, temperature: 0.0 }
  });

  const response = await client.send(command);
  
  const text = response.output.message.content[0]?.text.trim();

  try {
    console.log("Response:", text);
    return text;
  } catch (err) {
    console.error("Parse error:", err, "raw:", text);
    return ["Irrelevant"];
  }
}

module.exports = { identifyIntents };
