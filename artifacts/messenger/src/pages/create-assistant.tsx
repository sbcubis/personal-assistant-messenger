import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateAssistant, getListAssistantsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft } from "lucide-react";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  instructions: z.string().optional(),
  avatarEmoji: z.string().optional(),
  provider: z.enum(["openai", "charlotte"]).default("openai"),
});

export default function CreateAssistant() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      instructions: "",
      avatarEmoji: "🤖",
      provider: "openai",
    },
  });

  const createAssistant = useCreateAssistant({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListAssistantsQueryKey() });
        setLocation(`/chat/${data.id}`);
      }
    }
  });

  function onSubmit(values: z.infer<typeof schema>) {
    createAssistant.mutate({ data: values });
  }

  const provider = form.watch("provider");

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      <header className="flex items-center px-2 pt-12 pb-4 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-10">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => setLocation("/")}>
          <ChevronLeft className="w-6 h-6 text-primary" />
        </Button>
        <h1 className="text-xl font-bold text-foreground ml-2">New Assistant</h1>
      </header>

      <div className="flex-1 p-6 overflow-y-auto">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-md mx-auto">
            <div className="flex justify-center mb-8">
              <div className="relative">
                <div className="w-24 h-24 bg-card rounded-full border-2 border-border shadow-sm flex items-center justify-center text-4xl overflow-hidden">
                  {provider === "charlotte" ? "👩‍💼" : form.watch("avatarEmoji")}
                </div>
              </div>
            </div>

            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground ml-1">Assistant Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-card border-border rounded-xl px-4 py-6 text-lg shadow-sm">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="openai">🤖 OpenAI (GPT-4o)</SelectItem>
                      <SelectItem value="charlotte">👩‍💼 Charlotte May (Superagent)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground ml-1">Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Travel Guide" className="bg-card border-border rounded-xl px-4 py-6 text-lg shadow-sm" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {provider !== "charlotte" && (
              <FormField
                control={form.control}
                name="avatarEmoji"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground ml-1">Avatar Emoji</FormLabel>
                    <FormControl>
                      <Input placeholder="🤖" className="bg-card border-border rounded-xl px-4 py-6 text-lg shadow-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {provider !== "charlotte" && (
              <FormField
                control={form.control}
                name="instructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground ml-1">Instructions & Personality</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="You are a helpful travel expert..." 
                        className="bg-card border-border rounded-xl px-4 py-4 min-h-[120px] text-base shadow-sm resize-none" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {provider === "charlotte" && (
              <div className="bg-card border border-border rounded-xl p-4 text-sm text-muted-foreground">
                Charlotte May is a live AI agent with memory, tools, and full context. No instructions needed — she already knows what to do.
              </div>
            )}

            <div className="pt-4">
              <Button type="submit" className="w-full py-6 rounded-xl text-lg font-medium shadow-md" disabled={createAssistant.isPending}>
                {createAssistant.isPending ? "Creating..." : "Create Assistant"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
