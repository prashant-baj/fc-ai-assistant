// chatClient.js
const WebSocket = require('ws');

// 🔧 WebSocket API endpoint
const wsUrl = 'wss://0wwh4y6pd5.execute-api.ap-south-1.amazonaws.com/dev/';
const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('✅ Connected to chat.');
  sendUserInput(); // kick off interaction
});

ws.on('message', (data) => {
  // handle each chunk of message
  console.log('🤖 Reply:', data.toString());
});

ws.on('close', (code, reason) => {
  console.log(`🚪 Connection closed (${code}): ${reason || 'no reason'}`);
});

ws.on('error', (err) => {
  console.error('❌ Error:', err.message);
});

/**
 * Prompt user input in the console and send it to the API.
 * Keeps connection alive for streaming.
 */
function sendUserInput() {
  process.stdout.write('👤 Your message: ');

  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.once('data', (input) => {
    const userInput = input.trim();

    if (userInput.toLowerCase() === 'exit') {
      ws.close(1000, 'User closed the chat.');
      return;
    }

    const message = {
      action: 'message', // matches your route key
      message: userInput
    };
    ws.send(JSON.stringify(message));
    sendUserInput(); // prompt again
  });
}
