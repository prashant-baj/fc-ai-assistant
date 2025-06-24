// intentAnalyser.js
const { identifyIntents } = require('./identifyIntents');

exports.handler = async (event) => {
  const query = event.message;
  if (!query) {
    return { statusCode: 400, body: JSON.stringify({ error: "Query is required" }) };
  }

  try {
    const intents = await identifyIntents(query); // intents is a JS array
    return {
      statusCode: 200,
      body: JSON.stringify(intents) // JSON.stringify converts JS array → JSON array
    };
  } catch (error) {
    console.error("Error identifying intents:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
