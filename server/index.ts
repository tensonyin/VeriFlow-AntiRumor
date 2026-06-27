import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
let difyApiKey = 'app-CRjOm6lfjIuFjY0Xwncpzg0M'; // Fallback default key

try {
  const configPath = path.join(__dirname, '../config.json');
  if (fs.existsSync(configPath)) {
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (configData.dify_api_key) {
      difyApiKey = configData.dify_api_key;
    }
  }
} catch (e) {
  console.error('Failed to read config.json:', e);
}

const DIFY_API_KEY = process.env.DIFY_API_KEY || difyApiKey;

// Set up multer to process multipart/form-data in memory
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running!' });
});

// Proxy endpoint to bypass CORS for image saving
app.get('/api/proxy-image', async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) return res.status(400).send('No URL provided');
  try {
    const fetchRes = await fetch(imageUrl);
    const buffer = await fetchRes.arrayBuffer();
    res.set('Content-Type', fetchRes.headers.get('content-type') || 'image/jpeg');
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).send('Error proxying image');
  }
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
        const blob = new Blob([file.buffer], { type: file.mimetype });
        formData.append('file', blob, file.originalname);
        formData.append('user', 'web-user');

        const uploadRes = await fetch('https://api.dify.ai/v1/files/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DIFY_API_KEY}`,
          },
          body: formData,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.text();
          console.error('File upload failed:', err);
          throw new Error(`Failed to upload file to Dify: ${err}`);
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
    const isElderlyModeStr = req.body.isElderlyMode === 'true' ? 'true' : 'false';
    const workflowPayload = {
      inputs: {
        upload_files: difyFileObjects,
        user_text: query,
        isElderlyMode: isElderlyModeStr
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
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            break;
          }
          
          res.write(value);

          // Decode and parse for terminal logging
          buffer += decoder.decode(value, { stream: true });
          let lines = buffer.split('\n');
          buffer = lines.pop() || ''; // keep the incomplete line

          for (let line of lines) {
            line = line.trim();
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.event === 'node_finished' && data.data) {
                   const title = data.data.title || data.data.node_type || "Unknown Node";
                   const outputText = data.data.outputs?.text;
                   const outputAll = data.data.outputs;
                   
                   console.log(`\n======================================================`);
                   console.log(`🟢 [NODE FINISHED]: ${title}`);
                   if (outputText) {
                     console.log(`[TEXT OUTPUT]:\n${outputText}`);
                   } else {
                     console.log(`[OUTPUT DATA]:`, JSON.stringify(outputAll, null, 2));
                   }
                   console.log(`======================================================\n`);
                }
              } catch(e) {
                // Ignore parse errors for incomplete JSON
              }
            }
          }
        }
      };
      pump().catch(err => {
        console.error('Stream error:', err);
        res.end();
      });
    } else {
      res.end();
    }
  } catch (error: any) {
    console.error('Error in analysis:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error', details: error.message || String(error) });
  }
});

// TTS endpoint using local edge-tts
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice, rate } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    const voiceName = voice || 'zh-CN-XiaoyiNeural';
    const speechRate = rate || '-12%'; // Slightly slower for senior readability
    const tempFileName = `tts_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp3`;
    const tempFilePath = path.join(process.cwd(), tempFileName);

    // Securely invoke edge-tts CLI tool with custom voice and rate
    execFile('edge-tts', [
      '--voice', voiceName,
      '--text', text,
      `--rate=${speechRate}`,
      '--write-media', tempFilePath
    ], (error, stdout, stderr) => {
      if (error) {
        console.error('edge-tts execution failed:', error, stderr);
        return res.status(500).json({ error: 'TTS generation failed', details: error.message });
      }

      res.sendFile(tempFilePath, (err) => {
        // Clean up temp audio file
        fs.unlink(tempFilePath, (unlinkErr) => {
          if (unlinkErr) console.error('Failed to unlink temporary TTS file:', unlinkErr);
        });
        if (err) {
          console.error('Error sending TTS file:', err);
        }
      });
    });
  } catch (err: any) {
    console.error('TTS endpoint error:', err);
    res.status(500).json({ error: 'Internal Server Error in TTS endpoint', details: err.message });
  }
});


// Serve static files from the React frontend build directory
app.use(express.static(path.join(__dirname, '../dist')));

// Serve index.html for any other routes (supports SPA client-side routing)
app.get('*', (req, res) => {
  const indexPage = path.join(__dirname, '../dist/index.html');
  if (fs.existsSync(indexPage)) {
    res.sendFile(indexPage);
  } else {
    res.status(404).send('Frontend not built. Run "npm run build" first.');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
