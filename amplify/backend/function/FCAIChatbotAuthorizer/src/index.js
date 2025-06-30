

/**
 * AWS Lambda Authorizer for validating JWT tokens issued by Amazon Cognito.
 * 
 * This function uses the `jsonwebtoken` and `jwks-rsa` libraries to verify JWT tokens
 * against the public keys provided by the Cognito User Pool. It generates an IAM policy
 * allowing or denying access based on the validity of the token.
 * 
 * Environment:
 * - Cognito User Pool ID and AWS Region are hardcoded.
 * 
 * @module FCAIChatbotAuthorizer
 */

 /**
  * Retrieves the signing key from the JWKS endpoint using the key ID from the JWT header.
  *
  * @param {Object} header - The JWT header containing the key ID (`kid`).
  * @param {Function} callback - Callback function to return the signing key or error.
  */
 
 /**
  * AWS Lambda handler function for the custom authorizer.
  *
  * @async
  * @param {Object} event - The Lambda event object containing request details.
  * @param {Object} event.headers - HTTP headers, expected to contain the Authorization token.
  * @param {Object} event.queryStringParameters - Query string parameters, may contain Authorization token.
  * @param {string} event.methodArn - The ARN of the API Gateway method being invoked.
  * @returns {Promise<Object>} The generated IAM policy document with context.
  */
 
 /**
  * Generates an IAM policy document for API Gateway.
  *
  * @param {string} principalId - The principal user identifier (e.g., Cognito user sub).
  * @param {string} effect - The effect for the policy ("Allow" or "Deny").
  * @param {string} resource - The ARN of the resource being accessed.
  * @param {Object} [context={}] - Additional context to include in the policy.
  * @returns {Object} The policy document.
  */
 
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const COGNITO_POOL_ID = 'ap-south-1_V8oTIQwmF';
const REGION = 'ap-south-1';
const client = jwksClient({
  jwksUri: `https://cognito-idp.${REGION}.amazonaws.com/${COGNITO_POOL_ID}/.well-known/jwks.json`
});

function getKey(header, callback) {
  console.log('Getting signing key for kid:', header.kid);
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      console.error('Error getting signing key:', err);
      callback(err);
      return;
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event));

  const token = event.headers?.Authorization || event.queryStringParameters?.Authorization;
  if (!token) {
    console.warn('No token found in headers or query params');
    return generatePolicy('user', 'Deny', event.methodArn, { error: 'Missing token' });
  }

  try {
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, getKey, { algorithms: ['RS256'] }, (err, decoded) => {
        if (err) {
          console.error('JWT verification failed:', err);
          return reject(err);
        }
        resolve(decoded);
      });
    });

    console.log('Decoded token:', decoded);

    return generatePolicy(decoded.sub, 'Allow', event.methodArn, {
      email: decoded.email || '',
      sub: decoded.sub
    });

  } catch (err) {
    return generatePolicy('user', 'Deny', event.methodArn, { error: 'Invalid token' });
  }
};

function generatePolicy(principalId, effect, resource, context = {}) {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: resource
      }]
    },
    context
  };

 
}
