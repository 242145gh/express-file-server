require('dotenv').config();
const cloudinary = require("cloudinary").v2;

// Ensure Cloudinary is configured correctly with lowercase keys
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,      // lowercase 'cloud_name'
  api_key: process.env.NEXT_PUBLIC_CLOUD_API,
  api_secret: process.env.NEXT_PUBLIC_SECERT,

});



const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const app = express();

// Handle preflight requests
app.options('*', cors()); // Apply CORS to all preflight requests

app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'https://wisdomsource-sigma.vercel.app'
    ];
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);  // Allow requests from the specified origins or non-origin requests
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middleware to parse incoming JSON
app.use(express.json()); // This line is important for parsing JSON bodies

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads')); // Save files to "uploads" directory in the root
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname); // Save file with timestamp for unique naming
  },
});

const upload = multer({ storage });

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
   
    // Read the file from disk as base64
    const filePath = path.join(__dirname, 'uploads', req.file.filename);
    const fileBuffer = fs.readFileSync(filePath);
    const b64 = fileBuffer.toString("base64");
    let dataURI = "data:" + req.file.mimetype + ";base64," + b64;

    const cldRes = await cloudinary.uploader.upload(dataURI, {
      resource_type: "auto"
    });

    // Ensure cldRes is defined and has the expected properties
    if (!cldRes || !cldRes.public_id) {
      return res.status(500).json({ error: 'Failed to upload to Cloudinary' });
    }

   
    console.log("Upload success", JSON.stringify(cldRes, null, 2));
      
    // Return the file path and Cloudinary response to the client
    res.json({
      message: 'File uploaded successfully',
      filePath: `/uploads/${req.file.filename}`,
      cldResponse: cldRes
    });

    return {
      secure_url: cldRes.secure_url,
      public_id: cldRes.public_id
    };

  } catch (error) {
    console.error('Error in file upload:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// Endpoint to update Cloudinary metadata
app.post('/api/update-metadata', upload.none(), async (req, res) => {
  try {
    const { title, description, public_id } = req.body;

    if (!title || !description || !public_id) {
      return res.status(400).json({ error: 'Missing required fields: title, description, or public_id.' });
    }

    // Update metadata on Cloudinary
    await cloudinary.uploader.update_metadata({ title }, public_id);
    await cloudinary.uploader.update_metadata({ description }, public_id);

    // Fetch updated metadata from Cloudinary
    const resource = await cloudinary.api.resource(public_id);

    res.json({
      message: 'Metadata updated successfully',
      metadata: resource.metadata,
    });
  } catch (error) {
    console.error('Error updating metadata:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Your routes
app.post('/api/pull-metadata', async (req, res) => {
  try {

    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    console.log("server fullurl", +fullUrl);


    // Log the received request body (JSON)
    console.log("Request received:", JSON.stringify(req.body, null, 2));

    // Extract the public_id from the request body
    const { public_id } = req.body;

    if (!public_id) {
      return res.status(400).json({ error: 'Missing public_id in request body' });
    }

    //comment 

    // Use Cloudinary API to get metadata
    const resource = await cloudinary.api.resource(public_id, {
    });

    // Send the Cloudinary metadata response back to the client
    return res.json({
      message: 'Metadata retrieved successfully',
      metadata: resource.metadata,
    });

  } catch (error) {
    console.error('Error fetching metadata:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});





// Endpoint to list files in the uploads directory
app.get('/api/uploads', (req, res) => {
  const uploadDir = path.join(__dirname, 'uploads');
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to scan directory: ' + err });
    }

    // Create an HTML list of files with Tailwind CSS styling
    let fileListHTML = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
        <title>Uploaded Files</title>
      </head>
      <body class="bg-black text-white p-10">
        <div class="max-w-2xl mx-auto bg-gray-800 rounded-lg shadow-lg p-5">
          <h1 class="text-2xl font-bold mb-4">Uploaded Files</h1>
          <ul class="space-y-2">
    `;

    files.forEach(file => {
      const filePath = path.join('/uploads', file); // Create a link path
      const icon = file.endsWith('.pdf') ? 'fas fa-file-pdf' : 
                   file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png') ? 'fas fa-file-image' : 
                   file.endsWith('.txt') ? 'fas fa-file-alt' : 'fas fa-file';

      fileListHTML += `
        <li class="flex items-center space-x-2">
          <i class="${icon} text-xl"></i>
          <a href="${filePath}" target="_blank" class="text-blue-400 hover:underline">
            ${file}
          </a>
        </li>
      `;
    });

    fileListHTML += `
          </ul>
        </div>
      </body>
      </html>
    `;

    // Send back the HTML response
    res.send(fileListHTML);
  });
});

// Catch-all route for testing
app.get('/', (req, res) => {
  res.send('<h1>File Upload Server</h1>');
});

// Start the Express server
app.listen(3001, () => {
  console.log('Server running on port 3001');
});
