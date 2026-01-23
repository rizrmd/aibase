import { useState } from "react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Terminal,
    Copy,
    Play,
    Check,
    Code2,
    BookOpen,
    Send,
    Loader2
} from "lucide-react";
import { toast } from "sonner";
import { buildApiUrl } from "@/lib/base-path";

const API_BASE_URL = buildApiUrl("");

export function DeveloperAPIPage() {
    const [context, setContext] = useState("");
    const [prompt, setPrompt] = useState("");
    const [response, setResponse] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);

    const handleTest = async () => {
        if (!prompt) {
            toast.error("Prompt is required");
            return;
        }

        setIsLoading(true);
        setResponse(null);

        try {
            const res = await fetch(`${API_BASE_URL}/api/llm/completion`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt,
                    context: context || undefined,
                }),
            });

            const data = await res.json();
            setResponse(data);

            if (data.success) {
                toast.success("Completion successful");
            } else {
                toast.error(data.response || "Failed to get completion");
            }
        } catch (error) {
            console.error("API Error:", error);
            toast.error("Failed to connect to API");
        } finally {
            setIsLoading(false);
        }
    };

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopied(id);
        toast.success("Copied to clipboard");
        setTimeout(() => setCopied(null), 2000);
    };

    const curlExample = `curl -X POST ${API_BASE_URL}/api/llm/completion \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "${prompt || "Hello, how are you?"}",
    "context": "${context || "You are a helpful assistant"}"
  }'`;

    const jsExample = `const response = await fetch("${API_BASE_URL}/api/llm/completion", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    prompt: "${prompt || "Hello, how are you?"}",
    context: "${context || "You are a helpful assistant"}"
  })
});

const data = await response.json();
console.log(data.response);`;

    return (
        <div className="h-full overflow-auto bg-slate-50/50 dark:bg-slate-950/50">
            <div className="container max-w-5xl mx-auto p-6 space-y-8">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Terminal className="h-6 w-6 text-primary" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">API Reference</h1>
                    </div>
                    <p className="text-muted-foreground text-lg">
                        Integrate AI capabilities into your own applications using our one-shot LLM endpoint.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left Column: API Documentation */}
                    <div className="lg:col-span-7 space-y-6">
                        <Card className="border-none shadow-sm overflow-hidden bg-white dark:bg-slate-900">
                            <CardHeader className="border-b bg-slate-50/50 dark:bg-slate-800/50 pb-4">
                                <div className="flex items-center gap-2">
                                    <BookOpen className="h-5 w-5 text-primary" />
                                    <CardTitle>One-Shot Completion</CardTitle>
                                </div>
                                <CardDescription>
                                    Send a single prompt and get a full response without managing conversation state.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-6 space-y-6">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold rounded">POST</span>
                                        <code className="text-sm font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">/api/llm/completion</code>
                                    </div>

                                    <div className="space-y-3">
                                        <h4 className="text-sm font-semibold flex items-center gap-2 italic">
                                            <Code2 className="h-4 w-4" /> Request Body
                                        </h4>
                                        <div className="rounded-lg border overflow-hidden">
                                            <table className="w-full text-sm">
                                                <thead className="bg-slate-50 dark:bg-slate-800">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left font-medium">Field</th>
                                                        <th className="px-4 py-2 text-left font-medium">Type</th>
                                                        <th className="px-4 py-2 text-left font-medium">Required</th>
                                                        <th className="px-4 py-2 text-left font-medium">Description</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    <tr>
                                                        <td className="px-4 py-3 font-mono text-primary">prompt</td>
                                                        <td className="px-4 py-3 text-muted-foreground">string</td>
                                                        <td className="px-4 py-3 text-red-500">Yes</td>
                                                        <td className="px-4 py-3">The user instruction or question.</td>
                                                    </tr>
                                                    <tr>
                                                        <td className="px-4 py-3 font-mono text-primary">context</td>
                                                        <td className="px-4 py-3 text-muted-foreground">string</td>
                                                        <td className="px-4 py-3 text-muted-foreground">No</td>
                                                        <td className="px-4 py-3">Additional system instructions.</td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-2">
                                        <h4 className="text-sm font-semibold flex items-center gap-2 italic">
                                            <Play className="h-4 w-4" /> Usage Examples
                                        </h4>
                                        <Tabs defaultValue="curl" className="w-full">
                                            <TabsList className="grid w-full grid-cols-2">
                                                <TabsTrigger value="curl">cURL</TabsTrigger>
                                                <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                                            </TabsList>
                                            <TabsContent value="curl" className="relative">
                                                <pre className="p-4 bg-slate-950 text-slate-50 rounded-lg text-xs overflow-x-auto font-mono leading-relaxed">
                                                    {curlExample}
                                                </pre>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="absolute top-2 right-2 text-slate-400 hover:text-white"
                                                    onClick={() => copyToClipboard(curlExample, 'curl')}
                                                >
                                                    {copied === 'curl' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                                </Button>
                                            </TabsContent>
                                            <TabsContent value="javascript" className="relative">
                                                <pre className="p-4 bg-slate-950 text-slate-50 rounded-lg text-xs overflow-x-auto font-mono leading-relaxed">
                                                    {jsExample}
                                                </pre>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="absolute top-2 right-2 text-slate-400 hover:text-white"
                                                    onClick={() => copyToClipboard(jsExample, 'js')}
                                                >
                                                    {copied === 'js' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                                </Button>
                                            </TabsContent>
                                        </Tabs>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column: API Tester */}
                    <div className="lg:col-span-5 space-y-6">
                        <Card className="border-none shadow-md bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800">
                            <CardHeader className="pb-4">
                                <div className="flex items-center gap-2">
                                    <Play className="h-5 w-5 text-primary" />
                                    <CardTitle>API Playground</CardTitle>
                                </div>
                                <CardDescription>
                                    Test the endpoint directly from your browser.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="context" className="text-xs font-uppercase tracking-wider text-muted-foreground">Context (Optional)</Label>
                                    <Input
                                        id="context"
                                        placeholder="e.g. You are a professional chef..."
                                        value={context}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContext(e.target.value)}
                                        className="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="prompt" className="text-xs font-uppercase tracking-wider text-muted-foreground">Prompt</Label>
                                    <Textarea
                                        id="prompt"
                                        placeholder="e.g. How do I make a perfect sourdough bread?"
                                        rows={4}
                                        value={prompt}
                                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
                                        className="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 resize-none"
                                    />
                                </div>
                                <Button
                                    className="w-full shadow-lg shadow-primary/20"
                                    onClick={handleTest}
                                    disabled={isLoading || !prompt}
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="mr-2 h-4 w-4" />
                                            Run Request
                                        </>
                                    )}
                                </Button>

                                {response && (
                                    <div className="mt-6 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <Label className="text-xs font-uppercase tracking-wider text-muted-foreground">Response</Label>
                                        <div className="rounded-lg bg-slate-950 p-4 border border-slate-800 shadow-inner">
                                            <pre className="text-xs font-mono text-slate-50 whitespace-pre-wrap break-words leading-relaxed">
                                                {JSON.stringify(response, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
