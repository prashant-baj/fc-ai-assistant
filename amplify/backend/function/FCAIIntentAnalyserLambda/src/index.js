/**
 * AWS Lambda handler for intent analysis.
 *
 * Receives an event containing a `message` property, analyzes the message to identify intents,
 * and returns the identified intents as a JSON array.
 *
 * @async
 * @function handler
 * @param {Object} event - The Lambda event object.
 * @param {string} event.message - The user's query to analyze.
 * @returns {Promise<Object>} The HTTP response object containing statusCode and body.
 *   - On success: { statusCode: 200, body: JSON.stringify(intents) }
 *   - On missing query: { statusCode: 400, body: JSON.stringify({ error: "Query is required" }) }
 *   - On error: { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) }
 */
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
