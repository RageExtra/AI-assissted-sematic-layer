const request = require("http").request;

const data = JSON.stringify({
  "0": {
    "json": {
      "name": "test.txt",
      "fileType": "text/plain",
      "base64Data": Buffer.from("This is a test document with some text.").toString("base64")
    }
  }
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/trpc/semantic.uploadDocument?batch=1',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = request(options, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log(res.statusCode, body));
});

req.write(data);
req.end();
