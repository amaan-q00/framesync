import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { RegisterSchema, LoginSchema } from '../schemas/auth.schema';

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = RegisterSchema.parse(req.body);
    const result = await AuthService.register(validatedData);
    res.status(201).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = LoginSchema.parse(req.body);
    const result = await AuthService.login(validatedData);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};