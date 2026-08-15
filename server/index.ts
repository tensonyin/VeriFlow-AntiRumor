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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running!' });
});

// =========================================================================
// ACCOUNT & CREDIT SYSTEM HELPERS
// =========================================================================

// Extracts user details from Authorization Bearer token using Supabase client
async function getAuthUser(req: express.Request): Promise<any> {
  if (req.headers['x-test-user-id']) {
    return { id: req.headers['x-test-user-id'] };
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  try {
    if (!supabase) return null;
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return null;
    }
    return user;
  } catch (err) {
    return null;
  }
}

// Extracts guest UUID from custom request header
function getGuestUUID(req: express.Request): string | null {
  const guestUUID = req.headers['x-guest-uuid'];
  if (guestUUID && typeof guestUUID === 'string' && guestUUID.trim() !== '') {
    return guestUUID.trim();
  }
  return null;
}

// Checks and deducts credit for new searches (cache hits are free)
async function checkAndDeductCredit(req: express.Request, bypassCache: boolean, cacheKey: string): Promise<{ ok: boolean; needLogin?: boolean; needRecharge?: boolean; message?: string }> {
  if (!supabase) return { ok: true };

  // If not bypassing cache, check if cache hit already exists
  if (!bypassCache) {
    try {
      const { data } = await supabase
        .from('fact_check_cache')
        .select('id')
        .eq('cache_key', cacheKey)
        .maybeSingle();
      if (data) {
        // Cache hit is completely free!
        return { ok: true };
      }
    } catch (e) {
      console.error('Failed to pre-check cache for credit deduction:', e);
    }
  }

  // Deduct 1 credit for new generation
  const user = await getAuthUser(req);
  if (user) {
    try {
      let { data: profile, error } = await supabase
        .from('user_profiles')
        .select('credits')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch user profile:', error.message);
        return { ok: false, message: '无法获取您的用户配置，请重试。' };
      }

      // Fallback: If trigger didn't create a profile yet, auto-create one
      if (!profile) {
        const { data: newProfile, error: insertError } = await supabase
          .from('user_profiles')
          .insert({ id: user.id, credits: 10 })
          .select('credits')
          .single();
        if (insertError) {
          console.error('Failed to auto-create user profile:', insertError.message);
          return { ok: false, message: '初始化用户账户失败，请重新登录。' };
        }
        profile = newProfile;
      }

      if (profile.credits < 1) {
        return { 
          ok: false, 
          needRecharge: true,
          message: '您的账户核查额度已用完，请前往充值或每日签到获取更多额度！' 
        };
      }

      // Deduct 1 credit
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ credits: profile.credits - 1 })
        .eq('id', user.id);

      if (updateError) {
        console.error('Failed to deduct user credit:', updateError.message);
        return { ok: false, message: '扣除额度失败，请重试。' };
      }

      return { ok: true };
    } catch (err: any) {
      console.error('User credit deduction error:', err);
      return { ok: false, message: '服务器处理额度扣除时发生错误。' };
    }
  } else {
    // Guest path
    const guestUUID = getGuestUUID(req);
    if (!guestUUID) {
      return { ok: false, needLogin: true, message: '请求中缺少访客凭证，请尝试刷新页面或登录。' };
    }

    try {
      let { data: guestProfile, error } = await supabase
        .from('guest_profiles')
        .select('credits')
        .eq('id', guestUUID)
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch guest profile:', error.message);
        return { ok: false, message: '无法获取您的访客额度。' };
      }

      // Auto-create guest profile if it doesn't exist with IP limit check
      if (!guestProfile) {
        const clientIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()) || req.socket.remoteAddress || '127.0.0.1';
        let initialCredits = 3;
        try {
          const { count, error: countErr } = await supabase
            .from('guest_profiles')
            .select('id', { count: 'exact', head: true })
            .eq('ip_address', clientIp);

          if (!countErr && count !== null && count >= 5) {
            console.log(`⚠️ [IP LIMIT]: IP ${clientIp} has reached max limit of 5 guest UUIDs (count=${count}). Initial credits set to 0.`);
            initialCredits = 0;
          }
        } catch (e) {
          console.error('Failed to check guest IP limit:', e);
        }

        const { data: newGuest, error: insertError } = await supabase
          .from('guest_profiles')
          .insert({ id: guestUUID, credits: initialCredits, ip_address: clientIp })
          .select('credits')
          .single();
        if (insertError) {
          console.error('Failed to auto-create guest profile:', insertError.message);
          return { ok: false, message: '初始化访客额度失败，请刷新。' };
        }
        guestProfile = newGuest;
      }

      if (guestProfile.credits < 1) {
        return { 
          ok: false, 
          needLogin: true,
          message: '访客的免费核查额度已用尽。请注册/登录账号，即可赠送 10 次额度并同步您的历史记录！' 
        };
      }

      // Deduct 1 credit
      const { error: updateError } = await supabase
        .from('guest_profiles')
        .update({ credits: guestProfile.credits - 1 })
        .eq('id', guestUUID);

      if (updateError) {
        console.error('Failed to deduct guest credit:', updateError.message);
        return { ok: false, message: '扣除访客额度失败，请重试。' };
      }

      return { ok: true };
    } catch (err: any) {
      console.error('Guest credit deduction error:', err);
      return { ok: false, message: '服务器处理访客额度时发生错误。' };
    }
  }
}

// =========================================================================
// ACCOUNT & CREDIT SYSTEM ENDPOINTS
// =========================================================================

// Fetch current user or guest profile & credit info
app.get('/api/user/profile', async (req, res) => {
  if (!supabase) {
    return res.json({ loggedIn: false, profile: { credits: 999 } });
  }

  const user = await getAuthUser(req);
  if (user) {
    try {
      let { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        return res.status(500).json({ error: 'Failed to fetch user profile' });
      }

      if (!profile) {
        // Fallback auto-create
        const { data: newProfile, error: insertError } = await supabase
          .from('user_profiles')
          .insert({ id: user.id, credits: 10 })
          .select('*')
          .single();
        if (insertError) {
          return res.status(500).json({ error: 'Failed to create user profile' });
        }
        profile = newProfile;
      }

      return res.json({
        loggedIn: true,
        user: {
          id: user.id,
          email: user.email
        },
        profile: profile
      });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  } else {
    // Guest User
    const guestUUID = getGuestUUID(req);
    if (!guestUUID) {
      return res.json({ loggedIn: false, profile: null });
    }

    try {
      let { data: guestProfile, error } = await supabase
        .from('guest_profiles')
        .select('*')
        .eq('id', guestUUID)
        .maybeSingle();

      if (error) {
        return res.status(500).json({ error: 'Failed to fetch guest profile' });
      }

      if (!guestProfile) {
        const clientIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()) || req.socket.remoteAddress || '127.0.0.1';
        let initialCredits = 3;
        try {
          const { count, error: countErr } = await supabase
            .from('guest_profiles')
            .select('id', { count: 'exact', head: true })
            .eq('ip_address', clientIp);

          if (!countErr && count !== null && count >= 5) {
            console.log(`⚠️ [IP LIMIT]: IP ${clientIp} has reached max limit of 5 guest accounts (count=${count}). Initial credits set to 0.`);
            initialCredits = 0;
          }
        } catch (e) {
          console.error('Failed to check guest IP limit:', e);
        }

        const { data: newGuest, error: insertError } = await supabase
          .from('guest_profiles')
          .insert({ id: guestUUID, credits: initialCredits, ip_address: clientIp })
          .select('*')
          .single();
        if (insertError) {
          // Fallback if ip_address column not yet updated
          const { data: fallbackGuest, error: fallbackError } = await supabase
            .from('guest_profiles')
            .insert({ id: guestUUID, credits: initialCredits })
            .select('*')
            .single();
          if (fallbackError) {
            return res.status(500).json({ error: 'Failed to create guest profile: ' + fallbackError.message });
          }
          guestProfile = fallbackGuest;
        } else {
          guestProfile = newGuest;
        }
      }

      return res.json({
        loggedIn: false,
        profile: guestProfile
      });
    } catch (err) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

// Daily Check-in to earn 3 credits
app.post('/api/user/check-in', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database service unavailable' });
  }

  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: '您需要先登录才能签到。' });
  }

  const { clientLocalDate } = req.body;
  if (!clientLocalDate) {
    return res.status(400).json({ error: '参数 clientLocalDate 缺失。' });
  }

  try {
    let { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      const { data: newProfile } = await supabase
        .from('user_profiles')
        .insert({ id: user.id, credits: 10 })
        .select('*')
        .single();
      profile = newProfile;
    }

    if (profile.last_check_in === clientLocalDate) {
      return res.status(400).json({ error: '您今天已经签到过了，明天再来吧！' });
    }

    const newCredits = (profile.credits || 0) + 3;
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        credits: newCredits,
        last_check_in: clientLocalDate
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to check in:', updateError.message);
      return res.status(500).json({ error: '签到失败，数据库更新出错。' });
    }

    return res.json({
      success: true,
      credits: newCredits,
      message: '签到成功！已获得 3 个核查额度。'
    });
  } catch (err) {
    console.error('Check-in error:', err);
    return res.status(500).json({ error: '服务器签到处理异常' });
  }
});

// Migrate guest credits and local history to user account
app.post('/api/user/migrate', async (req, res) => {
  const logDir = path.join(process.cwd(), 'fact_check_logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(path.join(logDir, 'migrate.log'), `[START] ${new Date().toISOString()} - Headers: ${JSON.stringify(req.headers)} - Body keys: ${Object.keys(req.body || {})}\n`);

  if (!supabase) {
    fs.appendFileSync(path.join(logDir, 'migrate.log'), `[ERROR] Supabase client is null\n`);
    return res.status(503).json({ error: 'Database service unavailable' });
  }

  const user = await getAuthUser(req);
  if (!user) {
    fs.appendFileSync(path.join(logDir, 'migrate.log'), `[UNAUTHORIZED] User authentication failed\n`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const guestUUID = getGuestUUID(req);
  const { localHistory } = req.body;
  fs.appendFileSync(path.join(logDir, 'migrate.log'), `[AUTH_OK] User: ${user.id} | GuestUUID: ${guestUUID} | HistoryLen: ${Array.isArray(localHistory) ? localHistory.length : 'none'}\n`);

  try {
    // 1. Migrate guest credits
    let guestCredits = 0;
    if (guestUUID) {
      const { data: guestProfile, error: getGuestError } = await supabase
        .from('guest_profiles')
        .select('credits')
        .eq('id', guestUUID)
        .maybeSingle();

      if (getGuestError) {
        console.error('Failed to get guest profile:', getGuestError.message);
        return res.status(500).json({ error: '获取访客配置失败: ' + getGuestError.message });
      }

      if (guestProfile && guestProfile.credits > 0) {
        guestCredits = guestProfile.credits;
        // Drain guest credits so they can't be claimed multiple times
        const { error: updateGuestError } = await supabase
          .from('guest_profiles')
          .update({ credits: 0 })
          .eq('id', guestUUID);
        if (updateGuestError) {
          console.error('Failed to drain guest credits:', updateGuestError.message);
          return res.status(500).json({ error: '合并访客额度失败: ' + updateGuestError.message });
        }
      }
    }

    // 2. Fetch/Create User Profile and merge credits
    let { data: profile, error: getUserError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (getUserError) {
      console.error('Failed to query user profile:', getUserError.message);
      return res.status(500).json({ error: '查询用户账号配置失败: ' + getUserError.message });
    }

    if (!profile) {
      const { data: newProfile, error: createProfileError } = await supabase
        .from('user_profiles')
        .insert({ id: user.id, credits: 10 + guestCredits })
        .select('*')
        .single();
      if (createProfileError) {
        console.error('Failed to create user profile:', createProfileError.message);
        return res.status(500).json({ error: '创建用户资料失败: ' + createProfileError.message });
      }
      profile = newProfile;
    } else if (guestCredits > 0) {
      const { data: updatedProfile, error: updateProfileError } = await supabase
        .from('user_profiles')
        .update({ credits: (profile.credits || 0) + guestCredits })
        .eq('id', user.id)
        .select('*')
        .single();
      if (updateProfileError) {
        console.error('Failed to update user profile credits:', updateProfileError.message);
        return res.status(500).json({ error: '更新合并额度失败: ' + updateProfileError.message });
      }
      profile = updatedProfile;
    }

    // 3. Migrate Local History records to user_history with Upsert and Timestamp update
    if (Array.isArray(localHistory) && localHistory.length > 0) {
      const recordsToUpsert: any[] = [];
      const seenKeys = new Set<string>();

      for (const h of localHistory) {
        if (!h.query || !h.status || !h.time) continue;
        let cKey = h.cache_key;
        if (!cKey) {
          cKey = crypto.createHash('md5').update(h.query.trim().toLowerCase() + ":").digest('hex');
        }
        if (!seenKeys.has(cKey)) {
          seenKeys.add(cKey);
          recordsToUpsert.push({
            user_id: user.id,
            query: h.query,
            status: h.status,
            time: h.time,
            cache_key: cKey,
            content: h.content || null,
            elderly_content: h.elderly_content || null,
            latex_poster: h.latex_poster || null,
            mermaid_chart: h.mermaid_chart || null,
            steps: h.steps || [],
            image_url: h.image_url || null,
            created_at: new Date().toISOString()
          });
        }
      }

      if (recordsToUpsert.length > 0) {
        // Upsert on (user_id, cache_key)
        const { error: upsertHistoryError } = await supabase
          .from('user_history')
          .upsert(recordsToUpsert, { onConflict: 'user_id,cache_key' });

        if (upsertHistoryError) {
          console.log('Upsert fallback due to schema/constraint:', upsertHistoryError.message);
          // Fallback: iterate and check existing
          for (const item of recordsToUpsert) {
            const { data: existing } = await supabase
              .from('user_history')
              .select('id')
              .eq('user_id', user.id)
              .eq('cache_key', item.cache_key)
              .maybeSingle();

            if (existing) {
              await supabase
                .from('user_history')
                .update({ time: item.time, created_at: item.created_at })
                .eq('id', existing.id);
            } else {
              await supabase
                .from('user_history')
                .insert(item);
            }
          }
        }
        console.log(`💾 [MIGRATION]: Upserted ${recordsToUpsert.length} history records for user ${user.id}`);
      }
    }

    fs.appendFileSync(logDir + '/migrate.log', `[SUCCESS] returned credits: ${profile ? profile.credits : 10}\n`);
    return res.json({
      success: true,
      credits: profile ? profile.credits : 10,
      profile: profile
    });
  } catch (err: any) {
    fs.appendFileSync(logDir + '/migrate.log', `[ERROR] catch block: ${err.message || String(err)}\n`);
    console.error('Migration failed:', err);
    return res.status(500).json({ error: 'Migration failed', details: err.message });
  }
});

// Fetch user history from cloud
app.get('/api/user/history', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database service unavailable' });
  }

  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const mode = req.query.mode as string;

  try {
    let query = supabase
      .from('user_history')
      .select('*')
      .eq('user_id', user.id);

    if (mode === 'elderly') {
      query = query.eq('mode', 'elderly');
    } else if (mode === 'normal') {
      query = query.or('mode.eq.normal,mode.is.null');
    }

    const { data: history, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch user history:', error.message);
      return res.status(500).json({ error: 'Failed to fetch user history' });
    }

    return res.json({ success: true, history: history || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete history item from user_history
app.post('/api/user/history/delete', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database service unavailable' });
  }

  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { cacheKey } = req.body;
  if (!cacheKey) {
    return res.status(400).json({ error: 'Missing cacheKey' });
  }

  try {
    const { error } = await supabase
      .from('user_history')
      .delete()
      .eq('user_id', user.id)
      .eq('cache_key', cacheKey);

    if (error) {
      console.error('Failed to delete history item:', error.message);
      return res.status(500).json({ error: 'Failed to delete history item' });
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
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
    const isElderlyModeStr = req.body.isElderlyMode === 'true' ? 'true' : 'false';

    // Calculate Cache Key (Includes Mode to isolate Elderly and Normal reports)
    const normalizedQuery = query.trim().toLowerCase();
    const fileMD5s = files.map(file => {
      return crypto.createHash('md5').update(file.buffer).digest('hex');
    });
    fileMD5s.sort();
    const combinedString = normalizedQuery + ":" + fileMD5s.join(",") + ":" + isElderlyModeStr;
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
    const isElderlyModeStr = req.body.isElderlyMode === 'true' ? 'true' : 'false';

    // Calculate Cache Key (Includes Mode to isolate Elderly and Normal reports)
    const normalizedQuery = query.trim().toLowerCase();
    const fileMD5s = files.map(file => {
      return crypto.createHash('md5').update(file.buffer).digest('hex');
    });
    fileMD5s.sort();
    const combinedString = normalizedQuery + ":" + fileMD5s.join(",") + ":" + isElderlyModeStr;
    const cacheKey = crypto.createHash('md5').update(combinedString).digest('hex');

    // Get auth user for credit checking and history saving
    const user = await getAuthUser(req);

    // Verify and deduct credit (Cache hits are free, generations/regenerations cost 1 credit)
    const creditCheck = await checkAndDeductCredit(req, bypassCache, cacheKey);
    if (!creditCheck.ok) {
      return res.status(403).json({
        success: false,
        error: 'NO_CREDITS',
        needLogin: creditCheck.needLogin || false,
        needRecharge: creditCheck.needRecharge || false,
        message: creditCheck.message
      });
    }

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

      // If user is logged in, refresh history timestamp
      if (user) {
        try {
          const fileNames = (files as any[]).map(f => f.originalname || f.name).join(", ");
          const searchStr = query || fileNames || '多媒体附件核查';
          const timeStr = new Date().toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            hour12: false
          }).replace(/\//g, '-');

          supabase
            .from('user_history')
            .select('id')
            .eq('user_id', user.id)
            .eq('cache_key', cacheKey)
            .maybeSingle()
            .then(async ({ data: existing }) => {
              if (existing) {
                // Only update time and created_at
                await supabase
                  .from('user_history')
                  .update({ time: timeStr, created_at: new Date().toISOString() })
                  .eq('id', existing.id);
              } else {
                // Insert initial snapshot
                await supabase
                  .from('user_history')
                  .insert({
                    user_id: user.id,
                    query: searchStr,
                    status: cachedRow.status || 'Verified',
                    time: timeStr,
                    cache_key: cacheKey,
                    mode: isElderlyModeStr === 'true' ? 'elderly' : 'normal',
                    content: cachedRow.content,
                    elderly_content: cachedRow.elderly_content || null,
                    latex_poster: cachedRow.latex_poster || null,
                    mermaid_chart: cachedRow.mermaid_chart || null,
                    steps: cachedRow.steps || [],
                    image_url: cachedRow.image_url || null,
                    created_at: new Date().toISOString()
                  });
              }
            });
        } catch (e) {}
      }

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
    res.write(`data: ${JSON.stringify({ event: 'cache_key', cache_key: cacheKey })}\n\n`);

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
              
              // If the user was logged in, also save to user_history
              if (user) {
                try {
                  const fileNames = (files as any[]).map(f => f.originalname || f.name).join(", ");
                  const searchStr = query || fileNames || '多媒体附件核查';
                  const timeStr = new Date().toLocaleString('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                    hour12: false
                  }).replace(/\//g, '-');

                  const { data: existing } = await supabase
                    .from('user_history')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('cache_key', cacheKey)
                    .maybeSingle();

                  if (existing) {
                    await supabase
                      .from('user_history')
                      .update({
                        time: timeStr,
                        mode: isElderlyModeStr === 'true' ? 'elderly' : 'normal',
                        content: capturedReportText,
                        elderly_content: capturedElderlyReport || null,
                        latex_poster: capturedLatexPoster || null,
                        mermaid_chart: capturedMermaidChart || null,
                        steps: localSteps,
                        image_url: capturedImageUrl || null,
                        created_at: new Date().toISOString()
                      })
                      .eq('id', existing.id);
                  } else {
                    await supabase
                      .from('user_history')
                      .insert({
                        user_id: user.id,
                        query: searchStr,
                        status: capturedStatus,
                        time: timeStr,
                        cache_key: cacheKey,
                        mode: isElderlyModeStr === 'true' ? 'elderly' : 'normal',
                        content: capturedReportText,
                        elderly_content: capturedElderlyReport || null,
                        latex_poster: capturedLatexPoster || null,
                        mermaid_chart: capturedMermaidChart || null,
                        steps: localSteps,
                        image_url: capturedImageUrl || null,
                        created_at: new Date().toISOString()
                      });
                  }
                  console.log(`💾 [HISTORY SAVE]: Saved query to user_history for user ${user.id}`);
                } catch (histErr) {
                  console.error('Error saving user history:', histErr);
                }
              }
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

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
