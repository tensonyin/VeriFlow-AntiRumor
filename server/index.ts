import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import FormData from 'form-data';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const DIFY_API_KEY = 'app-CRjOm6lfjIuFjY0Xwncpzg0M';

// Set up multer to process multipart/form-data in memory
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running!' });
});

// Main endpoint to handle analysis
app.post('/api/analyze', upload.array('files', 5), async (req, res) => {
  try {
    const query = req.body.query || '';
    const files = req.files as Express.Multer.File[];
    
    const difyFileObjects: any[] = [];

    // 1. Upload files to Dify one by one
    if (files && files.length > 0) {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype,
        });
        formData.append('user', 'web-user');

        const uploadRes = await fetch('https://api.dify.ai/v1/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DIFY_API_KEY}`,
            // node-fetch with form-data automatically sets the boundary
            ...formData.getHeaders(),
          },
          body: formData as any,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.text();
          console.error('File upload failed:', err);
          throw new Error('Failed to upload file to Dify');
        }

        const uploadData = await uploadRes.json();
        
        // Use document type as fallback, ideally should map mimetype to Dify types (document, image, audio, video)
        let type = 'document';
        if (file.mimetype.startsWith('image/')) type = 'image';
        else if (file.mimetype.startsWith('audio/')) type = 'audio';
        else if (file.mimetype.startsWith('video/')) type = 'video';

        difyFileObjects.push({
          type: type,
          transfer_method: 'local_file',
          upload_file_id: uploadData.id
        });
      }
    }

    // 2. Call Dify Workflow Run API
    const workflowPayload = {
      inputs: {
        upload_files: difyFileObjects,
        user_text: query
      },
      response_mode: "streaming",
      user: "web-user"
    };

    const runRes = await fetch('https://api.dify.ai/v1/workflows/run', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(workflowPayload)
    });

    if (!runRes.ok) {
      const errText = await runRes.text();
      console.error('Workflow run failed:', errText);
      try {
        const errJson = JSON.parse(errText);
        return res.status(runRes.status).json({ success: false, error: errJson.message || errJson.code || 'Workflow failed to start', details: errJson });
      } catch (e) {
        return res.status(runRes.status).json({ success: false, error: errText });
      }
    }

    // 3. Stream the SSE response directly to the client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (runRes.body) {
      // For Node 18+ native fetch, body is a ReadableStream
      const reader = runRes.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            break;
          }
          res.write(value);
        }
      };
      pump().catch(err => {
        console.error('Stream error:', err);
        res.end();
      });
    } else {
      res.end();
    }
  } catch (error) {
    console.error('Error in analysis:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
