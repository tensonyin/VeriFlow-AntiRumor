import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Dynamically resolve directory paths whether running via tsx or bundled at root
const isBundled = fs.existsSync(path.join(__dirname, 'dist'));
const distPath = isBundled 
  ? path.join(__dirname, 'dist') 
  : path.join(__dirname, '../dist');

let difyApiKey = '';
let supabaseUrl = '';
let supabaseKey = '';

try {
  const configPath = isBundled
    ? path.join(__dirname, 'config.json')
    : path.join(__dirname, '../config.json');
  if (fs.existsSync(configPath)) {
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (configData.dify_api_key) {
      difyApiKey = configData.dify_api_key;
    }
    if (configData.supabase_url) {
      supabaseUrl = configData.supabase_url;
    }
    if (configData.supabase_key) {
      supabaseKey = configData.supabase_key;
    }
  }
} catch (e) {
  console.error('Failed to read config.json:', e);
}

const DIFY_API_KEY = process.env.DIFY_API_KEY || difyApiKey;
const SUPABASE_URL = process.env.SUPABASE_URL || supabaseUrl;
const SUPABASE_KEY = process.env.SUPABASE_KEY || supabaseKey;

if (!DIFY_API_KEY) {
  console.warn('\n⚠️  [WARNING]: DIFY_API_KEY is not configured! Please configure it in config.json or environment variables.\n');
}

let supabase: any = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✅ Supabase HTTP Client initialized successfully.');
} else {
  console.warn('⚠️  [WARNING]: SUPABASE_URL or SUPABASE_KEY is not configured. Caching will be disabled.');
}

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

// Endpoint to check if a query/files combination is already cached
app.post('/api/check-cache', upload.array('files', 5), async (req, res) => {
  try {
    const query = req.body.query || '';
    const files = req.files as Express.Multer.File[] || [];

    // Calculate Cache Key
    const normalizedQuery = query.trim().toLowerCase();
    const fileMD5s = files.map(file => {
      return crypto.createHash('md5').update(file.buffer).digest('hex');
    });
    fileMD5s.sort();
    const combinedString = normalizedQuery + ":" + fileMD5s.join(",");
    const cacheKey = crypto.createHash('md5').update(combinedString).digest('hex');

    if (supabase) {
      const { data, error } = await supabase
        .from('fact_check_cache')
        .select('*')
        .eq('cache_key', cacheKey)
        .maybeSingle();

      if (error) {
        console.error('Failed to query Supabase cache:', error.message);
        return res.json({ cached: false });
      }
      if (data) {
        return res.json({ cached: true, result: data });
      }
    }
    return res.json({ cached: false });
  } catch (err: any) {
    console.error('Error checking cache:', err);
    return res.status(500).json({ error: 'Internal Server Error', details: err.message || String(err) });
  }
});

// Main endpoint to handle analysis
app.post('/api/analyze', upload.array('files', 5), async (req, res) => {
  try {
    if (!DIFY_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Dify API Key is not configured on the server. Please configure it in config.json or environment variables.'
      });
    }
    const query = req.body.query || '';
    const files = req.files as Express.Multer.File[] || [];
    const bypassCache = req.body.bypassCache === 'true';

    // Calculate Cache Key
    const normalizedQuery = query.trim().toLowerCase();
    const fileMD5s = files.map(file => {
      return crypto.createHash('md5').update(file.buffer).digest('hex');
    });
    fileMD5s.sort();
    const combinedString = normalizedQuery + ":" + fileMD5s.join(",");
    const cacheKey = crypto.createHash('md5').update(combinedString).digest('hex');

    // Check Cache
    let cachedRow: any = null;
    if (supabase && !bypassCache) {
      try {
        const { data, error } = await supabase
          .from('fact_check_cache')
          .select('*')
          .eq('cache_key', cacheKey)
          .maybeSingle();

        if (error) {
          console.error('Failed to query Supabase cache:', error.message);
        } else if (data) {
          cachedRow = data;
          console.log(`🎯 [CACHE HIT]: Found cached answer for key ${cacheKey}`);
        }
      } catch (err) {
        console.error('Failed to query Supabase cache:', err);
      }
    }

    // Cache Hit: simulated stream replay
    if (cachedRow) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send workflow_started
      res.write(`data: ${JSON.stringify({ event: 'workflow_started' })}\n\n`);

      // Replay steps
      const steps = Array.isArray(cachedRow.steps) ? cachedRow.steps : [];
      for (const step of steps) {
        res.write(`data: ${JSON.stringify({
          event: 'node_started',
          data: {
            node_id: step.id,
            node_type: step.type,
            title: step.title
          }
        })}\n\n`);

        // Wait a tiny delay to simulate a real-time playback
        await new Promise(resolve => setTimeout(resolve, 50));

        res.write(`data: ${JSON.stringify({
          event: 'node_finished',
          data: {
            node_id: step.id,
            node_type: step.type,
            title: step.title,
            outputs: {
              text: step.details && step.details[0] ? step.details[0] : ''
            }
          }
        })}\n\n`);
      }

      // Replay workflow_finished
      const workflowOutputs: any = {
        text: cachedRow.content
      };
      if (cachedRow.image_url) {
        workflowOutputs.image = [{ url: cachedRow.image_url }];
      }

      res.write(`data: ${JSON.stringify({
        event: 'workflow_finished',
        data: {
          outputs: workflowOutputs
        }
      })}\n\n`);

      res.end();
      return;
    }

    // Cache Miss: execute normal flow and capture results for caching
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

    const backendAbortController = new AbortController();
    req.on('close', () => {
      console.log('🔌 Client disconnected, aborting Dify execution to save resources...');
      backendAbortController.abort();
    });

    const runRes = await fetch('https://api.dify.ai/v1/workflows/run', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(workflowPayload),
      signal: backendAbortController.signal
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

    // 3. Stream the SSE response directly to the client and collect cache data
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const localSteps: any[] = [];
    let capturedStatus = 'Doubtful';
    let capturedMermaidChart = '';
    let capturedReportText = '';
    let capturedElderlyReport = '';
    let capturedLatexPoster = '';
    let capturedImageUrl = '';
    let isStreamSuccessful = false;

    if (runRes.body) {
      const reader = runRes.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            isStreamSuccessful = true;
            res.end();
            break;
          }
          
          res.write(value);

          // Decode and parse for cache collecting and terminal logging
          buffer += decoder.decode(value, { stream: true });
          let lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (let line of lines) {
            line = line.trim();
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));

                if (data.event === 'node_started' && data.data) {
                  if (data.data.node_type !== 'end') {
                    localSteps.push({
                      id: data.data.node_id,
                      type: data.data.node_type,
                      title: data.data.title || data.data.node_type,
                      status: 'processing',
                      details: []
                    });
                  }
                } else if (data.event === 'node_finished' && data.data) {
                   const title = data.data.title || data.data.node_type || "Unknown Node";
                   const outputText = data.data.outputs?.text || data.data.outputs?.answer || data.data.outputs?.string || "";
                   const outputAll = data.data.outputs;
                   
                   console.log(`\n======================================================`);
                   console.log(`🟢 [NODE FINISHED]: ${title}`);
                   if (outputText) {
                     console.log(`[TEXT OUTPUT]:\n${outputText}`);
                   } else {
                     console.log(`[OUTPUT DATA]:`, JSON.stringify(outputAll, null, 2));
                   }
                   console.log(`======================================================\n`);

                   // Update local step details
                   const step = localSteps.find(s => s.id === data.data.node_id);
                   if (step) {
                     step.status = 'done';
                     step.details = outputText ? [outputText] : [];
                   }

                   // Capture specific results for caching
                   if (title.includes("定性裁决") || title.includes("Final Judge")) {
                     const firstTwoChars = outputText.substring(0, 2);
                     if (firstTwoChars === "证实") capturedStatus = "Verified";
                     else if (firstTwoChars === "伪造") capturedStatus = "Fake";
                     else if (firstTwoChars === "存疑") capturedStatus = "Doubtful";
                   }

                   if (title.includes('Mermaid') || title.includes('流程图代码')) {
                     const match = outputText.match(/```mermaid([\s\S]*?)```/i);
                     let cleaned = outputText;
                     if (match) {
                       cleaned = match[1].trim();
                     } else {
                       cleaned = outputText.replace(/^```mermaid\s*/i, '').replace(/\s*```\s*$/, '').trim();
                     }
                     if (cleaned && (cleaned.startsWith('graph') || cleaned.startsWith('flowchart'))) {
                       capturedMermaidChart = cleaned;
                     }
                   }

                   if (title.includes('Report Adjustment Out') || title.includes('Report Adjustment') || title.includes('报告修正') || title.includes('Compliance Agent') || title.includes('报告合规修正专家')) {
                     if (outputText.trim()) {
                       capturedReportText = outputText.trim();
                     }
                   } else if (title.includes('Report Out') || title === '结束' || title.includes('变量聚合器')) {
                     if (outputText.trim() && !capturedReportText) {
                       capturedReportText = outputText.trim();
                     }
                   }

                   if (title.includes('安心报告') || title.includes('Elderly Report') || data.data.node_id === '1782465366127') {
                     if (outputText.trim()) {
                       capturedElderlyReport = outputText.trim();
                     }
                   }

                   if (title.includes('LaTex') || title.includes('Poster') || data.data.node_id === '1782470849360') {
                     if (outputText.trim()) {
                       capturedLatexPoster = outputText.trim();
                     }
                   }
                } else if (data.event === 'workflow_finished' && data.data) {
                  const outputs = data.data.outputs || {};
                  
                  // Capture image URL
                  for (const val of Object.values(outputs)) {
                    if (Array.isArray(val) && val.length > 0 && val[0].url) {
                      capturedImageUrl = val[0].url;
                      break;
                    }
                  }

                  // Fallback for final report text if not captured
                  if (!capturedReportText) {
                    const rawText = outputs.text ? String(outputs.text).trim() : '';
                    if (rawText && !rawText.startsWith('graph ') && !rawText.startsWith('flowchart ')) {
                      capturedReportText = rawText;
                    } else {
                      for (const val of Object.values(outputs)) {
                        if (val && typeof val === 'string' && val.trim() 
                            && !val.trim().startsWith('graph ') 
                            && !val.trim().startsWith('flowchart ')) {
                          capturedReportText = val.trim();
                          break;
                        }
                      }
                    }
                    if (!capturedReportText) {
                      capturedReportText = JSON.stringify(outputs, null, 2);
                    }
                  }

                  // Clean mermaid blocks out of the report text
                  if (capturedReportText && typeof capturedReportText === 'string') {
                    const mermaidMatch = capturedReportText.match(/```mermaid\n?([\s\S]*?)```/i);
                    if (mermaidMatch && !capturedMermaidChart) {
                      capturedMermaidChart = mermaidMatch[1].trim();
                    }
                    const cleanedText = capturedReportText.replace(/```mermaid[\s\S]*?```/gi, '').trim();
                    if (cleanedText) {
                      capturedReportText = cleanedText;
                    }
                  }
                }
              } catch(e) {
                // Ignore parse errors for incomplete JSON
              }
            }
          }
        }

        // Save result to cache database asynchronously after stream ends successfully
        if (isStreamSuccessful && supabase) {
          try {
            const { error } = await supabase
              .from('fact_check_cache')
              .upsert({
                cache_key: cacheKey,
                query: query,
                file_hashes: fileMD5s,
                status: capturedStatus,
                content: capturedReportText,
                elderly_content: capturedElderlyReport || null,
                latex_poster: capturedLatexPoster || null,
                mermaid_chart: capturedMermaidChart || null,
                steps: localSteps,
                image_url: capturedImageUrl || null
              }, { onConflict: 'cache_key' });

            if (error) {
              console.error('Failed to save fact-check result to Supabase:', error.message);
            } else {
              console.log(`💾 [CACHE SAVE]: Successfully saved answer to database for key ${cacheKey}`);
            }
          } catch (dbErr) {
            console.error('Failed to save fact-check result to Supabase:', dbErr);
          }
        }
      };
      pump().catch(err => {
        if (err.name === 'AbortError') {
          console.log('⚡ Dify stream fetch was successfully aborted on client request.');
        } else {
          console.error('Stream error:', err);
        }
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
app.use(express.static(distPath));

// Serve index.html for any other routes (supports SPA client-side routing)
app.get('*', (req, res) => {
  const indexPage = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPage)) {
    res.sendFile(indexPage);
  } else {
    res.status(404).send('Frontend not built. Run "npm run build" first.');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
