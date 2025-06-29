// generalQueryHandler.js
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');

// Bedrock client setup
const client = new BedrockRuntimeClient({ region: "ap-south-1" });
// You can change this model ARN or profile ARN if you prefer Claude or another model
const modelId = "anthropic.claude-3-sonnet-20240229-v1:0";

module.exports = async function generalQueryHandler({ query, intent }) {
  // Craft a system prompt with clear JSON output instructions
  const system = [
    {
      text: `
You are an AI assistant specialized in fruits & vegetables representing FarmChain Services Private Limited. Company name is FarmChain Services Private Limited. FarmChain's vision is to connect farmers directly with consumers, ensuring fresh produce reaches homes without middlemen. 

User's intent: ${intent}

Your task:
1. Answer the user query helpfully and clearly.
2. Identify any fruits and vegetables mentioned in the conversation.
3. Your response, recipe, health related information or any information etc MUST NOT include any content related to non-vegetarian items like meat, chicken, mutton, beef, pork, shrimp, fish, eggs, alcohol, wine or tobacco.
4. If the query includes about Jain recipe or food, do not include onion, potato, garlic, ginger, carrot, beetroot, mushroom like items in your response.
5. Return the results as a strict JSON object with:
  {
    "response": "<your answer>",
    "fnvList": ["Fruit1","Veg1","Fruit2"]
  }

If none mentioned, return an empty list for "fnvList".

Respond only with JSON and nothing else.
JSON must not be a nested with another JSON object`
    }
  ];

  const messages = [
    {
      role: "user",
      content: [{ text: query }]
    }
  ];

  const command = new ConverseCommand({
    modelId,
    system,
    messages,
    inferenceConfig: {
      maxTokens: 500,
      temperature: 0.3,
    }
  });

  try {
    const response = await client.send(command);
    const raw = response.output.message.content[0]?.text.trim();
    console.log("Raw LLM response:", raw);

    // Parse the JSON string response
    const parsed = JSON.parse(raw);
    return {
      response: parsed.response || "I'm not sure how to help.",
      fnvList: Array.isArray(parsed.fnvList) ? parsed.fnvList : []
    };
  } catch (err) {
    console.error("Error in generalQueryHandler:", err);
    return { response: "Sorry, I couldn't process your request.", fnvList: [] };
  }
};
