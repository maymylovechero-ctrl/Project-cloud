import express from 'express';
import cors from 'cors';
import multer from 'multer';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const { Pool } = pg;
const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
const port = Number(process.env.PORT || 3000);
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const categories = new Set(['computer_network', 'air_conditioning', 'presentation', 'general']);
const technicians = ['ช่างคอมพิวเตอร์', 'ช่างระบบเครือข่าย', 'ช่างอาคาร'];
const statuses = new Set(['assigned', 'in_progress', 'completed']);
const fileExtensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };

fs.mkdirSync(uploadDir, { recursive: true });
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:8080' }));
app.use(express.json({ limit: '1mb' }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${fileExtensions[file.mimetype] || '.bin'}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (Object.hasOwn(fileExtensions, file.mimetype)) return cb(null, true);
    const error = new Error('อนุญาตเฉพาะไฟล์ JPG, PNG, WEBP หรือ PDF');
    error.statusCode = 400;
    cb(error);
  }
});

function hasValidFileSignature(file) {
  const bytes = fs.readFileSync(file.path);
  if (file.mimetype === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (file.mimetype === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (file.mimetype === 'application/pdf') return bytes.toString('ascii', 0, 5) === '%PDF-';
  return false;
}

const publicRequest = (row) => ({
  id: row.id, reporterName: row.reporter_name, location: row.location, category: row.category,
  title: row.title, description: row.description, photoUrl: row.photo_path,
  status: row.status, technician: row.technician, resolution: row.resolution,
  rating: row.rating, ratingComment: row.rating_comment,
  createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at
});

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'ok' }); }
  catch { res.status(503).json({ status: 'degraded', database: 'unavailable' }); }
});

app.get('/api/technicians', (_req, res) => res.json(technicians));

app.get('/api/requests', async (req, res, next) => {
  try {
    const values = [];
    let where = '';
    if (req.query.status) { values.push(req.query.status); where = 'WHERE status = $1'; }
    const { rows } = await pool.query(`SELECT * FROM repair_requests ${where} ORDER BY created_at DESC LIMIT 200`, values);
    res.json(rows.map(publicRequest));
  } catch (error) { next(error); }
});

app.post('/api/requests', upload.single('photo'), async (req, res, next) => {
  const { reporterName, location, category, title, description } = req.body;
  if (![reporterName, location, category, title, description].every((v) => typeof v === 'string' && v.trim())) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อ สถานที่ หมวดหมู่ หัวข้อ และรายละเอียดให้ครบ' });
  }
  if (!categories.has(category)) return res.status(400).json({ error: 'หมวดหมู่ไม่ถูกต้อง' });
  if (req.file) {
    try {
      if (!hasValidFileSignature(req.file)) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ error: 'เนื้อหาไฟล์ไม่ตรงกับชนิดไฟล์ที่อนุญาต' });
      }
    } catch (error) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return next(error);
    }
  }
  try {
    const photoPath = req.file ? `/uploads/${req.file.filename}` : null;
    const { rows } = await pool.query(
      `INSERT INTO repair_requests (reporter_name, location, category, title, description, photo_path)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [reporterName.trim(), location.trim(), category, title.trim(), description.trim(), photoPath]
    );
    res.status(201).json(publicRequest(rows[0]));
  } catch (error) {
    if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
    next(error);
  }
});

app.patch('/api/requests/:id/assignment', async (req, res, next) => {
  const { technician } = req.body;
  if (!technicians.includes(technician)) return res.status(400).json({ error: 'กรุณาเลือกช่างจากรายชื่อ' });
  try {
    const { rows } = await pool.query(
      `UPDATE repair_requests SET technician = $1, status = 'assigned', updated_at = NOW()
       WHERE id = $2 AND status <> 'completed' RETURNING *`, [technician, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบงาน หรือปิดงานแล้ว' });
    res.json(publicRequest(rows[0]));
  } catch (error) { next(error); }
});

app.patch('/api/requests/:id/status', async (req, res, next) => {
  const { status, resolution } = req.body;
  if (!statuses.has(status)) return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  if (status === 'completed' && !(typeof resolution === 'string' && resolution.trim())) {
    return res.status(400).json({ error: 'กรุณาบันทึกผลการซ่อมก่อนปิดงาน' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE repair_requests SET status = $1, resolution = COALESCE($2, resolution),
       updated_at = NOW(), completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
       WHERE id = $3 AND technician IS NOT NULL AND status <> 'completed' RETURNING *`,
      [status, resolution?.trim() || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบงานที่ได้รับมอบหมาย หรือปิดงานแล้ว' });
    res.json(publicRequest(rows[0]));
  } catch (error) { next(error); }
});

app.post('/api/requests/:id/rating', async (req, res, next) => {
  const rating = Number(req.body.rating);
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'คะแนนต้องอยู่ระหว่าง 1 ถึง 5' });
  try {
    const { rows } = await pool.query(
      `UPDATE repair_requests SET rating = $1, rating_comment = $2, updated_at = NOW()
       WHERE id = $3 AND status = 'completed' AND rating IS NULL RETURNING *`,
      [rating, comment || null, req.params.id]
    );
    if (!rows[0]) return res.status(409).json({ error: 'ให้คะแนนได้หลังปิดงาน และให้ได้ครั้งเดียว' });
    res.json(publicRequest(rows[0]));
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์แนบต้องมีขนาดไม่เกิน 5 MB' : 'อัปโหลดไฟล์ไม่สำเร็จ' });
  console.error(error);
  res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่' });
});

app.listen(port, '0.0.0.0', () => console.log(`FixFlow API listening on ${port}`));
