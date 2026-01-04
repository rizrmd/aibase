import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { AlertCircle } from "lucide-react";

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
  const [logoAvailable, setLogoAvailable] = useState(false);

  // Check if logo is available
  useEffect(() => {
    const img = new Image();
    img.src = "/logo.png";
    img.onload = () => setLogoAvailable(true);
    img.onerror = () => setLogoAvailable(false);
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
          {logoAvailable && (
            <img
              src="/logo.png"
              alt={import.meta.env.APP_NAME || "AI-BASE"}
              className="mx-auto mb-4 h-16 w-auto"
            />
          )}
          <h1 className="text-4xl font-bold tracking-tight">
            {import.meta.env.APP_NAME || "AI-BASE"}
          </h1>
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
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
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
