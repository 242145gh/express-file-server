const express = require('express');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');
const path = require('path');
require('dotenv').config();  // Load environment variables
const multer = require('multer'); // Import multer
const postgres = require('postgres');
const fs = require('fs');
const { WebSocketServer } = require('ws');

// WebSocket server setup
const wss = new WebSocketServer({ noServer: true });

// Initialize connection using the connection string from your .env file
const sql = postgres(process.env.POSTGRES_URL);
const app = express();

// Set larger payload limits
app.use(express.json({ limit: '10mb' })); // Adjust this limit as necessary
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,         // Cloudinary cloud name
  api_key: process.env.NEXT_PUBLIC_CLOUD_API, // Cloudinary API key
  api_secret: process.env.NEXT_PUBLIC_SECERT, // Cloudinary API secret
});

// Set up multer to handle multipart form data
const storage = multer.memoryStorage();
const upload = multer({ storage: storage }); // Store the file in memory

// CORS Configuration 
const allowedOrigins = [
  'http://localhost:3000',               // Local development
  'https://wisdomsource-sigma.vercel.app' // Vercel frontend
];

app.use(cors({
  origin: (origin, callback) => {
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],      // Allow these HTTP methods
  credentials: true,                        // Enable credentials (if needed)
  allowedHeaders: ['Content-Type', 'Authorization'] // Allow these headers
}));

// Cloudinary file upload route
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    console.log("body " + JSON.stringify(req.body)); // Log request body

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Convert file buffer to base64
    const fileBase64 = req.file.buffer.toString('base64');
    // Cloudinary accepts a Base64 string directly
    const uploadResponse = await cloudinary.uploader.upload(`data:${req.file.mimetype};base64,${fileBase64}`, {
      use_filename: true,
      unique_filename: false,
    });

    res.status(200).json({ cldResponse: uploadResponse });
  } catch (error) {
    console.error("Error uploading the file:", error);
    res.status(500).json({ error: 'An error occurred while uploading the file' });
  }
});

// Route to update metadata on Cloudinary
app.post('/api/update-metadata', upload.none(), async (req, res) => {
  try {
    const { title, description, public_id } = req.body;

    if (!title || !description || !public_id) {
      return res.status(400).json({ error: 'Missing required fields: title, description, or public_id.' });
    }

    // Update metadata on Cloudinary
    const updateResponse = await cloudinary.uploader.update_metadata({
      title: title,
      description: description,
    }, public_id);

    res.status(200).json({ message: 'Metadata updated successfully', updateResponse });
  } catch (error) {
    console.error("Error updating metadata:", error);
    res.status(500).json({ error: 'An error occurred while updating the metadata' });
  }
});

// Fetch metadata from Cloudinary
app.post('/api/pull-metadata', upload.none(), async (req, res) => {
  try {
    const { public_id } = req.body;

    const pull = await cloudinary.api.resource([public_id], {
      resource_type: 'image',
    });
    
    res.status(200).json({
      title: pull.metadata.title,
      description: pull.metadata.description,
      secure_url: pull.secure_url
    });
  } catch (error) {
    console.error("Error pulling image:", error);
    res.status(500).json({ error: 'An error occurred while pulling the image' });
  }
});

// Test database connection
app.get('/test-db', async (req, res) => {
  try {
    const result = await sql`SELECT NOW()`;
    res.status(200).json({ message: 'Connected to the database', time: result });
  } catch (error) {
    console.error('Error connecting to database:', error);
    res.status(500).json({ error: 'Failed to connect to the database' });
  }
});

// Chat history API
app.post('/api/chat_history', async (req, res) => {
  const { public_id } = req.body;
  try {
    const rows = await sql`SELECT * FROM chat_history WHERE public_id=${public_id}`;
    res.status(200).json({ rows });
  } catch (error) {
    console.error("Error fetching chat history:", error);
    res.status(500).json({ error: 'Error fetching chat history' });
  }
});

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (message) => {
    try {
      const audioData = message.toString(); // Convert the message to string if it's a buffer
      console.log("Audio data received:", audioData.length);

      // Save the audio data to a file
      const wavFilePath = 'output.wav';
      saveBase64AsWav(audioData, wavFilePath);

      // Dynamically import the Gradio client
      const { Client } = await import("@gradio/client");
      const client = await Client.connect("KingNish/Realtime-whisper-large-v3-turbo");

      // Read the saved WAV file to send it
      const audioBlob = fs.readFileSync(wavFilePath);

      // Call the prediction function with the audio Blob
      const result = await client.predict("/transcribe", {
        inputs: audioBlob,
      });

      // Send transcription result back to the client
      ws.send(JSON.stringify(result));
    } catch (error) {
      console.error("Transcription error:", error);
      ws.send(JSON.stringify({ error: "Transcription failed", details: error.message }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Upgrade HTTP server to support WebSocket
app.server = app.listen(process.env.PORT || 3001, () => {
  console.log(`Server is running on port ${process.env.PORT || 3001}`);
});
app.server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Utility function to convert base64 to a Blob
function base64ToBlob(base64, mimeType = 'audio/wav') {
  const byteCharacters = Buffer.from(base64, 'base64'); // Convert base64 to binary
  return new Blob([byteCharacters], { type: mimeType });
}

// Utility function to save base64 audio data as WAV file
function saveBase64AsWav(base64Data, filePath) {
  const cleanedBase64Data = base64Data.replace(/^data:audio\/wav;base64,/, '');
  console.log("First 100 characters of audioData:", cleanedBase64Data.slice(0, 100));

  // Convert base64 to buffer
  const buffer = Buffer.from(cleanedBase64Data, 'base64');

  // Write the buffer to a file
  fs.writeFileSync(filePath, buffer);
}

// Route for transcription via POST request
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioData } = req.body; // Expecting base64 audio data

    // Dynamically import the Gradio client
    const { Client } = await import("@gradio/client");
    
    // Connect to the Gradio app
    const client = await Client.connect("KingNish/Realtime-whisper-large-v3-turbo");

    // Save the audio data to a file
    const wavFilePath = 'output.wav'; // or a path you prefer
    saveBase64AsWav(audioData, wavFilePath);

    // Read the saved WAV file to send it
    const audioBlob = fs.readFileSync(wavFilePath);

    // Call the prediction function with the audio Blob
    const result = await client.predict("/transcribe", {
      inputs: audioBlob, // Use the Blob
    });

    // Send the transcription result back to the client
    res.status(200).json({ transcription: result.data });
  } catch (error) {
    console.error("Transcription error:", error);
    res.status(500).json({ error: "Transcription failed" });
  }
});

// Route for transcription stream via POST request
app.post('/api/transcribe-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const { audioData } = req.body; // Get audio data from the request body

  (async () => {
    try {
      console.log("Audio data length:", audioData.length);
      console.log("First 100 characters of audioData:", audioData.slice(0, 100));

      // Convert base64 audio data to a Blob
      const wavFileBlob = base64ToBlob(audioData); // Convert to Blob
      const { Client } = await import("@gradio/client");
      const client = await Client.connect("KingNish/Realtime-whisper-large-v3-turbo");

      // Call the prediction function with the audio Blob
      const result = await client.predict("/transcribe", { inputs: wavFileBlob });

      // Send each piece of data as it comes
      for (const item of result.data) {
        res.write(`data: ${JSON.stringify(item)}\n\n`);
      }

      res.end(); // End the connection when done
    } catch (error) {
      console.error("Transcription error:", error);
      res.write(`data: {"error": "Transcription failed"}\n\n`);
      res.end();
    }
  })();
});

