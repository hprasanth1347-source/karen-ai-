declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: {
        id: string;
        email: string;
        role: 'owner' | 'admin' | 'user' | 'readonly';
        rbacRole?: 'CUSTOMER' | 'SUPPORT' | 'ADMIN' | 'OWNER';
      };
    }
  }
}

export {};
