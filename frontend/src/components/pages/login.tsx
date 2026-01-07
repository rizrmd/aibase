import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { getAppName, getLogoUrl } from "@/lib/setup";

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  // Redirect authenticated users away from login page
  useEffect(() => {
    if (auth.isAuthenticated && !auth.isLoading) {
      navigate("/", { replace: true });
    }
  }, [auth.isAuthenticated, auth.isLoading, navigate]);

  // Form state
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [appName, setAppName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Load setup configuration
  useEffect(() => {
    Promise.all([getAppName(), getLogoUrl()]).then(([name, logo]) => {
      setAppName(name);
      setLogoUrl(logo);
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await auth.login(emailOrUsername, password);
    if (success) {
      // Redirect to projects page after successful login
      navigate("/");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="text-center">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={appName}
              className="mx-auto mb-4 h-16 w-auto"
              onError={() => {
                // Fallback to removing logo if it fails to load
                setLogoUrl(null);
              }}
            />
          )}
          {!logoUrl && (
            <h1 className="text-4xl font-bold tracking-tight">
              {appName}
            </h1>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to access your projects
          </p>
        </div>

        <div className="mt-8 space-y-6">
          {auth.error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Login Failed</AlertTitle>
              <AlertDescription>
                {auth.error === "Failed to fetch"
                  ? "Unable to connect to the server. Please check if the backend is running."
                  : auth.error}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emailOrUsername">Email or Username</Label>
              <Input
                id="emailOrUsername"
                type="text"
                placeholder="Enter your email or username"
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                required
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="sr-only">
                    {showPassword ? "Hide password" : "Show password"}
                  </span>
                </Button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={auth.isLoading}>
              {auth.isLoading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
