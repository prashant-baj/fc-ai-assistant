const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const path = require("path");

/**
 * Converts the Bedrock response body (Uint8Array) to string, then JSON.
 */
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

/**
 * Loads object from S3 and parses as JSON.
 */
async function loadJsonFromS3(s3Client, bucket, key) {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const stream = response.Body;
  const raw = await stream.transformToString(); // works in Lambda for Uint8Array or stream
  return JSON.parse(raw);
}

/**
 * Saves JSON to S3.
 */
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

/**
 * Lambda handler to enrich catalog with Titan embeddings.
 */
exports.handler = async (event) => {
  console.log("Event:", JSON.stringify(event));

  let bucket, key;
  try {
    ({ bucket, key } = JSON.parse(event.body || "{}"));
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body." }) };
  }

  if (!bucket || !key) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing bucket or key." }) };
  }

  const s3 = new S3Client({ region: "ap-south-1" });
  const bedrock = new BedrockRuntimeClient({ region: "ap-south-1" });

  let catalog;
  try {
    catalog = await loadJsonFromS3(s3, bucket, key);
    if (!Array.isArray(catalog)) {
      throw new Error("Catalog must be an array");
    }
  } catch (err) {
    console.error("Failed to load catalog:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to load catalog file" }) };
  }

  for (const product of catalog) {
    try {
      const text = buildTextFromProduct(product);
      const embedding = await generateEmbedding(text, bedrock);
      product.embedding = embedding;
    } catch (err) {
      console.error(`Embedding failed for productId=${product.productId}`, err);
    }
  }

  const baseName = path.basename(key, path.extname(key));
  const outputKey = `vectors/${baseName}-with-embeddings.json`;

  try {
    await saveJsonToS3(s3, bucket, outputKey, catalog);
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
      message: "Enriched catalog with embeddings saved.",
      outputKey,
      itemCount: catalog.length,
    }),
  };
};

/**
 * Creates an enriched string from product fields.
 */
function buildTextFromProduct(product) {
  const parts = [];
  if (product.names) {
    parts.push(...Object.values(product.names));
  }
  if (product.shortDescription) parts.push(product.shortDescription);
  if (product.longDescription) parts.push(product.longDescription);

  const flattenTags = (cats) =>
    cats?.flatMap((c) => [c.category, ...(c.tags || [])]) ?? [];

  parts.push(...flattenTags(product["primary-categories"]));
  parts.push(...flattenTags(product["other-categories"]));

  return parts.filter(Boolean).join(" | ");
}
