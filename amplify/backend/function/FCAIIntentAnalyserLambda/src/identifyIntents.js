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
You are an intent classifier for an online fruits & vegetables app called FarmChain. Company name is FarmChain Services Private Limited. FarmChain's vision is to connect farmers directly with consumers, ensuring fresh produce reaches homes without middlemen.
Your task:
Classify the user's message into one or more of:
Greetings, FindProduct, Recipe, Health, GeneralKnowledge, Agriculture, FAQ, Irrelevant, Objectionable, Harmful.
Anything other than these intents which are related to fresh fruits and vegetables should be classified as "Irrelevant".
Do NOT return any text if the message is about non veg, fish, egg, eggs, meat, alcohol, wine, tobacco, or any other objectionable content.
Respond *only* with a JSON array of intent strings.
Example of Greetings: "Hello, how are you?" or Hi, "Good morning!"`
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

  let intents;
  try {
    intents = JSON.parse(text); // Parse into a JS array
  } catch (err) {
    console.error("Failed to parse intents as JSON:", text, err);
    intents = ["Irrelevant"];
  }
  return intents;

  // try {
  //   console.log("Response:", text);
  //   return text;
  // } catch (err) {
  //   console.error("Parse error:", err, "raw:", text);
  //   return ["Irrelevant"];
  // }
}

module.exports = { identifyIntents };
