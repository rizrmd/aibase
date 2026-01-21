import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Shield, Wrench } from "lucide-react";

/**
 * SetupRequired Component
 *
 * Displayed when the application requires initial setup (no tenants exist).
 * Shows a friendly message and redirects to the admin-setup page.
 */
export function SetupRequired() {
  const navigate = useNavigate();

  const goToSetup = () => {
    navigate("/admin-setup");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Wrench className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Welcome to AIBase</CardTitle>
            <CardDescription>
              Let's get your workspace set up
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Setup Required</AlertTitle>
              <AlertDescription className="text-sm">
                Before you can start using AIBase, you need to create your first tenant.
                This will be your organization's workspace.
              </AlertDescription>
            </Alert>

            <div className="space-y-3 rounded-lg bg-muted/50 p-4 text-sm">
              <p className="font-medium">During setup, you'll:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                <li>Verify your license key</li>
                <li>Create your first tenant (organization)</li>
                <li>Create an admin user account</li>
              </ul>
            </div>

            <Button
              onClick={goToSetup}
              className="w-full"
              size="lg"
            >
              Start Setup
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              This one-time setup will only take a few minutes
            </p>
          </CardContent>
        </Card>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          Need help? Check the documentation or contact your administrator
        </div>
      </div>
    </div>
  );
}
