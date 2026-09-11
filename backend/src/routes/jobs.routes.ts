import { Router, Response } from 'express';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { jobIdParamSchema, jobQuerySchema } from '../schemas/job.schema';
import { getJobById, getJobHistory } from '../services/job.service';

const router = Router();

router.get('/', authenticateJwt, validateRequest({ query: jobQuerySchema }), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const { limit, offset } = req.query as any;
    const jobs = await getJobHistory(userId, Number(limit), Number(offset));
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticateJwt, validateRequest({ params: jobIdParamSchema }), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const job = await getJobById(id, userId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ job });
  } catch (err) {
    next(err);
  }
});

export default router;
