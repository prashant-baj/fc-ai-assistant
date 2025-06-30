
/**
 * AWS Lambda handler for querying Bedrock model with intent-based prompts for a fruits & vegetables shop app.
 * 
 * This function receives a user message and a list of intents, builds a system prompt with intent-specific instructions,
 * sends the prompt to the Bedrock model, and returns a structured JSON response containing:
 * - "intent": list of intents
 * - "response": the model's answer
 * - "fnvList": list of fruits and vegetables mentioned
 * 
 * @param {Object} event - The Lambda event object.
 * @param {string} event.message - The user's input message.
 * @param {string[]} event.intents - List of detected intents (e.g., "Recipe", "Health", "Agriculture", "GeneralKnowledge", "Gesture").
 * @returns {Promise<Object>} The HTTP response object with statusCode and body (JSON string).
 */
// FCAIQueryLambda/index.js
const { BedrockRuntimeClient, ConverseCommand } = require("@aws-sdk/client-bedrock-runtime");

const client = new BedrockRuntimeClient({ region: "ap-south-1" });
const modelId = "arn:aws:bedrock:ap-south-1:383865785149:inference-profile/apac.amazon.nova-micro-v1:0";

// Utility to build the system prompt per intent
function buildSystemPrompt(intents) {
  // Base instruction
  let prompt = `
You are a helpful assistant for a fruits & vegetables shop app.
Your job is to respond accurately to the user's question based on the following intents:
${intents.join(", ")}
Produce a structured JSON output with:
- "intent": list of intents
- "response": your helpful answer
- "fnvList": list of fruits and vegetables you mention (empty if none)

Below are intent-specific instructions:
`;

  if (intents.includes("Recipe")) {
    prompt += `
Recipe:
Give a clear recipe as your answer.
Include all fruits and vegetables used as part of the ingredients in the fnvList.
`;
  }

  if (intents.includes("Health")) {
    prompt += `
Health:
Provide health benefits or nutritional information for fruits & vegetables.
Include any fruits or vegetables you mention in the fnvList.
`;
  }

  if (intents.includes("Agriculture")) {
    prompt += `
Agriculture:
Explain any agriculture practices related to fruits & vegetables.
Include any fruits or vegetables you mention in the fnvList.
`;
  }

  if (intents.includes("GeneralKnowledge")) {
    prompt += `
GeneralKnowledge:
Answer with general facts about fruits & vegetables only.
Include any fruits or vegetables you mention in the fnvList.
Do NOT include any non-vegetarian items like meat, fish, eggs, alcohol, wine or tobacco.
Do NOT include anything NOT related to fruits & vegetables, their benefits, usage, cultivation, etc.

`;
  }

  if (intents.includes("Gesture")) {
    prompt += `
Gesture:
You are acting as a customer service representative.
Respond to the user's gratitude, appreciation, disappointment or complaint etc.
Respond with a simple "Thank you!" or similar gesture.
If the gesture is related to fruits & vegetables, mention them.
If the gesture indicate disaapointment or complaint, acknowledge it politely and be apologetic.
Include any fruits or vegetables you mention in the fnvList.
Do NOT include any non-vegetarian items like meat, fish, eggs, alcohol, wine or tobacco.
Do NOT include anything NOT related to fruits & vegetables, their benefits, usage, cultivation, etc.

`;
  }

  prompt += `Please respond only with a valid JSON object.`;
  return prompt;
}

exports.handler = async (event) => {
  try {
    const { message, intents } = event;
    if (!message || !intents) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing 'message' or 'intents'." })
      };
    }

    const system = [{ text: buildSystemPrompt(intents) }];
    const messages = [{ role: "user", content: [{ text: message }] }];
    const commandParams = {
      modelId,
      system,
      messages,
      inferenceConfig: { maxTokens: 500, temperature: 0.7 }
    };
    console.log("Command parameters:", JSON.stringify(commandParams, null, 2));
    const command = new ConverseCommand(commandParams);

    const response = await client.send(command);
    const text = response.output.message.content[0]?.text?.trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.warn("JSON parse failed:", err, "raw:", text);
      parsed = { intent: intents, response: text, fnvList: [] };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(parsed)
    };
  } catch (error) {
    console.error("Error in FCAIQueryLambda:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
