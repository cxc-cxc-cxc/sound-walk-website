const http = require('http');
const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Healthcheck OK\n');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`==== HEALTHCHECK SERVER UP ON PORT ${port} ====`);
});
