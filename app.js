// app.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import authRouter from './services/auth.js';
import apiRouter from './services/contractService.js';
import apiRouterNew from './services/new_contract.js';

import { logger } from './utils/logger.js';
import { networkInterfaces } from 'os';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';

const logDirectory = path.resolve('logs');
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory);
}

const accessLogStream = fs.createWriteStream(path.join(logDirectory, 'access.log'), { flags: 'a' });

const app = express();
//const swaggerDocument = YAML.load('./utils/swagger.yaml');
const swaggerDocument = YAML.load('./utils/swagger-new.yaml')
app.use(cors());
app.use(bodyParser.json());
app.use(morgan('combined', { stream: accessLogStream }));
app.use(cors({
  origin: ['https://evoting-p0zm.onrender.com', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use('/auth', authRouter);
app.use('/api-old', apiRouter);
app.use('/api', apiRouterNew);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>E-Voting System</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <script>
        tailwind.config = {
          theme: {
            extend: {
              colors: {
                primary: '#2563eb',
              }
            }
          }
        }
      </script>
    </head>
    <body class="bg-gray-100 min-h-screen flex items-center justify-center p-4">
      <div class="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
        <h1 class="text-3xl font-bold text-primary mb-6">E-Voting System API</h1>
        <p class="text-gray-700 mb-8">Welcome to the E-Voting System backend API</p>
        <a href="/api-docs" class="bg-primary hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition duration-200 inline-block">
          View API & Documentation
        </a>
        <div class="mt-8 pt-6 border-t border-gray-200">
          <p class="text-sm text-gray-500">Powered by Express.js, Polygon POS and Swagger UI</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(`${req.method} ${req.url} - ${err.message}`);
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  const localUrl = `http://localhost:${PORT}/api-docs`;
  const networkUrl = `http://${getLocalIpAddress()}:${PORT}/api-docs`;
  console.log(`✅ Server accessible at:`);
  console.log(`- Local: ${localUrl}`);
  console.log(`- Network: ${networkUrl}`);
  logger.info(`Server started at ${localUrl}`);
  logger.info(`Server started at ${networkUrl}`);
});

function getLocalIpAddress() {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const interfaceInfo of interfaces[name]) {
      if (interfaceInfo.family === 'IPv4' && !interfaceInfo.internal) {
        return interfaceInfo.address;
      }
    }
  }
  return 'localhost';
}


