const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

// Helpers
async function streamToString(stream) {
    return new Promise((resolve, reject) => {
        let data = '';
        stream.on('data', chunk => data += chunk);
        stream.on('end', () => resolve(data));
        stream.on('error', reject);
    });
}

async function parseEmbeddingResponse(responseBody) {
    const jsonString = Buffer.from(responseBody).toString("utf-8");
    const parsed = JSON.parse(jsonString);
    return parsed.embedding;
}
/**
 * Calls Amazon Titan to generate embedding for input text.
 */
async function generateEmbedding(text, bedrockClient) {
    try {
        const command = new InvokeModelCommand({
            modelId: "amazon.titan-embed-text-v2:0",
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({ inputText: text }),
        });

        const response = await bedrockClient.send(command);
        const embedding = await parseEmbeddingResponse(response.body);
        return embedding;
    } catch (error) {
        console.error("Failed embedding for text:", text.slice(0, 80), error);
        return null;
    }
}

function cosineSimilarity(vecA, vecB) {
    const dot = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dot / (magA * magB);
}




exports.handler = async (event) => {
    console.log("Event:", JSON.stringify(event));

    const { bucket, key, query, intent  } = event;
   
    if (!bucket || !key || !query || !intent) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Missing 'bucket', 'key', or 'query'" })
        };
    }



    const minSimilarity = event.minSimilarity ?? 0.3;  // Default threshold
    const topK = event.topK ?? 10;

    const s3Client = new S3Client({ region: 'ap-south-1' });
    const bedrockClient = new BedrockRuntimeClient({ region: 'ap-south-1' });

    let rawData;
    try {
        const s3Data = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const raw = await streamToString(s3Data.Body);
        rawData = JSON.parse(raw);
    } catch (err) {
        console.error("Failed to load rawData:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to load rawData from S3." })
        };
    }

    // Step 2: Generate embedding for query
    let queryEmbedding;
    try {
        queryEmbedding = await generateEmbedding(query, bedrockClient);
    } catch (err) {
        console.error("Failed to generate embedding:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to generate embedding for query." })
        };
    }

    if (intent === "FindProduct") {

        const matches = rawData
            .filter(p => Array.isArray(p.embedding))
            .map(p => ({
                productId: p.productId,
                name: p.names?.english || "",
                similarity: cosineSimilarity(queryEmbedding, p.embedding)
            }))
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);

        console.log("product matches:", matches);
        const filteredMatches = matches
            .filter(match => match.similarity >= minSimilarity)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);
        console.log("filteredMatches:", filteredMatches);    
        return {
            statusCode: 200,
            body: JSON.stringify({ query, matches: filteredMatches }, null, 2)
        }

    }
    if (intent === "faq") {
    
        const scoredFaqs = rawData
    .filter(f => Array.isArray(f.embedding))
    .map(f => ({
      intent: "faq",
      id: f.id,
      title: f.question,
      answer: f.answer,
      similarity: cosineSimilarity(queryEmbedding, f.embedding)
    })).sort((a, b) => b.similarity - a.similarity)
             .slice(0, topK);

      
    
             console.log("scoredFaqs:", scoredFaqs); 
    const faqMatches = scoredFaqs
            .filter(scoredFaq => scoredFaq.similarity >= minSimilarity)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);
            console.log("faqMatches:", faqMatches); 


        return {
            statusCode: 200,
            body: JSON.stringify({ query, matches: scoredFaqs }, null, 2)
        }

    }



};
