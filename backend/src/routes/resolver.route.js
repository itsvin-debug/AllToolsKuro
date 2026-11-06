import express from 'express';
import { resolveLinkController } from '../controllers/resolver.controller.js';

const router = express.Router();

// Mendukung POST dengan JSON body { url: "..." } dan GET ?url=...
router.post('/resolve', resolveLinkController);
router.get('/resolve', resolveLinkController);

export default router;
