
/**
 * AWS Lambda handler to enrich product or FAQ data stored in S3 with text embeddings using Amazon Bedrock.
 * 
 * Expects an event with a JSON body containing:
 *   - bucket: S3 bucket name
 *   - key: S3 object key for the input JSON array
 *   - type: (optional) "product" or "faq" (default: "product")
 * 
 * Loads the array from S3, generates embeddings for each item, and saves the enriched array back to S3.
 * 
 * @param {object} event - The Lambda event object.
 * @param {string} event.body - JSON string with { bucket, key, type }.
 * @returns {Promise<object>} HTTP response with statusCode and body.
 */

/**
 * Parses the embedding response from Bedrock.
 * @param {Uint8Array|Buffer} responseBody - The response body from Bedrock.
 * @returns {Promise<Array<number>>} The embedding array.
 */

/**
 * Generates an embedding for the given text using Bedrock.
 * @param {string} text - The text to embed.
 * @param {BedrockRuntimeClient} bedrockClient - The Bedrock client instance.
 * @returns {Promise<Array<number>|null>} The embedding array, or null on failure.
 */

/**
 * Loads a JSON object from S3.
 * @param {S3Client} s3Client - The S3 client instance.
 * @param {string} bucket - The S3 bucket name.
 * @param {string} key - The S3 object key.
 * @returns {Promise<any>} The parsed JSON object.
 */

/**
 * Saves a JSON object to S3.
 * @param {S3Client} s3Client - The S3 client instance.
 * @param {string} bucket - The S3 bucket name.
 * @param {string} key - The S3 object key.
 * @param {any} data - The data to save.
 * @returns {Promise<void>}
 */

/**
 * Builds a text string from a product object for embedding.
 * @param {object} product - The product object.
 * @returns {string} The concatenated text for embedding.
 */

/**
 * Builds a text string from a FAQ object for embedding.
 * @param {object} faq - The FAQ object.
 * @returns {string} The concatenated text for embedding.
 */
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const path = require("path");

async function parseEmbeddingResponse(responseBody) {
  const jsonString = Buffer.from(responseBody).toString("utf-8");
  const parsed = JSON.parse(jsonString);
  return parsed.embedding;
}

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

async function loadJsonFromS3(s3Client, bucket, key) {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const stream = response.Body;
  const raw = await stream.transformToString();
  return JSON.parse(raw);
}

async function saveJsonToS3(s3Client, bucket, key, data) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data),
      ContentType: "application/json",
    })
  );
}

exports.handler = async (event) => {
  console.log("Event:", JSON.stringify(event));

  let bucket, key, type;
  try {
    ({ bucket, key, type = "product" } = JSON.parse(event.body || "{}"));
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body." }) };
  }

  if (!bucket || !key) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing bucket or key." }) };
  }

  const s3 = new S3Client({ region: "ap-south-1" });
  const bedrock = new BedrockRuntimeClient({ region: "ap-south-1" });

  let items;
  try {
    items = await loadJsonFromS3(s3, bucket, key);
    if (!Array.isArray(items)) {
      throw new Error("Data must be an array");
    }
  } catch (err) {
    console.error("Failed to load file:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to load input file" }) };
  }

  for (const item of items) {
    try {
      const text = type === "faq" ? buildTextFromFAQ(item) : buildTextFromProduct(item);
      console.log("Type:", type);
      console.log("Text:", text);
      const embedding = await generateEmbedding(text, bedrock);
      item.embedding = embedding;
    } catch (err) {
      console.error(`Embedding failed for item id=${item.id || item.productId}`, err);
    }
  }

  const baseName = path.basename(key, path.extname(key));
  const outputKey = `vectors/${baseName}-with-embeddings.json`;

  try {
    await saveJsonToS3(s3, bucket, outputKey, items);
  } catch (err) {
    console.error("Failed to save enriched file:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to write to S3" }) };
  }

  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
    },
    body: JSON.stringify({
      message: `Enriched ${type} data with embeddings saved.`,
      outputKey,
      itemCount: items.length,
    }),
  };
};

function buildTextFromProduct(product) {
  const parts = [];
  if (product.names) parts.push(...Object.values(product.names));
  if (product.shortDescription) parts.push(product.shortDescription);
  if (product.longDescription) parts.push(product.longDescription);

  const flattenTags = (cats) => cats?.flatMap((c) => [c.category, ...(c.tags || [])]) ?? [];

  parts.push(...flattenTags(product["primary-categories"]));
  parts.push(...flattenTags(product["other-categories"]));

  return parts.filter(Boolean).join(" | ");
}

function buildTextFromFAQ(faq) {
  return `${faq.question} | ${faq.answer}`;
}
