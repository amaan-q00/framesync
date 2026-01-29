import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodIssue } from 'zod'; // Import ZodIssue type
import { AppError } from '../utils/appError';

export const globalErrorHandler = (
  err: Error, 
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      status: 'fail',
      message: 'Validation Error',
      errors: err.issues.map((e: ZodIssue) => ({ 
        field: e.path[0], 
        message: e.message 
      }))
    });
  }

  // Handle Trusted App Errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  }

  // Handle Unknown/System Errors
  console.error('UNEXPECTED ERROR:', err);
  return res.status(500).json({
    status: 'error',
    message: 'Internal Server Error'
  });
};