declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: {
        id: string;
        email: string;
        role: 'owner' | 'admin' | 'user' | 'readonly';
      };
    }
  }
}

export {};
