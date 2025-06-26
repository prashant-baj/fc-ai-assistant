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
    const body = JSON.parse(event.body || '{}');
    const { message = '', userId = 'unknown' } = body;
    const connectionId = event.requestContext.connectionId;

    console.debug('Incoming event:', { message, userId, connectionId });

    if (!message || !connectionId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
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
                buildResponse({ userMessages: [{ messageType: 'message', messageValues: ['Sorry, this is objectionable or harmful. Testing me or using information on such topics may atrract legal action '] }] }),
                userId
            );
            return { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };
        }

        

        if (intents.includes('Irrelevant')) {
            await sendWsMessage(
                wsEndpoint,
                connectionId,
                buildResponse({ userMessages: [{ messageType: 'message', messageValues: ['Sorry, I can only help with fruits and vegetables.'] }] }),
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
            await sendWsMessage(
                wsEndpoint,
                connectionId,
                buildResponse({ userMessages: [{ messageType: 'message', messageValues: ['Sorry... At the moment I am not able to address this question.'] }] }),
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
                query: `Identify these products: ${inner.fnvList}`,
                minSimilarity: 0.25,
                topK: 15
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
