
# AI Shopping Assistant

**An AI-powered, serverless shopping assistant backend using AWS Lambda, Amazon Bedrock, S3, DynamoDB, Cognito, and API Gateway.**

**Objective of this architecture pattern that is purely based on lambda function to support a very cost effective solution to evolving use cases especially for early stage startups or where the RAG is performed on a smaller datasets.**

---

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture Diagram](#architecture-diagram)
- [Core Components](#core-components)
- [Knowledge Base Vectorization (RAG Pipeline)](#knowledge-base-vectorization-rag-pipeline)
- [Chat Application (Conversational AI)](#chat-application-conversational-ai)
- [How to Test](#how-to-test)
- [Live Demo](#live-demo-in-flutter-app-hosted-on-aws-amplify)
- [Project Structure](#project-structure)
- [Extending & Customizing](#extending--customizing)

---

## Project Overview

This backend project powers an AI-based shopping assistant, supporting Retrieval-Augmented Generation (RAG) for product search and conversational shopping. It leverages AWS managed services to provide secure, scalable, and serverless chat and knowledge base enrichment.

---

## Architecture Diagram

![Beautiful Sunset](arch.png "Sunset Image")

## Core Components

### APIs
- **FCAIKBSync** - REST API for invoking the vectorization process.
- **FCAIChatbot** - Websocket API for conversations.

### AWS Lambda Functions

- **FCAIKBSynchFunction**: Creates vector embeddings for catalog items using Amazon Bedrock Titan embeddings model and stores the enriched data in S3.
- **FCAIChatbotAuthorizer**: Custom Lambda for JWT/Cognito-based authorization of WebSocket connections.
- **FCAIChatbotLambda**: Main chat orechestrator that responds to websocket requests. It called underlying lambda functions based on the responsibility, formats the responses for the client app to consume and also logs the conversation events into dynamodb. Conversation logs contain uuid for each event, wss session id, userid, timestamp, user query and bot response.
- **FCAIIntentAnalyserLambda**: Identifies the intent of the user. It classifies the intent in one of the following intents:
- Intents
  - Greetings (e.g. hello, hi, howdy)
  - Gesture (e.g. thumbs up)
  - Feedback (e.g. thanks, thank you)
  - FindProduct (e.g Do you have spring onions? )
  - Recipe (e.g. What salad I make from hydroponic veggies? )
  - Health (e.g. Which fruits and vegetables can help in blood pressure?)
  - GeneralKnowledge (e.g. Why organic vegetables are expensive?)
  - Agriculture (e.g. How hydroponic veggies are grown?)
  - FAQ (e.g. Where are your farms? How to make payments?)
  - Irrelevant (e.g. Which car is fuel efficient?)
  - Objectionable
  - Harmful
- **FCAIQueryLambda**: Based on the intent and query, enriches the query with system prompt and generates the response using bedrock. Currently using nova-micro foundational model.
- **FCAIVectorSearchLambda**: This is a RAG based function that searches the relevant underlying vector database or dump. In this application, it reads the vector dump from S3. Currently it supports two knowledge bases i.e. Product Catalogues and FAQ.
If the results indicate some products those may be sold in store, it performs the cosine similarity search on the catalogue.
If the intent is FAQ and general queries, then it tries to get theinformation from FAQ dump. 

### AWS Services

- **Amazon Bedrock**: Provides both LLM (for chat) and embedding (for vectorization).
- **Amazon S3**: Stores input catalog, enriched vectors, and static assets.
- **Amazon DynamoDB**: Maintains chat history and session context.
- **Amazon Cognito**: Handles user authentication and token issuance.
- **API Gateway (WebSocket API)**: Real-time, bi-directional chat channel.

---

## Knowledge Base Vectorization (RAG Pipeline)

**Purpose:**  
Enhance your product catalog with AI-generated vector embeddings for fast semantic search and RAG-based responses.

**Workflow:**

1. **Input:** Upload your product catalog JSON to S3.
2. **API call:** Trigger the FCAIKBSynch API with the S3 bucket/key.
3. **Embedding:** Lambda loads the catalog, generates embeddings for each product via Amazon Bedrock, and writes back an enriched JSON to S3 under `vectors/`.
4. **Usage:** The chat Lambda later uses this vector dump for retrieval-augmented answers.

**Example API call:**
```json
{
  "bucket": "your-s3-bucket",
  "key": "catalog/products.json"
}
```

**Output:**  
`vectors/products-with-embeddings.json` in the same bucket.

---

## Chat Application (Conversational AI)

**Purpose:**  
Provide a secure, real-time, AI-powered shopping assistant to users.

**Workflow:**

1. **Authentication:**  
   Users authenticate via Cognito; JWT tokens are passed to the backend.
2. **WebSocket Connection:**  
   The client connects to API Gateway (WebSocket) with the token.
3. **Authorization:**  
   Lambda authorizer validates the JWT.
4. **Chat Logic:**  
   Main Lambda receives chat events, Orchestrates the queries and responses. Keeps sending responses in following format
   ```json
   {"response":{"forClientLogic":[],"forUser":[{"messageType":"message","messageValues":["Processing your request..."]}]}}

   {"response":{"forClientLogic":[{"messageType":"intent","messageValues":["findproduct"]}],"forUser":[{"messageType":"message","messageValues":["As I understand, you're interested in information related to  findproduct"]}]}}

   {"response":{"forClientLogic":[{"messageType":"products","messageValues":["FCR0039","FCRZM0118","FCRZM0126","FCR0016","FCR0041","FCR0044","FCR0012","FCR0034","FCR0027","FCRZM0115","FCR0057","FCR0065","FCR0007","FCRZM0120","FCR0064","FCRZM0123"]}],
   "forUser":[{"messageType":"content","messageValues":["A carrot and beetroot salad is packed with health benefits. Carrots are rich in beta-carotene, which is great for your vision and immune system. They also contain fiber and antioxidants. Beetroots are excellent for heart health due to their high nitrate content, which can improve blood flow and lower blood pressure. They are also rich in folate, manganese, and potassium."]}]}}

    ```
    - forClient messages are expected to be used by client application to perform some logic based on messageType and values.
    - forUser messages of type "message" are expected to be used to inform users.
    - forUser messages of type "content" are expected to be shown to inform users as main content

5. **Persistence:**  
   Chat and session data stored in DynamoDB.

**Client Example:**  
`src/chatClient.js` provides a Node.js CLI client for local testing and demonstration.

---

## How to Test

### Prerequisites

- Node.js ≥ 14.x
- AWS credentials with permissions for Lambda, Bedrock, S3, Cognito, DynamoDB, and API Gateway
- Cognito user pool and users set up

### 1. Prepare Knowledge Base

- Upload your product catalog JSON to S3.
- Trigger the vectorization API:
  - (This can be done via API Gateway, AWS Console, or AWS CLI.)

### 2. Run Chat Client

1. Install dependencies:
   ```bash
   npm install ws readline @aws-sdk/client-cognito-identity-provider
   ```
2. Edit `src/chatClient.js`:
   - Set your Cognito `REGION`, `CLIENT_ID`, `USERNAME`, and `PASSWORD`.

3. Run:
   ```bash
   node src/chatClient.js
   ```

4. Type messages in the terminal; type `exit` to quit.

---

## Live Demo in Flutter app hosted on AWS Amplify
For Live demo please use below link - 
- https://fc-ai-assistant.d3gbfa04s89ewa.amplifyapp.com/
- Use below test credentials 
    - use mobile number - +91 8787878787
    - use pincode - 400601
    - use verification code (OTP) - 123456
- Navogate to Chat page. Last icon on bottom navigation bar.
- Try it.. add some products to cart within the chat window. 
- On the top right hit the bag icon and jump to Checkout

## Project Structure

```
amplify/backend/function/
  ├── FCAIKBSynchFunction/      # Vectorization Lambda
  ├── FCAIChatbotLambda/        # Main chat Lambda
  ├── FCAIChatbotAuthorizer/    # WebSocket/Lambda authorizer
  ├── FCAIIntentAnalyserLambda/ # Intent analysis
  ├── FCAIQueryLambda/          # Queries LLM
  ├── FCAIVectorSearchLambda/   # Finds the relevant content from vector dump.
src/
  └── chatClient.js             # Node.js chat test client
```

---

## Extending & Customizing

- Swap or fine-tune the Bedrock models for different domains.
- Add new Lambda functions for additional AI flows.
- Integrate the backend with your web/mobile frontend using the same authentication and WebSocket protocol as the provided client.
- Use DynamoDB data for analytics or personalization.

---

