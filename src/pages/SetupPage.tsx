import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const AUTHORIZED_EMAILS = [
  'santanagonsalves7@gmail.com',
  'ebonygonsalves01@gmail.com'
];

export default function SetupPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<string[]>([]);

  const createAccount = async (email: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`
      }
    });

    if (error) {
      if (error.message.includes('already registered')) {
        return { success: true, message: 'Already exists' };
      }
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Created' };
  };

  const handleSetup = async () => {
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    const results: string[] = [];

    for (const email of AUTHORIZED_EMAILS) {
      const result = await createAccount(email);
      if (result.success) {
        results.push(email);
        toast.success(`${email}: ${result.message}`);
      } else {
        toast.error(`${email}: ${result.message}`);
      }
    }

    setCreated(results);
    setLoading(false);

    if (results.length > 0) {
      toast.success('Setup complete! You can now sign in.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Account Setup</h1>
          <p className="text-muted-foreground mt-2">
            Create accounts for authorized users
          </p>
        </div>

        <div className="space-y-4 p-6 border rounded-lg bg-card">
          <div className="space-y-2">
            <Label>Accounts to create:</Label>
            <ul className="text-sm text-muted-foreground space-y-1">
              {AUTHORIZED_EMAILS.map(email => (
                <li key={email} className="flex items-center gap-2">
                  {created.includes(email) ? '✓' : '○'} {email}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password (same for both)</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </div>

          <Button 
            onClick={handleSetup} 
            disabled={loading || !password}
            className="w-full"
          >
            {loading ? 'Creating...' : 'Create Accounts'}
          </Button>

          {created.length > 0 && (
            <Button 
              variant="outline" 
              onClick={() => navigate('/auth')}
              className="w-full"
            >
              Go to Sign In
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
