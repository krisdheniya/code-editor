import { Router, Response } from 'express';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { executeSchema } from '../schemas/execute.schema';
import { executeCode } from '../services/execution.service';

const router = Router();

router.post('/', authenticateJwt, validateRequest({ body: executeSchema }), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { language, code, mode } = req.body;
    const userId = req.user!.userId;

    const { job, result } = await executeCode(userId, language, code, mode);

    if (mode === 'repl') {
      res.status(200).json({
        jobId: job.id,
        status: job.status,
        result,
      });
    } else {
      res.status(202).json({
        jobId: job.id,
        status: job.status,
        message: 'Job enqueued for execution',
      });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
