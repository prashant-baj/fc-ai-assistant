Here’s a comprehensive README.md draft for your fc-ai-assistant backend project, including a clear architecture diagram (in text/markdown form). You can adjust the diagram or content as needed for your audience or for further detail.

---

# fc-ai-assistant

**An AI-powered, serverless shopping assistant backend using AWS Lambda, Amazon Bedrock, S3, DynamoDB, Cognito, and API Gateway.**

---

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture Diagram](#architecture-diagram)
- [Core Components](#core-components)
- [Knowledge Base Vectorization (RAG Pipeline)](#knowledge-base-vectorization-rag-pipeline)
- [Chat Application (Conversational AI)](#chat-application-conversational-ai)
- [How to Test](#how-to-test)
- [Project Structure](#project-structure)
- [Extending & Customizing](#extending--customizing)
- [License](#license)

---

## Project Overview

This backend project powers an AI-based shopping assistant, supporting Retrieval-Augmented Generation (RAG) for product search and conversational shopping. It leverages AWS managed services to provide secure, scalable, and serverless chat and knowledge base enrichment.

---

## Architecture Diagram

```mermaid
graph TD
  subgraph Knowledge Base Vectorization
    A[S3: Product Catalog JSON] --> B[FCAIKBSynchFunction (Lambda)]
    B --> C[Amazon Bedrock (Titan Embedding)]
    C --> B
    B --> D[S3: Vector Dump (Enriched JSON)]
  end

  subgraph AI Chat Assistant
    E[User/Client] -- Cognito Auth --> F[Amazon Cognito]
    E -- WebSocket API --> G[API Gateway (WebSocket)]
    G -- Lambda Authorizer --> H[FCAIChatbotAuthorizer (Lambda)]
    G -- Chat Event --> I[FCAIChatbotLambda (Lambda)]
    I -- DynamoDB Ops --> J[DynamoDB: Chat/Session]
    I -- Bedrock LLM --> K[Amazon Bedrock (LLM)]
    I -- Vector Search --> D
    I -- S3 Assets --> L[S3: Assets]
  end

  D -.-> I
```

---

## Core Components

### AWS Lambda Functions

- **FCAIKBSynchFunction**: Creates vector embeddings for catalog items using Amazon Bedrock and stores the enriched data in S3.
- **FCAIChatbotLambda**: Main chat logic, integrates Bedrock LLM for AI responses, fetches product info from the vector dump.
- **FCAIChatbotAuthorizer**: Custom Lambda for JWT/Cognito-based authorization of WebSocket connections.
- **FCAIIntentAnalyserLambda**: (Optional) Specialized intent classification for chat input.

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
   Main Lambda receives chat events, uses Bedrock LLM for responses, and performs vector searches on the S3-enriched catalog.
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

## Project Structure

```
amplify/backend/function/
  ├── FCAIKBSynchFunction/      # Vectorization Lambda
  ├── FCAIChatbotLambda/        # Main chat Lambda
  ├── FCAIChatbotAuthorizer/    # WebSocket/Lambda authorizer
  └── FCAIIntentAnalyserLambda/ # (Optional) Intent analysis
src/
  └── chatClient.js             # Node.js chat test client
```

---

## Extending & Customizing

- Swap or fine-tune the Bedrock models for different domains.
- Add new Lambda functions for additional AI flows.
- Integrate the backend with your web/mobile frontend using the same authentication and WebSocket protocol as the provided client.
- Use DynamoDB data for analytics or personalization.

