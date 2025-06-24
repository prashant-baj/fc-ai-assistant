// index.js
const { identifyIntents } = require('./identifyIntents'); // This would call Nova-Pro
// const { handleFindProduct } = require('./handlers/findProduct');
// const { handleRecipe } = require('./handlers/recipe');
// const { handleFAQ } = require('./handlers/faq');
// const { handleHealth } = require('./handlers/health');


exports.handler = async (event) => {
  const query = event.message;

  if (!query) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Query is required" })
    };
  }

  try {
    const intents = await identifyIntents(query); 
    //console.log("Identified intents:", intents, "Entities:", entities);
    let response;

    if (intents.includes('Objectionable')) {
      response = { message: "Sorry, this topic is not allowed." };
    } else if (intents.includes('Irrelevant')) {
      response = { message: "Sorry, I can only help with fruits and vegetables related queries." };
    } else if (intents.includes('FindProduct')) {
         response = { message: "I will find products" };
        //response = await handleFindProduct(query);
    } else if (intents.includes('Recipe')) {
        response = { message: "I will find recipes" };
        //response = await handleRecipe(query, entities?.ingredients || []);
    } else if (intents.includes('Agriculture')) {
        response = { message: "I will find agriculture information " };
        //response = await handleRecipe(query, entities?.ingredients || []);
    } else if (intents.includes('GeneralKnowledge')) {
        response = { message: "I will find general knowledge information " };
        //response = await handleRecipe(query, entities?.ingredients || []);
    } else if (intents.includes('FAQ')) {      
        response = { message: "I will find answers" };
        //response = await handleFAQ(query);
    } else if (intents.includes('Health')) {
        response = { message: "I will provide health information" };
        //response = await handleHealth(query);
    } else {
      response = { message: "Sorry, I couldn't understand your request." };
    }
    console.log("Response:", response);
    return {
      statusCode: 200,
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error("Error processing query:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" })
    };
  }
};
