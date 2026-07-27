import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';

import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

const router = Router();

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'gallery');
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || mimeToExt(file.mimetype);
    const safeBase = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    cb(null, `${Date.now()}-${safeBase || 'image'}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new HttpError(400, 'Only JPEG, PNG, WebP, and GIF images are allowed'));
      return;
    }
    cb(null, true);
  },
});

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '';
  }
}

function imageDto(row: {
  id: string;
  url: string;
  fileName: string;
  description: string | null;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
  createdAt: Date;
  uploadedBy?: { id: string; name: string; email: string };
}) {
  return {
    id: row.id,
    url: row.url,
    fileName: row.fileName,
    description: row.description,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedById: row.uploadedById,
    createdAt: row.createdAt,
    uploadedBy: row.uploadedBy ?? undefined,
  };
}

const descriptionSchema = z.string().max(280).optional();

/** Public: list gallery images (newest first). */
router.get('/', async (_req, res, next) => {
  try {
    const images = await prisma.galleryImage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        url: true,
        description: true,
        createdAt: true,
      },
    });
    res.json({
      images: images.map((row) => ({
        id: row.id,
        url: row.url,
        description: row.description,
        createdAt: row.createdAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

/** Admin: upload one or more images (field name: `images`). */
router.post(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  upload.array('images', 12),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthedRequest;
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files?.length) {
        throw new HttpError(400, 'No images uploaded. Use form field "images".');
      }

      const descriptionRaw =
        typeof req.body?.description === 'string' ? req.body.description.trim() : '';
      const description = descriptionRaw ? descriptionSchema.parse(descriptionRaw) : undefined;

      const created = await prisma.$transaction(
        files.map((file) =>
          prisma.galleryImage.create({
            data: {
              url: `/uploads/gallery/${file.filename}`,
              fileName: file.originalname,
              description: description || null,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              uploadedById: userId,
            },
            include: {
              uploadedBy: { select: { id: true, name: true, email: true } },
            },
          }),
        ),
      );

      res.status(201).json({ images: created.map(imageDto) });
    } catch (e) {
      const files = req.files as Express.Multer.File[] | undefined;
      for (const file of files ?? []) {
        fs.unlink(file.path, () => {});
      }
      next(e);
    }
  },
);

/** Admin: delete a gallery image. */
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : '';
    if (!id) {
      throw new HttpError(400, 'Missing image id');
    }

    const existing = await prisma.galleryImage.findUnique({ where: { id } });
    if (!existing) {
      throw new HttpError(404, 'Image not found');
    }

    await prisma.galleryImage.delete({ where: { id } });

    const fileName = path.basename(existing.url);
    const filePath = path.join(UPLOAD_DIR, fileName);
    if (filePath.startsWith(UPLOAD_DIR)) {
      fs.unlink(filePath, () => {});
    }

    res.json({ ok: true, id });
  } catch (e) {
    next(e);
  }
});

export default router;
