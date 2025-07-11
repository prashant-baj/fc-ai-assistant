

/**
 * AWS Lambda handler for FarmChain AI Chatbot WebSocket API.
 * 
 * Handles WebSocket events ($connect, $disconnect, message) for a chatbot, including:
 * - Logging messages to DynamoDB
 * - Invoking intent analysis and vector search Lambdas
 * - Sending structured responses to clients via API Gateway WebSocket
 * 
 * @module FCAIChatbotLambda
 * 
 * @requires @aws-sdk/client-lambda
 * @requires @aws-sdk/client-apigatewaymanagementapi
 * @requires @aws-sdk/client-dynamodb
 * @requires uuid
 * 
 * @function logMessage
 * @async
 * @param {string} connectionId - WebSocket connection ID.
 * @param {string} role - Role of the message sender ('user' or 'bot').
 * @param {string|object} content - Message content.
 * @param {string} userId - User identifier.
 * @returns {Promise<void>}
 * @description Logs a message to DynamoDB.
 * 
 * @function invokeLambda
 * @async
 * @param {string} FunctionName - Name of the Lambda function to invoke.
 * @param {object} Payload - Payload to send to the Lambda function.
 * @returns {Promise<object>} Parsed JSON response from the invoked Lambda.
 * @description Invokes another Lambda function and parses its response.
 * 
 * @function sendWsMessage
 * @async
 * @param {string} endpoint - WebSocket API endpoint.
 * @param {string} connectionId - WebSocket connection ID.
 * @param {object} structuredResponse - Structured response to send.
 * @param {string} userId - User identifier.
 * @returns {Promise<void>}
 * @description Sends a message to the client via WebSocket and logs it.
 * 
 * @function buildResponse
 * @param {object} options
 * @param {Array<object>} [options.clientLogic=[]] - Logic instructions for the client.
 * @param {Array<object>} [options.userMessages=[]] - Messages for the user.
 * @returns {object} Structured response object.
 * @description Utility to build structured JSON responses.
 * 
 * @function handler
 * @async
 * @param {object} event - Lambda event object from API Gateway WebSocket.
 * @returns {Promise<object>} API Gateway Lambda Proxy integration response.
 * @description Main Lambda handler for WebSocket events. Handles connection, disconnection, and message routing, including intent analysis, FAQ, product search, and general queries.
 */
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { v4: uuidv4 } = require('uuid');

const REGION = 'ap-south-1';
const lambdaClient = new LambdaClient({ region: REGION });
const dynamoClient = new DynamoDBClient({ region: REGION });
const TABLE_NAME = 'fcaichatbotlogs-staging';

async function logMessage(connectionId, role, content, userId) {
    try {
        const logItem = {
            connectionId: { S: connectionId },
            userId: { S: userId },
            messageId: { S: uuidv4() },
            timestamp: { N: Date.now().toString() },
            role: { S: role },
            content: { S: typeof content === 'string' ? content : JSON.stringify(content) }
        };
        console.debug('Writing to DynamoDB:', logItem);
        await dynamoClient.send(new PutItemCommand({ TableName: TABLE_NAME, Item: logItem }));
    } catch (e) {
        console.error('Error writing to DynamoDB:', e);
    }
}

async function invokeLambda(FunctionName, Payload) {
    console.debug(`Invoking ${FunctionName} with payload:`, Payload);
    const resp = await lambdaClient.send(
        new InvokeCommand({ FunctionName, Payload: JSON.stringify(Payload) })
    );
    const decoded = new TextDecoder().decode(resp.Payload);
    console.debug(`Received raw response from ${FunctionName}: ${decoded}`);
    return JSON.parse(decoded);
}

async function sendWsMessage(endpoint, connectionId, structuredResponse, userId) {
    try {
        const client = new ApiGatewayManagementApiClient({ region: REGION, endpoint: `https://${endpoint}` });
        const payload = JSON.stringify(structuredResponse);
        console.debug(`Sending WS message to ${connectionId}:`, structuredResponse);
        await client.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: Buffer.from(payload) }));
        await logMessage(connectionId, 'bot', structuredResponse, userId);
    } catch (e) {
        console.error('Error sending WS message:', e);
    }
}

// ✅ Utility to build structured JSON
function buildResponse({ clientLogic = [], userMessages = [] }) {
    return {
        response: {
            forClientLogic: clientLogic,
            forUser: userMessages
        }
    };
}

exports.handler = async (event) => {
    console.debug('Received event:', JSON.stringify(event));
    const body = JSON.parse(event.body || '{}');
    
    const connectionId = event.requestContext.connectionId;

    const routeKey = event.requestContext.routeKey;
    if (routeKey === '$connect') {
        console.log('✅ New client connected:', connectionId);
        // Optionally store connectionId to DynamoDB here
        return { statusCode: 200, body: 'Connected' };
    }

    if (routeKey === '$disconnect') {
        console.log('👋 Client disconnected:', connectionId);
        // Optionally remove connectionId from DB
        return { statusCode: 200, body: 'Disconnected' };
    }

    const { message = '', userId = 'unknown' } = body;


    console.debug('Incoming event:', { message, userId, connectionId });

    if (!message || !connectionId) {
        return { statusCode: 200, body: JSON.stringify({ ststus: 'Please input message' }) };
    }

    const domainName = event.requestContext.domainName;
    const stage = event.requestContext.stage;
    const wsEndpoint = `${domainName}/${stage}`;

    try {
        await logMessage(connectionId, 'user', message, userId);

        await sendWsMessage(
            wsEndpoint,
            connectionId,
            buildResponse({ userMessages: [{ messageType: 'message', messageValues: ['Processing your request...'] }] }),
            userId
        );

        const intentResp = await invokeLambda('FCAIIntentAnalyserLambda-staging', { message });
        let intents;
        try {
            intents = JSON.parse(intentResp.body);
        } catch (e) {
            console.warn('Error parsing intents, defaulting to Irrelevant:', e);
            intents = ['Irrelevant'];
        }

        if (intents.includes('Objectionable') || intents.includes('Harmful')) {
            await sendWsMessage(
                wsEndpoint,
                connectionId,
                buildResponse({ userMessages: [{ messageType: 'content', messageValues: ['Sorry, are you testing me? If you have any specific fedback, please contact FarmChain support'] }] }),
                userId
            );
            return { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };
        }



        if (intents.includes('Irrelevant')) {
            await sendWsMessage(
                wsEndpoint,
                connectionId,
                buildResponse({ userMessages: [{ messageType: 'content', messageValues: ['Sorry, I can only help with fruits and vegetables.'] }] }),
                userId
            );
            return { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };
        }

        if (intents.includes('Greetings')) {
            await sendWsMessage(
                wsEndpoint,
                connectionId,
                buildResponse({ userMessages: [{ messageType: 'message', messageValues: ['Hello.. how may i help you today?'] }] }),
                userId
            );

        }

        await sendWsMessage(
            wsEndpoint,
            connectionId,
            buildResponse({
                clientLogic: [{ messageType: 'intent', messageValues: intents.map(i => i.toLowerCase()) }],
                userMessages: [{ messageType: 'message', messageValues: [`As I understand, you're interested in information related to  ${intents.map(i => i.toLowerCase())}`] }]
            }),
            userId
        );

        if (intents.includes('FAQ')) {

            const vectorResp = await invokeLambda('FCAIVectorSearchLambda-staging', {
                bucket: "fc-bedrock-kb",
                key: "vectors/faq-with-embeddings.json",
                intent: "faq",
                query: message,
                minSimilarity: 0.2,
                topK: 2
            });
            console.debug('FAQ vector response:', vectorResp);
            const answers = JSON.parse(vectorResp.body).matches || [];
            console.debug('FAQ matches:', answers);
            await sendWsMessage(
                wsEndpoint,
                connectionId,
                buildResponse({ userMessages: [{ messageType: 'content', messageValues: answers.map((a) => a.answer) }] }),
                userId
            );
            return { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };
        }



        // ✅ Fetch Products
        if (intents.includes('FindProduct')) {
            await sendWsMessage(
                wsEndpoint,
                connectionId,
                buildResponse({ userMessages: [{ messageType: 'message', messageValues: ['Finding available products for you...'] }] }),
                userId
            );

            const vectorResp = await invokeLambda('FCAIVectorSearchLambda-staging', {
                bucket: "fc-bedrock-kb",
                key: "vectors/catalogue-400601-with-embeddings.json",
                intent: "FindProduct",
                query: message,
                minSimilarity: 0.25,
                topK: 10
            });

            const matches = JSON.parse(vectorResp.body).matches || [];
            if (matches.length === 0) {
                await sendWsMessage(
                    wsEndpoint,
                    connectionId,
                    buildResponse({ userMessages: [{ messageType: 'message', messageValues: ['No products found matching your query.'] }] }),
                    userId
                );
                return { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };
            }
            await sendWsMessage(
                wsEndpoint,
                connectionId,
                buildResponse({
                    clientLogic: [{ messageType: 'products', messageValues: matches.map((m) => m.productId) }],
                    userMessages: [{ messageType: 'message', messageValues: ['Here are some products you might like...'] }]
                }),
                userId
            );

            return { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };
        }

        // ✅ General Query
        // await sendWsMessage(
        //         wsEndpoint,
        //         connectionId,
        //         buildResponse({                    
        //             userMessages: [{ messageType: 'content', messageValues: ['generating response...'] }]
        //         }),
        //         userId
        //     );
        const generalResp = await invokeLambda('FCAIQueryLambda-staging', { message, intents });
        const inner = JSON.parse(generalResp.body || '{}');
        console.debug('General response:', inner);
        if (inner.fnvList) {
            const matches = await invokeLambda('FCAIVectorSearchLambda-staging', {
                bucket: "fc-bedrock-kb",
                key: "vectors/catalogue-400601-with-embeddings.json",
                intent: "FindProduct",
                query: `Identify these products: ${inner.fnvList}`,
                minSimilarity: 0.21,
                topK: 30
            });
            const productMatches = JSON.parse(matches.body).matches || [];
            console.debug('Matches from vector search:', productMatches);
            await sendWsMessage(
                wsEndpoint,
                connectionId,
                buildResponse({
                    clientLogic: [{ messageType: 'products', messageValues: productMatches.map((m) => m.productId) }],
                    userMessages: [{ messageType: 'content', messageValues: [inner.response || 'I couldnt fimnd much of information.. please try again..'] }]
                }),
                userId
            );

            return { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };
        }

        await sendWsMessage(
            wsEndpoint,
            connectionId,
            buildResponse({ userMessages: [{ messageType: 'message', messageValues: [generalResp.response || 'Here is what I found.'] }] }),
            userId
        );

        return { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };
    } catch (error) {
        console.error('Error orchestrating request:', error);
        await sendWsMessage(
            wsEndpoint,
            connectionId,
            buildResponse({ userMessages: [{ messageType: 'message', messageValues: ['Internal error. Please try again.'] }] }),
            userId
        );

        return { statusCode: 500, body: JSON.stringify({ status: 'error', error: error.message }) };
    }
};
