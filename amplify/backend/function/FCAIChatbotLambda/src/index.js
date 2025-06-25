const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');

const REGION = 'ap-south-1';
const lambdaClient = new LambdaClient({ region: REGION });

async function invokeLambda(FunctionName, Payload) {
  const resp = await lambdaClient.send(new InvokeCommand({ 
    FunctionName, 
    Payload: JSON.stringify(Payload) 
  }));
  return JSON.parse(new TextDecoder().decode(resp.Payload));
}

async function sendWsMessage(endpoint, connectionId, message) {
  try{
    //const client = new ApiGatewayManagementApiClient({ endpoint });
  console.log("Sending message:", message);
  const client = new ApiGatewayManagementApiClient({
            region: "ap-south-1", // or your region
            endpoint: `https://0wwh4y6pd5.execute-api.ap-south-1.amazonaws.com/dev`
        });
  await client.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: Buffer.from(JSON.stringify({ message }))
  }));

  } catch (e) {
    console.error(e);
  }
  
}


exports.handler = async (event) => {
  //const {connectionId, domainName, stage } = event;
  //const { action, message } = JSON.parse(event.body);
  const body = JSON.parse(event.body); 
    const message = body.message || '';
    const connectionId = event.requestContext.connectionId;
    console.log("Received event:", JSON.stringify(body, null, 2));
  if (!message || !connectionId) {
    const eventStr = JSON.stringify(event, null, 2);
    return { statusCode: 400, body: JSON.stringify({ error: message }) };
  }
  console.log("About to process");
  const domainName = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  
  const wsEndpoint = `${domainName}/${stage}`;
  console.log(wsEndpoint);
  try {
    // Interm 1
    await sendWsMessage(wsEndpoint, connectionId, "Processing your request...");

    // 1. Get intents
    const intentResult = await invokeLambda('FCAIIntentAnalyserLambda-staging', { message });
    console.log("Intents:", intentResult);
    let intents = [];
    try {
      intents = JSON.parse(intentResult.body); // parses into a real array
    } catch (e) {
      console.error('Error parsing intents:', e, intentResult.body);
      intents = ['Irrelevant'];
    }
    
    await sendWsMessage(wsEndpoint, connectionId, `Identified intents: ${intents}`);

    if (intents.includes('Objectionable')) {
      return await sendWsMessage(wsEndpoint, connectionId, "Sorry, this topic is not allowed.");
    }
    if (intents.includes('Irrelevant')) {
      return await sendWsMessage(wsEndpoint, connectionId, "Sorry, I can only help with fruits and vegetables.");
    }

    // 2. Handle vector queries
    if (intents.includes('FindProduct') || intents.includes('FAQ')) {
      await sendWsMessage(wsEndpoint, connectionId, "Fetching products from catalog...");
      const vectorResp = await invokeLambda('FCAIVectorSearchLambda-staging', {
        bucket: "fc-bedrock-kb",
        key: "vectors/catalogue-400601-with-embeddings.json",
        query: message,
        minSimilarity: 0.25,
        topK: 10
      });

      const result = JSON.parse(vectorResp.body);

      return await sendWsMessage(wsEndpoint, connectionId, result.matches || []);
    }

    // 3. Handle general query
    await sendWsMessage(wsEndpoint, connectionId, "Processing your general query with LLM...");
    const generalResp = await invokeLambda('FCAIQueryLambda-staging', { message, intents });

    await sendWsMessage(wsEndpoint, connectionId, generalResp);
    console.log("GeneralResp:", generalResp);
    const inner = JSON.parse(generalResp.body);
    console.log("Inner:", inner);
    console.log(inner.fnvList);
    if (inner.fnvList) {
      await sendWsMessage(wsEndpoint, connectionId, `Identified ingredients: ${inner.fnvList}`);
      await sendWsMessage(wsEndpoint, connectionId, "Fetching matching products...");
      const matches = await invokeLambda('FCAIVectorSearchLambda-staging', {
        bucket: "fc-bedrock-kb",
        key: "vectors/catalogue-400601-with-embeddings.json",
        query: `Identify these products: ${inner.fnvList}`,
        minSimilarity: 0.25,
        topK: 15
      });
      console.log("Matches:", matches);
       await sendWsMessage(wsEndpoint, connectionId, {
        response: inner,
        matches: matches
      });
      return {
        statusCode: 200,
        body: JSON.stringify({ status: "ok" })
      }
    }

    // Fallback
    await sendWsMessage(wsEndpoint, connectionId, generalResp.response || "No results.");
    return {
      statusCode: 200,
      body: JSON.stringify({ status: "ok" })
    }
  } catch (error) {
    console.error('Error orchestrating:', error);
    await sendWsMessage(wsEndpoint, connectionId, "Internal error. Please try again.");
    return {
      statusCode: 500,
      body: JSON.stringify({ status: "error" })
    }
  }
};
