// chatClient.js
const WebSocket = require('ws');
const readline = require('readline');
const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

// 🔧 Your Cognito configuration
const REGION = 'ap-south-1';
const CLIENT_ID = '7vljlb5kmqj9oubnnion3uj6aq';
const USERNAME = 'prashant.baj@gmail.com';
const PASSWORD = 'Asdf1234#';

const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

async function getIdToken() {
  const command = new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: {
      USERNAME,
      PASSWORD,
    },
  });

  const response = await cognitoClient.send(command);
  const idToken = response.AuthenticationResult?.IdToken;

  if (!idToken) throw new Error('Authentication failed. No token returned.');
  return idToken;
}

async function startChat() {
  try {
    const token = await getIdToken();
    console.log('✅ Successfully authenticated.');
    //const wsUrl = `wss://0wwh4y6pd5.execute-api.ap-south-1.amazonaws.com/dev/`;
    const wsUrl = `wss://rm8vungag7.execute-api.ap-south-1.amazonaws.com/dev/`;

    const ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: token
      }
    });

    console.log('🔗 Connecting to secured chat at:', wsUrl);
    //const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log('✅ Connected to secured chat.');
      promptUser(ws);
    });

    ws.on('message', (data) => {
      console.log('🤖 Reply:', data.toString());
    });

    ws.on('close', (code, reason) => {
      console.log(`🚪 Connection closed (${code}): ${reason || 'no reason'}`);
    });

    ws.on('error', (err) => {
      console.error('❌ Error:', err);
    });

    process.on('SIGINT', () => {
      console.log('\nGracefully closing...');
      ws.close(1000, 'Client is closing');
      setTimeout(() => process.exit(0), 500);
    });
  } catch (error) {
    console.error('❌ Failed to start chat:', error.message);
  }
}

function promptUser(ws) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  function ask() {
    rl.question('👤 Your message: ', (input) => {
      const message = input.trim();
      if (message.toLowerCase() === 'exit') {
        ws.close(1000, 'User exited chat');
        rl.close();
        return;
      }

      ws.send(
        JSON.stringify({
          action: 'message',
          message,
          userId: '+918787878787',
        })
      );

      ask();
    });
  }

  ask();
}

// ▶️ Launch the secured chat client
startChat();
