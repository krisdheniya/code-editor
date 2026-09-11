import { Router, Response } from 'express';
import { registerUser, loginUser, getUserById } from '../services/auth.service';
import { validateRequest } from '../middleware/validate.middleware';
import { registerSchema, loginSchema } from '../schemas/auth.schema';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', validateRequest({ body: registerSchema }), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await registerUser(email, password);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

router.post('/login', validateRequest({ body: loginSchema }), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticateJwt, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const user = await getUserById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

export default router;
