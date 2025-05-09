import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import authRouter from './auth.js';
import apiRouter from './contractService.js';
import 'dotenv/config';
const app = express();

// Load Swagger spec
const swaggerDocument = YAML.load('./swagger.yaml');

// Common middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
app.use('/auth', authRouter);
app.use('/api', apiRouter);

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Welcome page route
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
          View API Documentation
        </a>
        <div class="mt-8 pt-6 border-t border-gray-200">
          <p class="text-sm text-gray-500">Powered by Express.js, Polygon POS  and Swagger UI</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`✅ Server running at http://localhost:${PORT}/api-docs`);
});
