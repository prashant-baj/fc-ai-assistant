const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb'); // NEW
const { v4: uuidv4 } = require('uuid'); // NEW for unique message ids

const REGION = 'ap-south-1';
const lambdaClient = new LambdaClient({ region: REGION });
const dynamoClient = new DynamoDBClient({ region: REGION }); // NEW
const TABLE_NAME = 'fcaichatbotlogs-staging'; // NEW
//let userId = 'unknown'; // Default user ID if not provided

// Utility: Save a log record
async function logMessage(connectionId, role, content, userId) {
    const logItem = {
        connectionId: { S: connectionId },
        userId: { S: userId },
        messageId: { S: uuidv4() },
        timestamp: { N: Date.now().toString() },
        role: { S: role },
        content: { S: typeof content === 'string' ? content : JSON.stringify(content) }
    };
    try {
        await dynamoClient.send(new PutItemCommand({ TableName: TABLE_NAME, Item: logItem }));
    } catch (e) {
        console.error('Error writing to DynamoDB:', e);
    }
}

// Invoke a Lambda
async function invokeLambda(FunctionName, Payload) {
    const resp = await lambdaClient.send(new InvokeCommand({
        FunctionName,
        Payload: JSON.stringify(Payload)
    }));
    return JSON.parse(new TextDecoder().decode(resp.Payload));
}

// Send a WS message
async function sendWsMessage(endpoint, connectionId, message, userId) {
    try {
        console.log('Sending message:', message);
        const client = new ApiGatewayManagementApiClient({
            region: REGION,
            endpoint: `https://${endpoint}`
        });
        await client.send(new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: Buffer.from(JSON.stringify({ message }))
        }));
        // Log bot's reply
        await logMessage(connectionId, 'bot', message, userId); // NEW
    } catch (e) {
        console.error('Error sending WS message:', e);
    }
}

exports.handler = async (event) => {
    const body = JSON.parse(event.body);
    console.log('Received event:', JSON.stringify(event, null, 2));
    const message = body.message || '';
    const connectionId = event.requestContext.connectionId;
    const userId = body.userId || 'unknown';
    console.log('User ID:', this.userId); // Log user ID for debugging
    //userId = body.userId || 'unknown'; // Use authorizer if available

    if (!message || !connectionId) {
        return { statusCode: 400, body: JSON.stringify({ error: message }) };
    }

    // Log the user message
    await logMessage(connectionId, 'user', message, userId); // NEW

    const domainName = event.requestContext.domainName;
    const stage = event.requestContext.stage;
    const wsEndpoint = `${domainName}/${stage}`;

    try {
        await sendWsMessage(wsEndpoint, connectionId, "Processing your request...", userId);

        const intentResult = await invokeLambda('FCAIIntentAnalyserLambda-staging', { message });
        let intents = [];
        try {
            intents = JSON.parse(intentResult.body);
        } catch (e) {
            intents = ['Irrelevant'];
        }

        await sendWsMessage(wsEndpoint, connectionId, `Identified intents: ${intents}`, userId);

        if (intents.includes('Objectionable')) {
            return await sendWsMessage(wsEndpoint, connectionId, "Sorry, this topic is not allowed.", userId);
        }
        if (intents.includes('Irrelevant')) {
            return await sendWsMessage(wsEndpoint, connectionId, "Sorry, I can only help with fruits and vegetables.", userId);
        }

        // Vector search if required
        if (intents.includes('FindProduct') || intents.includes('FAQ')) {
            await sendWsMessage(wsEndpoint, connectionId, "Fetching products from catalog...", userId);
            const vectorResp = await invokeLambda('FCAIVectorSearchLambda-staging', {
                bucket: "fc-bedrock-kb",
                key: "vectors/catalogue-400601-with-embeddings.json",
                query: message,
                minSimilarity: 0.25,
                topK: 10
            });

            const result = JSON.parse(vectorResp.body);
            await sendWsMessage(wsEndpoint, connectionId, result.matches || [], userId);
            return {
                statusCode: 200,
                body: JSON.stringify({ status: "ok" })
            }
        }

        // General query
        await sendWsMessage(wsEndpoint, connectionId, "Processing your general query with LLM...");
        const generalResp = await invokeLambda('FCAIQueryLambda-staging', { message, intents });

        await sendWsMessage(wsEndpoint, connectionId, generalResp);
        const inner = JSON.parse(generalResp.body);

        if (inner.fnvList) {
            await sendWsMessage(wsEndpoint, connectionId, `Identified ingredients: ${inner.fnvList}`, userId);
            await sendWsMessage(wsEndpoint, connectionId, "Fetching matching products...", userId);
            const matches = await invokeLambda('FCAIVectorSearchLambda-staging', {
                bucket: "fc-bedrock-kb",
                key: "vectors/catalogue-400601-with-embeddings.json",
                query: `Identify these products: ${inner.fnvList}`,
                minSimilarity: 0.25,
                topK: 15
            });

            await sendWsMessage(wsEndpoint, connectionId, { response: inner, matches }, userId);
            return {
                statusCode: 200,
                body: JSON.stringify({ status: "ok" })
            }
        }
        // If no fnvList, just send the response
        await sendWsMessage(wsEndpoint, connectionId, generalResp.response || "No results.", userId);
        return {
            statusCode: 200,
            body: JSON.stringify({ status: "ok" })
        }
    } catch (error) {
        console.error('Error orchestrating:', error);
        await sendWsMessage(wsEndpoint, connectionId, "Internal error. Please try again.", userId);
        return {
            statusCode: 500,
            body: JSON.stringify({ status: "error" })
        }
    }
};
// Lambda handler for FCAI Chatbot   

// This Lambda orchestrates the chatbot flow, invoking other Lambdas and managing WebSocket connections
// It handles user messages, identifies intents, performs vector searches, and sends responses back to the client
// It also logs all messages to DynamoDB for auditing and debugging purposes
//
