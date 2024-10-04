const express = require('express');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');
const path = require('path');
require('dotenv').config();  // Load environment variables
const multer = require('multer'); // Import multer

const app = express();

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

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// Cloudinary file upload route
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    console.log("body " + JSON.stringify(req.body)); // Log request body
  //  console.log("file " + JSON.stringify(req.file)); // Log file information

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

    console.log("update meta: " + JSON.stringify(req.body)); // Log request body

    if (!title || !description || !public_id) {
      return res.status(400).json({ error: 'Missing required fields: title, description, or public_id.' });
    }

   
    // Update metadata on Cloudinary
    const updateResponse = await cloudinary.uploader.update_metadata({
      title: title,
      description: description,
  },public_id);

    res.status(200).json({ message: 'Metadata updated successfully', updateResponse });
  } catch (error) {
    console.error("Error updating metadata:", error);
    res.status(500).json({ error: 'An error occurred while updating the metadata' });
  }
});

app.post('/api/pull-metadata', upload.none(), async (req, res) => {
  try {
      const { public_id } = req.body;
      console.log("Received Body: " + JSON.stringify(req.body));
      console.log("Public ID in pull meta:", JSON.stringify(req.body.public_id)); 

     
      const pull = await cloudinary.api.resource([public_id], {
          resource_type: 'image', 
      });

      const metadata = pull.metadata
      console.log("Fetched resource:", JSON.stringify(pull));

    
      res.status(200).json({
        title: [pull.metadata.title], 
        description: [pull.metadata.description],
        secure_url: [pull.secure_url]
      });
  
  


  } catch (error) {
      console.error("Error pulling image:", error);
      res.status(500).json({ error: 'An error occurred while pulling the image' });
  }
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
