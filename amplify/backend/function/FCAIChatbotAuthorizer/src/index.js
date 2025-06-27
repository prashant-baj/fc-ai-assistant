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
