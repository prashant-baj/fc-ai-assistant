
/**
 * Identifies the intent(s) of a user's input text for the FarmChain app.
 * 
 * Uses AWS Bedrock's ConverseCommand to classify the input into one or more of the following intents:
 * - Greetings
 * - Gesture
 * - Feedback
 * - FindProduct
 * - Recipe
 * - Health
 * - GeneralKnowledge
 * - Agriculture
 * - FAQ
 * - Irrelevant
 * - Objectionable
 * - Harmful
 * 
 * Any message not related to fresh fruits and vegetables, or containing objectionable content,
 * is classified as "Irrelevant". If the message is about non-veg, fish, egg, meat, alcohol, wine,
 * tobacco, or other objectionable content, no text is returned.
 * 
 * @async
 * @function identifyIntents
 * @param {string} inputText - The user's input message to classify.
 * @returns {Promise<string[]>} - A promise that resolves to an array of intent strings.
 */
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
Greetings, Gesture, Feedback, FindProduct, Recipe, Health, GeneralKnowledge, Agriculture, FAQ, Irrelevant, Objectionable, Harmful.

Anything other than these intents which are related to fresh fruits and vegetables should be classified as "Irrelevant".
Do NOT return any text if the message is about non veg, fish, egg, eggs, meat, alcohol, wine, tobacco, or any other objectionable content.
Respond *only* with a JSON array of intent strings.
Example of Greetings: "Hello, how are you?" or Hi, "Good morning!".
Example of Gesture: "Thank you", "Thanks a lot", "I appreciate your help", "great", "nice", "good", "awesome", "fantastic", "excellent", "superb", "wonderful", "amazing".
Example of Feedback: "I like your app", "I love the service", "I am happy with the delivery", "I am satisfied with the product", "I am unhappy with the service", "I am disappointed with the quality", "I have a complaint about the delivery", "I have a suggestion for improvement", "your products are costly", "your products are expensive", "your products are cheap", "your products are affordable", "your products are of good quality", "your products are of bad quality", "your products are fresh", "your products are stale", "your products are rotten", "your products are spoiled", "your products are damaged", "your products are defective", "your products are not as described", "your products are not what I expected". etc etc`
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

  const allowedIntents = [
    "Greetings",
    "Gesture",
    "Feedback",
    "FindProduct",
    "Recipe",
    "Health",
    "GeneralKnowledge",
    "Agriculture",
    "FAQ",
    "Irrelevant",
    "Objectionable",
    "Harmful"
  ];



  let intents;
  try {
    intents = JSON.parse(text); // Parse into a JS array
    console.log("Parsed intents:", intents);
    // check if intents is an array and contains only allowed intents
    if (!Array.isArray(intents) || !intents.every(intent => allowedIntents.includes(intent))) {
      console.error("Invalid intents detected:", intents);
      intents = ["Irrelevant"];
    }       
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
