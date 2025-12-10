import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const APP_PASSWORD = "Daddyfingers24";
const STORAGE_KEY = "kalamazoo_access";

interface PasswordGateProps {
  children: React.ReactNode;
}

export function PasswordGate({ children }: PasswordGateProps) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check if already authenticated
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') {
      setIsUnlocked(true);
    }
    setIsChecking(false);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password === APP_PASSWORD) {
      localStorage.setItem(STORAGE_KEY, 'true');
      setIsUnlocked(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  // Show nothing while checking localStorage
  if (isChecking) {
    return null;
  }

  if (isUnlocked) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <form onSubmit={handleSubmit} className="w-full max-w-xs px-4">
        <div className="space-y-4">
          <Input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(false);
            }}
            autoFocus
            className="text-center"
          />
          {error && (
            <p className="text-sm text-destructive text-center">
              Incorrect password.
            </p>
          )}
          <Button type="submit" className="w-full">
            Enter
          </Button>
        </div>
      </form>
    </div>
  );
}
